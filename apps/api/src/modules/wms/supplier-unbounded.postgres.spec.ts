import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { warehouseKeeperPermissions, warehouseManagerPermissions, type WmsOperation } from "@field-sales-os/schemas";
import { wmsFixture, wmsPersistence, wmsUser } from "./wms-test-fixture";
import { WmsService } from "./wms.service";
import { WmsOperationsService } from "./wms-operations.service";
import { WmsCoreService } from "./wms-core.service";
import { AuditLogService } from "../audit-log/audit-log.service";

async function fixture(t: any, size: number) {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close()); await wmsFixture(db);
  await db.exec(`INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('a','wa','clerk-a'),('a','wa','actor-a');
    INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton,track_batches) VALUES('foreign-water','b','FOREIGN','Foreign water',6,false)`);
  await db.query(`INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton,track_batches)
      SELECT 'item-'||lpad(i::text,4,'0'),'a','WATER-'||lpad(i::text,4,'0'),'Synthetic water '||i,
        CASE WHEN i%3=0 THEN 24 WHEN i%3=1 THEN 12 ELSE 6 END,false FROM generate_series(1,$1::int) i`, [size]);
  const prisma = wmsPersistence(db), audit = new AuditLogService(prisma);
  let sql = 0;
  const instrumented = { ...prisma, $queryRaw: async (...args: any[]) => { sql++; return prisma.$queryRaw(...args); } };
  const core = new WmsService(instrumented, audit), ops = new WmsOperationsService(instrumented, core, audit);
  const returns = new WmsCoreService(instrumented, core);
  const keeper = { ...wmsUser("a", "clerk-a", "WAREHOUSE_KEEPER"), permissions: [...warehouseKeeperPermissions] };
  const manager = { ...wmsUser("a", "actor-a", "WAREHOUSE_MANAGER"), permissions: [...warehouseManagerPermissions] };
  const command = (operation: WmsOperation, input: any, actor: any = keeper) => ops.command(actor, "wa", { operation, input });
  const stepInput = (id: string, version: number) => ({ id, version, note: "Synthetic supplier workflow", idempotencyKey: randomUUID() });
  const rows = Array.from({ length: size }, (_, i) => ({ productId: `item-${String(i + 1).padStart(4, "0")}`,
    unit: "CARTON", expectedQuantity: "4", acceptedQuantity: "2", quarantinedQuantity: "1", rejectedQuantity: "1", rejectionReason: "Inspection and rejected carton" }));
  const create = () => ({ reference: randomUUID(), supplierName: "Synthetic water supplier", supplierReference: randomUUID(),
    note: "Synthetic complete supplier receipt", lines: rows.map(line => ({ ...line })), idempotencyKey: randomUUID() });
  async function measuredRead<T>(expected: number, work: () => Promise<T>) {
    sql = 0; const result = await work(); assert.equal(sql, expected, "complete document read SQL must not grow per line"); return result;
  }
  const stock = async () => (await db.query(`SELECT b.product_id,p.physical::text,p.quarantined::text,p.reserved::text,p.in_transit::text
    FROM wms_positions p JOIN wms_batches b ON b.company_id=p.company_id AND b.id=p.batch_id
    WHERE p.company_id='a' AND p.warehouse_id='wa' ORDER BY b.product_id`)).rows;
  return { db, ops, returns, keeper, manager, command, stepInput, create, measuredRead, stock };
}

for (const size of [21, 83, 1000]) test(`complete supplier documents: ${size} lines, exact stock, rollback, retry and constant read SQL`, { timeout: 110_000 }, async t => {
  const started = performance.now(), f = await fixture(t, size), body = f.create();
  const invalidCreate = { ...f.create(), lines: body.lines.map((line, i) => i === size - 1 ? { ...line, productId: "foreign-water" } : line) };
  await assert.rejects(f.command("receipt.create", invalidCreate), /WMS_PRODUCT_NOT_FOUND/);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_receipts")).rows[0].n, 0, "late create failure rolls back header and prior lines");
  const saved = await f.command("receipt.create", body);
  assert.deepEqual(await f.command("receipt.create", body), saved);
  let receipt = await f.measuredRead(4, () => f.ops.receipt(f.keeper, "wa", saved.id));
  assert.equal(receipt.lines.length, size); assert.equal((await f.stock()).length, 0, "draft is stock inert");

  const badEdit = { ...invalidCreate, id: saved.id, version: 1, idempotencyKey: randomUUID() };
  await assert.rejects(f.command("receipt.edit", badEdit), /WMS_PRODUCT_NOT_FOUND/);
  receipt = await f.ops.receipt(f.keeper, "wa", saved.id);
  assert.equal(receipt.version, 1); assert.equal(receipt.lines.length, size);
  const edit = { ...body, id: saved.id, version: 1, idempotencyKey: randomUUID(), lines: body.lines.map((line, i) => i === size - 1
    ? { ...line, acceptedQuantity: "2.5", quarantinedQuantity: "0.5" } : line) };
  const edited = await f.command("receipt.edit", edit); assert.deepEqual(await f.command("receipt.edit", edit), edited);
  assert.deepEqual(await f.command("receipt.create", body), saved, "old create replay remains stable after edit");
  receipt = await f.measuredRead(4, () => f.ops.receipt(f.keeper, "wa", saved.id)); assert.equal(receipt.lines.length, size);
  assert.equal(receipt.lines.find(line => line.productId === body.lines[size - 1]!.productId)!.acceptedQuantity, "2.500000");
  await f.command("receipt.submit", f.stepInput(saved.id, 2));
  await f.command("receipt.review", f.stepInput(saved.id, 3), f.manager);
  assert.equal((await f.stock()).length, 0, "submission/review remain stock inert");
  const approve = f.stepInput(saved.id, 4);
  const posted = await f.command("receipt.approve", approve, f.manager);
  assert.deepEqual(await f.command("receipt.approve", approve, f.manager), posted);
  const stockBeforeReturn = await f.stock(); assert.equal(stockBeforeReturn.length, size);
  for (const [i, position] of stockBeforeReturn.entries()) {
    const index = i + 1, factor = index % 3 === 0 ? 24 : index % 3 === 1 ? 12 : 6;
    assert.equal(position.physical, `${3 * factor}.000000`);
    assert.equal(position.quarantined, `${index === size ? factor / 2 : factor}.000000`);
    assert.equal(position.reserved, "0.000000"); assert.equal(position.in_transit, "0.000000");
  }
  const source = await f.measuredRead(3, () => f.returns.source(f.keeper, "wa", "SUPPLIER", saved.id));
  assert.equal(source.lines.length, size, "source must include lines beyond former 100-row cut-off");
  const returnLines = source.lines.map(line => ({ sourceLineId: line.sourceLineId, unit: "BASE", declaredQuantity: "1", actualQuantity: "1", quality: "GOOD", fromQuarantine: false }));
  const returnBody = () => ({ reference: randomUUID(), sourceId: saved.id, note: "Synthetic complete supplier return", lines: returnLines.map(line => ({ ...line })), idempotencyKey: randomUUID() });
  const invalidReturn = returnBody(); invalidReturn.lines[size - 1]!.sourceLineId = "foreign-or-missing-source";
  await assert.rejects(f.command("supplier.create", invalidReturn), /WMS_RETURN_LINE_NOT_FOUND/);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_returns")).rows[0].n, 0, "late return create rolls back all prior lines");

  const over = returnBody(); const lastSource = source.lines[size - 1]!;
  over.lines[size - 1]!.actualQuantity = over.lines[size - 1]!.declaredQuantity = String(Number(lastSource.sourceBase) + 1);
  const failed = await f.command("supplier.create", over);
  await f.command("supplier.submit", f.stepInput(failed.id, 1)); await f.command("supplier.review", f.stepInput(failed.id, 2), f.manager);
  await assert.rejects(f.command("supplier.post", f.stepInput(failed.id, 3), f.manager), /WMS_RETURN_EXCEEDS_SOURCE/);
  assert.deepEqual(await f.stock(), stockBeforeReturn, "late return post failure atomically restores earlier stock movements");
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_movements WHERE kind='SUPPLIER_RETURN'")).rows[0].n, 0);
  assert.equal((await f.returns.detail(f.keeper, "wa", failed.id)).status, "REVIEWED");

  const returnedBody = returnBody(), returned = await f.command("supplier.create", returnedBody);
  assert.deepEqual(await f.command("supplier.create", returnedBody), returned);
  assert.equal((await f.measuredRead(4, () => f.returns.detail(f.keeper, "wa", returned.id))).lines.length, size);
  await f.command("supplier.submit", f.stepInput(returned.id, 1)); await f.command("supplier.review", f.stepInput(returned.id, 2), f.manager);
  const postInput = f.stepInput(returned.id, 3), dispatched = await f.command("supplier.post", postInput, f.manager);
  assert.deepEqual(await f.command("supplier.post", postInput, f.manager), dispatched);
  const detail = await f.measuredRead(4, () => f.returns.detail(f.keeper, "wa", returned.id));
  assert.equal(detail.lines.length, size); assert.ok(detail.lines.every(line => line.destination === "SUPPLIER" && line.quantityBase === "1.000000"));
  const stockAfter = await f.stock();
  for (const [i, position] of stockAfter.entries()) {
    const factor = (i + 1) % 3 === 0 ? 24 : (i + 1) % 3 === 1 ? 12 : 6;
    assert.equal(position.physical, `${3 * factor - 1}.000000`); assert.equal(position.quarantined, stockBeforeReturn[i]!.quarantined);
  }
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_movements WHERE kind='RECEIPT'")).rows[0].n, size);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_movements WHERE kind='SUPPLIER_RETURN'")).rows[0].n, size);
  const remaining = await f.measuredRead(3, () => f.returns.source(f.keeper, "wa", "SUPPLIER", saved.id));
  assert.equal(remaining.lines.length, size);
  for (const line of remaining.lines) assert.equal(Number(line.remainingBase), Number(line.sourceBase) - 1);
  await assert.rejects(f.ops.receipt({ ...f.keeper, companyId: "b", userId: "actor-b" }, "wa", saved.id));
  await assert.rejects(f.returns.source(f.keeper, "wa2", "SUPPLIER", saved.id));
  t.diagnostic(JSON.stringify({ size, concurrency: 1, elapsedMs: Math.round(performance.now() - started), receiptReadSql: 4,
    supplierSourceReadSql: 3, returnDetailReadSql: 4, receiptBytes: Buffer.byteLength(JSON.stringify(receipt)), returnBytes: Buffer.byteLength(JSON.stringify(detail)) }));
});
