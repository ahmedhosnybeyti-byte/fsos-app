import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { warehouseManagerPermissions } from "@field-sales-os/schemas";
import { RolesGuard } from "../../common/guards/roles.guard";
import { SfaAccessGuard } from "../../common/guards/sfa-access.guard";
import { WarehouseBootstrapController } from "./warehouse-bootstrap.controller";
import { WarehouseBootstrapService } from "./warehouse-bootstrap.service";
import { WmsController } from "./wms.controller";
import { wmsFixture, wmsPersistence, wmsUser } from "./wms-test-fixture";
import { WmsService } from "./wms.service";
import { WmsCountService } from "./wms-count.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { countSeed } from "./wms-count-test-fixture";

const migration = (name: string) => readFileSync(resolve(__dirname, "../../../../../packages/database/prisma/migrations", name, "migration.sql"), "utf8");
const platform = { ...wmsUser("a", "platform", "SUPER_ADMIN"), companyId: null, permissions: ["platform.admin"] };
const manager = { ...wmsUser("a", "manager-a", "WAREHOUSE_MANAGER"), permissions: [...warehouseManagerPermissions] };
const creator = { ...wmsUser("a", "actor-a", "WAREHOUSE_KEEPER"), permissions: ["sfa.access", "wms.read", "wms.count.create", "wms.count.approve"] };
const input = { managerUserId: "manager-a", reason: "Approved first warehouse assignment" };

async function fixture(t: any, enforce = true) {
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE, "Isolated SQL runtime required; no skip");
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  await wmsFixture(db);
  await db.exec(migration("20261021200000_wms_physical_counts"));
  await db.exec(countSeed);
  await db.exec(`CREATE TABLE roles(id text PRIMARY KEY,code text UNIQUE);
    INSERT INTO roles VALUES('platform','SUPER_ADMIN'),('manager','WAREHOUSE_MANAGER'),('keeper','WAREHOUSE_KEEPER');
    ALTER TABLE users ADD COLUMN role_id text REFERENCES roles(id); UPDATE users SET role_id='keeper';
    ALTER TABLE companies ADD COLUMN status text DEFAULT 'ACTIVE';
    ALTER TABLE companies ADD COLUMN feature_access jsonb DEFAULT '{"warehouse-core":"ENABLED"}';
    CREATE TABLE company_operating_settings(company_id text PRIMARY KEY,operating_mode text);
    INSERT INTO company_operating_settings VALUES('a','SFA'),('b','SFA');
    INSERT INTO users(id,company_id,status,full_name,role_id) VALUES('platform',NULL,'ACTIVE','Synthetic platform','platform'),
      ('manager-a','a','ACTIVE','Synthetic manager A','manager'),('manager-b','b','ACTIVE','Synthetic manager B','manager');
    INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('a','wa','actor-a');`);
  const enforcePolicy = () => db.exec(migration("20261026180000_wms_count_separate_approver"));
  if (enforce) await enforcePolicy();
  const make = (fail = false) => {
    const p = wmsPersistence(db, fail), audit = new AuditLogService(p), access = new WmsService(p, audit);
    return { bootstrap: new WarehouseBootstrapService(p, audit), counts: new WmsCountService(p, access, audit) };
  };
  return { db, make, enforcePolicy, ...make() };
}

test("platform bootstrap is a narrow authenticated route, never a global SFA bypass", async () => {
  const r = new Reflector(), roles = new RolesGuard(r, { record: async () => {} } as never);
  const request = (user: any, controller: any = WarehouseBootstrapController, handler: any = WarehouseBootstrapController.prototype.assign) => ({
    getClass: () => controller, getHandler: () => handler, switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never);
  assert.equal(await roles.canActivate(request(platform)), true);
  for (const roleCode of ["COMPANY_ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "WAREHOUSE_KEEPER"]) await assert.rejects(roles.canActivate(request({ ...platform, roleCode })), ForbiddenException);
  const sfa = new SfaAccessGuard(r, {} as never);
  assert.equal(await sfa.canActivate(request(platform)), true);
  await assert.rejects(sfa.canActivate(request(platform, WmsController, WmsController.prototype.access)), ForbiddenException);
});

test("bootstrap verifies persisted identity, exact tenant/warehouse/manager, is first-assignment-only and audited", async t => {
  const { db, bootstrap } = await fixture(t);
  await assert.rejects(bootstrap.assign({ ...platform, roleCode: "COMPANY_ADMIN" }, "a", "wa", input), ForbiddenException);
  await assert.rejects(bootstrap.assign({ ...platform, userId: "actor-a" }, "a", "wa", input), ForbiddenException);
  await assert.rejects(bootstrap.assign(platform, "a", "wb", input), NotFoundException);
  await assert.rejects(bootstrap.assign(platform, "a", "wa", { ...input, managerUserId: "manager-b" }), NotFoundException);
  await assert.rejects(bootstrap.assign(platform, "a", "wa", { ...input, managerUserId: "actor-a" }), NotFoundException);
  await assert.rejects(bootstrap.assign(platform, "a", "wa", { ...input, companyId: "b" }), BadRequestException);
  await db.exec(`UPDATE company_operating_settings SET operating_mode='ANALYSIS_ONLY' WHERE company_id='a'`);
  await assert.rejects(bootstrap.assign(platform, "a", "wa", input), ForbiddenException);
  await db.exec(`UPDATE company_operating_settings SET operating_mode='SFA' WHERE company_id='a'; UPDATE companies SET feature_access='{}' WHERE id='a'`);
  await assert.rejects(bootstrap.assign(platform, "a", "wa", input), ForbiddenException);
  await db.exec(`UPDATE companies SET feature_access='{"warehouse-core":"ENABLED"}' WHERE id='a'`);
  assert.deepEqual(await bootstrap.assign(platform, "a", "wa", input), { granted: true, alreadyAssigned: false });
  assert.deepEqual(await bootstrap.assign(platform, "a", "wa", input), { granted: true, alreadyAssigned: true });
  await assert.rejects(bootstrap.assign(platform, "a", "wa2", input), ConflictException);
  assert.deepEqual((await db.query(`SELECT company_id,warehouse_id FROM wms_warehouse_access WHERE user_id='manager-a'`)).rows, [{ company_id: "a", warehouse_id: "wa" }]);
  assert.equal((await db.query(`SELECT count(*)::int n FROM test_audit WHERE action='wms.manager.bootstrap'`)).rows[0].n, 1);
});

test("bootstrap audit failure rolls back assignment and disabled platform/target identities cannot act", async t => {
  const { db, bootstrap, make } = await fixture(t);
  await assert.rejects(make(true).bootstrap.assign(platform, "a", "wa", input), /synthetic audit failure/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_warehouse_access WHERE user_id='manager-a'`)).rows[0].n, 0);
  await db.exec(`UPDATE users SET status='DISABLED' WHERE id='manager-a'`);
  await assert.rejects(bootstrap.assign(platform, "a", "wa", input), NotFoundException);
  await db.exec(`UPDATE users SET status='ACTIVE' WHERE id='manager-a'; UPDATE users SET status='DISABLED' WHERE id='platform'`);
  await assert.rejects(bootstrap.assign(platform, "a", "wa", input), ForbiddenException);
});

test("new self-approval is rejected at SQL level with atomic stock/audit rollback; legacy documents remain unchanged", async t => {
  const { db, counts, enforcePolicy, bootstrap, make } = await fixture(t, false);
  const draft = async (quantity: string) => {
    const pos = (await counts.candidates(creator, "wa", {})).items.find(p => p.batchId === "lot")!;
    return counts.command(creator, "wa", "CREATE", { reference: randomUUID(), reason: "Measured physical count", idempotencyKey: randomUUID(),
      lines: [{ batchId: "lot", revision: pos.revision, countedQuantity: quantity, unit: "CARTON" }] });
  };
  const step = () => ({ version: 1, reason: "Review measured adjustment", idempotencyKey: randomUUID() });
  // Historical generic-role authority predates separation. The current keeper
  // profile must not regain approval merely to construct this legacy fixture.
  const legacy = await draft("199"); await counts.command({ ...creator, roleCode: "MANAGER" }, "wa", "APPROVE", step(), legacy.id);
  await enforcePolicy();
  assert.equal((await db.query(`SELECT created_by=approved_by AS unchanged FROM wms_counts WHERE id=$1`, [legacy.id])).rows[0].unchanged, true);
  const doc = await draft("198"), approval = step();
  await assert.rejects(counts.command(creator, "wa", "APPROVE", approval, doc.id), ForbiddenException);
  await assert.rejects(db.query(`SELECT wms_count_execute('a','wa','APPROVE',$1::jsonb,'actor-a',$2,$3)`, [JSON.stringify({ ...approval, id: doc.id }), randomUUID(), randomUUID()]), /WMS_COUNT_SEPARATE_APPROVER/);
  assert.equal((await db.query(`SELECT physical::text FROM wms_positions WHERE company_id='a' AND warehouse_id='wa' AND batch_id='lot'`)).rows[0].physical, "2388.000000");
  assert.equal((await db.query(`SELECT status FROM wms_counts WHERE id=$1`, [doc.id])).rows[0].status, "DRAFT");
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_movements WHERE kind='ADJUSTMENT'`)).rows[0].n, 1);
  await bootstrap.assign(platform, "a", "wa", input);
  await assert.rejects(make(true).counts.command(manager, "wa", "APPROVE", approval, doc.id), /synthetic audit failure/);
  await counts.command(manager, "wa", "APPROVE", approval, doc.id);
  await counts.command(manager, "wa", "APPROVE", approval, doc.id);
  const actors = (await db.query(`SELECT created_by,approved_by FROM wms_counts WHERE id=$1`, [doc.id])).rows[0];
  assert.equal(actors.created_by, creator.userId); assert.equal(actors.approved_by, manager.userId);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_movements WHERE kind='ADJUSTMENT'`)).rows[0].n, 2);
  assert.equal((await db.query(`SELECT count(*)::int n FROM test_audit WHERE action='wms.count.approve'`)).rows[0].n, 2);
});
