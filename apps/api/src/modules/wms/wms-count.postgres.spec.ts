import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { wmsFixture, wmsPersistence, wmsUser } from "./wms-test-fixture";
import { WmsService } from "./wms.service";
import { WmsCountService } from "./wms-count.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { countMigration, countSeed } from "./wms-count-test-fixture";
const user = { ...wmsUser(), permissions: [...wmsUser().permissions, "wms.count.create", "wms.count.approve"] };
async function fixture(t: any) {
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE, "Isolated PostgreSQL runtime required; no skip");
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!); const db = new PGlite(); t.after(() => db.close());
  await wmsFixture(db); await db.exec(readFileSync(countMigration, "utf8")); await db.exec(countSeed);
  const make = (fail = false) => { const p = wmsPersistence(db, fail), a = new AuditLogService(p); return new WmsCountService(p, new WmsService(p, a), a); };
  const s = make();
  const draft = async (quantity = "197", lines?: any[]) => { const c = (await s.candidates(user, "wa", {})).items.find(l => l.batchId === "lot")!;
    return { reference: randomUUID(), reason: "Physical warehouse stocktake", idempotencyKey: randomUUID(), lines: lines ?? [{ batchId: c.batchId, revision: c.revision, countedQuantity: quantity, unit: "CARTON" }] }; };
  const step = (version = 1) => ({ version, reason: "Verified actual count difference", idempotencyKey: randomUUID() });
  const physical = async () => (await db.query("SELECT physical::text FROM wms_positions WHERE company_id='a' AND warehouse_id='wa' AND batch_id='lot'")).rows[0].physical;
  return { db, s, make, draft, step, physical };
}

test("Count 200→197 cartons: draft is inert, approval posts one exact -3 movement and durable audit, retries are inert", async t => {
  const f = await fixture(t), input = await f.draft(), d = await f.s.command(user, "wa", "CREATE", input);
  assert.deepEqual(await f.s.command(user, "wa", "CREATE", input), d); assert.equal(await f.physical(), "2400.000000");
  const detail = await f.s.detail(user, "wa", d.id); assert.equal(detail.lines[0]!.shortage, "3.000000"); assert.equal(detail.lines[0]!.surplus, "0.000000");
  const cmd = f.step(), first = await f.s.command(user, "wa", "APPROVE", cmd, d.id);
  assert.deepEqual(await f.s.command(user, "wa", "APPROVE", cmd, d.id), first);
  await assert.rejects(f.s.command(user, "wa", "APPROVE", f.step(), d.id), /WMS_DOCUMENT_STALE/);
  assert.equal(await f.physical(), "2364.000000");
  const movements = (await f.db.query("SELECT kind,quantity::text,input_quantity::text,input_unit,conversion_factor,reason FROM wms_movements")).rows;
  assert.equal(movements.length, 1); assert.equal(movements[0].kind, "ADJUSTMENT"); assert.equal(movements[0].quantity, "-36.000000");
  assert.equal(movements[0].input_quantity, "-3.000000"); assert.equal(movements[0].input_unit, "CARTON"); assert.equal(movements[0].conversion_factor, 12);
  assert.equal(movements[0].reason, cmd.reason);
  const posted = await f.s.detail(user, "wa", d.id); assert.equal(posted.approvedBy, "Admin A"); assert.equal(posted.events.length, 2); assert.ok(posted.lines[0]!.movementId);
  assert.equal((await f.db.query("SELECT quantity::text FROM wms_custody_positions")).rows[0].quantity, "360.000000");
  assert.equal((await f.db.query("SELECT count(*)::int n FROM test_audit")).rows[0].n, 2);
  await assert.rejects(f.s.command(user, "wa", "CANCEL", f.step(2), d.id), /WMS_DOCUMENT_STALE/);
  for (const query of ["UPDATE wms_counts SET reason='edited'", "DELETE FROM wms_count_lines", "UPDATE wms_count_events SET reason='edited'", "DELETE FROM wms_movements"])
    await assert.rejects(f.db.exec(query), /WMS_LEDGER_IMMUTABLE/);
});

test("Count tenant/resource scope, operation permissions, bounded reads and input constraints", async t => {
  const f = await fixture(t), input = await f.draft(), reader = { ...user, permissions: ["sfa.access", "wms.read"] };
  for (const op of ["CREATE", "APPROVE", "CANCEL"] as const)
    await assert.rejects(f.s.command(reader, "wa", op, op === "CREATE" ? input : f.step(), "missing"), ForbiddenException);
  for (const actor of [wmsUser("b", "actor-b"), { ...user, roleCode: "SUPERVISOR" as const }])
    await assert.rejects(f.s.candidates(actor, "wa", {}), NotFoundException);
  const d = await f.s.command(user, "wa", "CREATE", input);
  await assert.rejects(f.s.detail(user, "wa2", d.id), NotFoundException);
  await assert.rejects(f.s.command(user, "wa2", "APPROVE", f.step(), d.id), /WMS_DOCUMENT_NOT_FOUND/);
  await assert.rejects(f.s.command(user, "wb", "CREATE", input), NotFoundException);
  for (const countedQuantity of ["-1", "1.0000001", "1e3", "NaN", "1000000000000"])
    await assert.rejects(f.s.command(user, "wa", "CREATE", { ...input, lines: [{ ...input.lines[0], countedQuantity }] }), BadRequestException);
  await assert.rejects(f.s.command(user, "wa", "CREATE", { ...input, companyId: "b" }), BadRequestException);
  await assert.rejects(f.s.command(user, "wa", "CREATE", { ...input, lines: [...input.lines, ...input.lines] }), BadRequestException);
  await assert.rejects(f.s.command(user, "wa", "CREATE", { ...input, idempotencyKey: randomUUID(), reference: randomUUID(), lines: [{ ...input.lines[0], countedQuantity: "0.000001" }] }), /WMS_FRACTIONAL_PIECE/);
  assert.equal((await f.s.candidates(user, "wa", { search: "unmatched" })).items.length, 0);
  await f.db.exec(`INSERT INTO wms_batches(id,company_id,product_id,code) SELECT 'extra-'||n,'a','p','EXTRA-'||n FROM generate_series(1,25) n;
    INSERT INTO wms_positions(company_id,warehouse_id,batch_id) SELECT 'a','wa','extra-'||n FROM generate_series(1,25) n;`);
  const page = await f.s.candidates(user, "wa", {}); assert.equal(page.items.length, 20); assert.equal(page.hasMore, true);
});

test("Count stale snapshots reject at save/approve including ABA; a cancelled draft never changes stock", async t => {
  const f = await fixture(t), input = await f.draft(), d = await f.s.command(user, "wa", "CREATE", input);
  await f.db.exec("UPDATE wms_positions SET physical=physical+12 WHERE batch_id='lot'; UPDATE wms_positions SET physical=physical-12 WHERE batch_id='lot'");
  await assert.rejects(f.s.command(user, "wa", "APPROVE", f.step(), d.id), /WMS_COUNT_STALE/);
  await assert.rejects(f.s.command(user, "wa", "CREATE", { ...input, reference: randomUUID(), idempotencyKey: randomUUID() }), /WMS_COUNT_STALE/);
  await f.s.command(user, "wa", "CANCEL", f.step(), d.id); assert.equal(await f.physical(), "2400.000000");
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_movements")).rows[0].n, 0);
});

test("Count atomic audit failure and multi-lot failure roll all effects back; conflicting retries cannot change payload", async t => {
  const f = await fixture(t), input = await f.draft(), d = await f.s.command(user, "wa", "CREATE", input), cmd = f.step();
  await assert.rejects(f.make(true).command(user, "wa", "APPROVE", cmd, d.id), /synthetic audit failure/);
  assert.equal(await f.physical(), "2400.000000"); assert.equal((await f.s.detail(user, "wa", d.id)).status, "DRAFT");
  await f.s.command(user, "wa", "APPROVE", cmd, d.id);
  await assert.rejects(f.s.command(user, "wa", "APPROVE", { ...cmd, reason: "Different content on same key" }, d.id), /WMS_IDEMPOTENCY_CONFLICT/);
  const rows = (await f.s.candidates(user, "wa", {})).items;
  const multi = await f.s.command(user, "wa", "CREATE", await f.draft("0", rows.map(c => ({ batchId: c.batchId, revision: c.revision, countedQuantity: "0", unit: "BASE" }))));
  await f.db.exec("UPDATE wms_positions SET physical=physical WHERE batch_id='lot2'");
  await assert.rejects(f.s.command(user, "wa", "APPROVE", f.step(), multi.id), /WMS_COUNT_STALE/);
  assert.equal(await f.physical(), "2364.000000"); assert.equal((await f.s.detail(user, "wa", multi.id)).status, "DRAFT");
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_movements")).rows[0].n, 1);
});

test("Count zero/surplus/exact match, reserved/hold boundaries, and expired or blocked surplus remains quarantined", async t => {
  const f = await fixture(t);
  await f.db.exec("UPDATE wms_positions SET reserved=12,quarantined=12 WHERE batch_id='lot'");
  const short = await f.s.command(user, "wa", "CREATE", await f.draft("0"));
  await assert.rejects(f.s.command(user, "wa", "APPROVE", f.step(), short.id), /WMS_COUNT_COMMITTED_STOCK/);
  await f.db.exec("UPDATE wms_positions SET reserved=0,quarantined=0,quality_blocked=true WHERE batch_id='lot'");
  const surplus = await f.s.command(user, "wa", "CREATE", await f.draft("201")); await f.s.command(user, "wa", "APPROVE", f.step(), surplus.id);
  assert.equal((await f.db.query("SELECT quarantined::text FROM wms_positions WHERE batch_id='lot'")).rows[0].quarantined, "12.000000");
  const same = await f.s.command(user, "wa", "CREATE", await f.draft("201")); await f.s.command(user, "wa", "APPROVE", f.step(), same.id);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_movements")).rows[0].n, 1);
  await f.db.exec("UPDATE wms_positions SET quarantined=0,quality_blocked=false WHERE batch_id='lot'");
  const zero = await f.s.command(user, "wa", "CREATE", await f.draft("0")); await f.s.command(user, "wa", "APPROVE", f.step(), zero.id); assert.equal(await f.physical(), "0.000000");
  await f.db.exec("UPDATE wms_batches SET expiry_date='2000-01-01' WHERE id='lot2'");
  const c = (await f.s.candidates(user, "wa", {})).items.find(c => c.batchId === "lot2")!;
  const exp = await f.s.command(user, "wa", "CREATE", await f.draft("0", [{ batchId: c.batchId, revision: c.revision, countedQuantity: "11", unit: "CARTON" }])); await f.s.command(user, "wa", "APPROVE", f.step(), exp.id);
  assert.equal((await f.db.query("SELECT quarantined::text FROM wms_positions WHERE batch_id='lot2'")).rows[0].quarantined, "12.000000");
});
