import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { warehouseManagerPermissions, type WmsOperation } from "@field-sales-os/schemas";
import { wmsFixture, wmsPersistence, wmsUser } from "./wms-test-fixture";
import { supplierMasterFixture, supplierWaterFixture } from "./supplier-master-test-fixture";
import { WmsService } from "./wms.service";
import { WmsOperationsService } from "./wms-operations.service";
import { WmsCoreService } from "./wms-core.service";
import { AuditLogService } from "../audit-log/audit-log.service";

async function fixture(t: any) {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite();
  t.after(() => db.close());
  await wmsFixture(db);
  const master = await supplierMasterFixture(db);
  const supplier = await supplierWaterFixture(master.service, master.user);
  const prisma = wmsPersistence(db), audit = new AuditLogService(prisma);
  const core = new WmsService(prisma, audit), ops = new WmsOperationsService(prisma, core, audit);
  const returns = new WmsCoreService(prisma, core);
  const keeper = { ...master.user, permissions: [...master.user.permissions, "wms.supplier-return.create"] };
  const manager = { ...wmsUser("a", "actor-a", "WAREHOUSE_MANAGER"), permissions: [...warehouseManagerPermissions] };
  await db.exec(`INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES ('a','wa','actor-a') ON CONFLICT DO NOTHING;
    INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton,track_batches) VALUES
      ('water12','a','WATER12','مياه 12 عبوة',12,true),('water6','a','WATER6','مياه 6 عبوات',6,true);`);
  const command = (operation: WmsOperation, input: any, actor: any = keeper, warehouse = "wa") =>
    ops.command(actor, warehouse, { operation, input: { idempotencyKey: randomUUID(), ...input } });
  const step = async (operation: WmsOperation, id: string, actor: any = keeper) => {
    const doc = operation.startsWith("receipt.") ? await ops.receipt(actor, "wa", id) : await returns.detail(actor, "wa", id);
    return command(operation, { id, version: doc.version, note: "Isolated water delivery inspection" }, actor);
  };
  const line = (productId = "water12", expected = "29", accepted = "26") => ({
    productId, batchCode: randomUUID(), unit: "BASE", expectedQuantity: expected,
    acceptedQuantity: accepted, quarantinedQuantity: "2", rejectedQuantity: "1",
    rejectionReason: "Two held for inspection; one rejected",
  });
  const receipt = (extra: any = {}) => ({ reference: randomUUID(), supplierId: supplier.id,
    supplierName: supplier.name, supplierReference: "WATER-INVOICE-1", documentDate: "2026-10-27",
    lines: [line(), line("water6", "17", "14")], note: "Synthetic water receiving only",
    idempotencyKey: randomUUID(), ...extra });
  const stock = async (productId = "water12") => (await core.products(keeper, "wa", {})).items.find(p => p.id === productId)!;
  return { db, master, supplier, prisma, audit, core, ops, returns, keeper, manager, command, step, line, receipt, stock };
}

test("supplier receiving: create supplier, inert draft/edit/submit/review, manager posting, source-linked return", async t => {
  const f = await fixture(t), create = f.receipt();
  const r = await f.command("receipt.create", create);
  assert.equal((await f.stock()).physical, "0.000000");
  assert.equal((await f.ops.receipt(f.keeper, "wa", r.id)).supplierId, f.supplier.id);
  assert.equal((await f.ops.receipt(f.keeper, "wa", r.id)).documentDate, "2026-10-27");
  const edit = { ...create, id: r.id, version: 1, documentDate: "2026-10-28", idempotencyKey: randomUUID() };
  await f.command("receipt.edit", edit);
  assert.deepEqual(await f.command("receipt.create", create), r);
  assert.equal((await f.ops.receipt(f.keeper, "wa", r.id)).documentDate, "2026-10-28", "old replay must not overwrite newer metadata");
  const editAgain = { ...edit, version: 2, documentDate: "2026-10-29", idempotencyKey: randomUUID() };
  await f.command("receipt.edit", editAgain);
  await f.command("receipt.edit", edit);
  assert.equal((await f.ops.receipt(f.keeper, "wa", r.id)).documentDate, "2026-10-29", "old edit replay must preserve latest metadata");
  await assert.rejects(f.command("receipt.edit", { ...edit, idempotencyKey: randomUUID() }), /STALE/);
  await assert.rejects(f.command("receipt.create", { ...create, documentDate: "2026-10-29" }), /IDEMPOTENCY_CONFLICT/);
  await f.step("receipt.submit", r.id);
  await assert.rejects(f.step("receipt.review", r.id), ForbiddenException);
  await f.step("receipt.review", r.id, f.manager);
  assert.equal((await f.stock()).physical, "0.000000");
  await assert.rejects(f.step("receipt.approve", r.id), ForbiddenException);
  await f.step("receipt.approve", r.id, f.manager);
  const a = await f.stock(), b = await f.stock("water6");
  assert.equal(a.physical, "28.000000"); assert.equal(a.available, "26.000000"); assert.equal(a.quarantined, "2.000000");
  assert.equal(b.physical, "16.000000"); assert.equal(b.available, "14.000000");
  const src = await f.returns.source(f.keeper, "wa", "SUPPLIER", r.id);
  const chosen = src.lines.find(l => l.productId === "water12")!;
  const returned = await f.command("supplier.create", { reference: randomUUID(), sourceId: r.id,
    note: "Return one carton and one piece to water supplier", lines: [{ sourceLineId: chosen.sourceLineId,
      unit: "BASE", declaredQuantity: "13", actualQuantity: "13", quality: "GOOD", fromQuarantine: false }] });
  assert.equal((await f.stock()).physical, "28.000000");
  await f.step("supplier.submit", returned.id); await f.step("supplier.review", returned.id, f.manager);
  assert.equal((await f.stock()).physical, "28.000000");
  await f.step("supplier.post", returned.id, f.manager);
  assert.equal((await f.stock()).physical, "15.000000");
  assert.equal((await f.returns.detail(f.keeper, "wa", returned.id)).sourceId, r.id);
  await assert.rejects(f.returns.source({ ...f.keeper, companyId: "b", userId: "actor-b" }, "wa", "SUPPLIER", r.id), NotFoundException);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_movements WHERE kind='SUPPLIER_RETURN'")).rows[0].n, 1);
});

test("supplier receiving metadata rejects foreign suppliers and forged names; audit failure rolls back document and metadata", async t => {
  const f = await fixture(t);
  await f.db.query("INSERT INTO wms_suppliers(id,company_id,code,name,idempotency_key) VALUES($1,$2,$3,$4,$5)",
    ["foreign-water-supplier", "b", "WATER-FOREIGN", "Foreign synthetic supplier", randomUUID()]);
  await assert.rejects(f.command("receipt.create", f.receipt({ supplierId: "foreign-water-supplier" })));
  await assert.rejects(f.command("receipt.create", f.receipt({ supplierName: "Forged supplier identity" })));
  const bad = wmsPersistence(f.db, true), audit = new AuditLogService(bad);
  const broken = new WmsOperationsService(bad, new WmsService(bad, audit), audit);
  await assert.rejects(broken.command(f.keeper, "wa", { operation: "receipt.create", input: f.receipt() }), /synthetic audit failure/);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_receipts")).rows[0].n, 0);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_receipt_supplier_metadata")).rows[0].n, 0);
  assert.equal((await f.stock()).physical, "0.000000");
});

test("receiving product search supports registered Arabic/English aliases and literal special characters with company isolation", async t => {
  const f = await fixture(t);
  await f.db.query("INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data) VALUES($1,$2,$3,$4::jsonb)",
    ["a", "Products", "WATER12", JSON.stringify({ ProductNameEn: "Natural Drinking Water", ProductNameAr: "ماء نقي",
      AlternateNames: ["AquaPure 12", "100%_Water"], Aliases: "Blue spring" })]);
  await f.db.query("INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data) VALUES($1,$2,$3,$4::jsonb)",
    ["b", "Products", "WATER6", JSON.stringify({ ProductNameEn: "Foreign exclusive alias" })]);
  for (const search of ["Drinking Water", "ماء نقي", "AquaPure", "100%_Water", "Blue spring"]) {
    const found = await f.core.products(f.keeper, "wa", { search });
    assert.deepEqual(found.items.map(p => p.id), ["water12"], search);
    assert.equal(found.hasMore, false);
  }
  assert.equal((await f.core.products(f.keeper, "wa", { search: "Foreign exclusive alias" })).items.length, 0);
  assert.equal((await f.core.products(f.keeper, "wa", { search: "100XWater" })).items.length, 0);
});
