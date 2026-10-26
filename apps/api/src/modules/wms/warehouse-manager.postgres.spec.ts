import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { warehouseManagerPermissions } from "@field-sales-os/schemas";
import { wmsFixture, wmsPersistence, wmsUser } from "./wms-test-fixture";
import { WmsService } from "./wms.service";
import { WmsOperationsService } from "./wms-operations.service";
import { WmsCountService } from "./wms-count.service";
import { WarehouseManagementService } from "./warehouse-management.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { countSeed } from "./wms-count-test-fixture";

const migration = (name: string) => readFileSync(resolve(__dirname, "../../../../../packages/database/prisma/migrations", name, "migration.sql"), "utf8");
const roleMigration = () => migration("20261026170000_warehouse_manager_role");
const manager = { ...wmsUser("a", "manager-a", "WAREHOUSE_MANAGER"), permissions: [...warehouseManagerPermissions] };
const keeper = { ...wmsUser("a", "actor-a", "WAREHOUSE_KEEPER"), permissions: ["sfa.access", "wms.read", "wms.receiving.create", "wms.count.create"] };

async function fixture(t: any) {
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE, "Isolated PostgreSQL runtime is required; no skip");
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  await wmsFixture(db);
  await db.exec(migration("20261021200000_wms_physical_counts"));
  await db.exec(`CREATE TABLE roles(id text PRIMARY KEY,code text UNIQUE,name text,description text,"isSystem" boolean DEFAULT true,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
    CREATE TABLE company_operating_settings(company_id text PRIMARY KEY,operating_mode text);
    INSERT INTO company_operating_settings VALUES('a','SFA'),('b','SFA');
    CREATE TABLE role_permissions(role_id text REFERENCES roles(id),permission_id text REFERENCES permissions(id),PRIMARY KEY(role_id,permission_id));
    ALTER TABLE users ADD COLUMN role_id text REFERENCES roles(id);
    ALTER TABLE companies ADD COLUMN status text DEFAULT 'ACTIVE';
    ALTER TABLE companies ADD COLUMN feature_access jsonb DEFAULT '{"warehouse-core":"ENABLED"}';
    INSERT INTO roles(id,code,name) VALUES('keeper','WAREHOUSE_KEEPER','Keeper'),('general','MANAGER','Manager'),('admin','COMPANY_ADMIN','Admin');
    UPDATE users SET role_id='keeper';
    INSERT INTO permissions(id,code) VALUES('legacy-sentinel','legacy.sentinel') ON CONFLICT(code) DO NOTHING;
    INSERT INTO role_permissions SELECT id,'legacy-sentinel' FROM roles;
  `);
  const before = (await db.query(`SELECT role_id,permission_id FROM role_permissions ORDER BY 1,2`)).rows;
  await db.exec(roleMigration());
  await db.exec(`INSERT INTO users(id,company_id,full_name,role_id) VALUES('manager-a','a','Synthetic manager A','role_warehouse_manager_v1'),('manager-b','b','Synthetic manager B','role_warehouse_manager_v1');
    INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('a','wa','manager-a'),('a','wa','actor-a'),('b','wb','manager-b');`);
  const make = (fail = false) => {
    const p = wmsPersistence(db, fail), a = new AuditLogService(p), core = new WmsService(p, a);
    return { p, a, core, registry: new WarehouseManagementService(p, a), operations: new WmsOperationsService(p, core, a), counts: new WmsCountService(p, core, a) };
  };
  return { db, before, make, ...make() };
}

test("role migration is additive, replay-safe and grants exactly the reviewed manager profile", async t => {
  const { db, before } = await fixture(t);
  await db.exec(roleMigration());
  assert.deepEqual((await db.query(`SELECT role_id,permission_id FROM role_permissions WHERE role_id<>'role_warehouse_manager_v1' ORDER BY 1,2`)).rows, before);
  const grants = (await db.query(`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id='role_warehouse_manager_v1' ORDER BY p.code`)).rows.map((r: any) => r.code);
  assert.deepEqual(grants, [...warehouseManagerPermissions].sort());
  assert.equal((await db.query(`SELECT count(*)::int n FROM users`)).rows[0].n, 5);
});

test("registry uses company and exact warehouse assignments before pagination and atomically audits creation", async t => {
  const { db, registry, p, a, core } = await fixture(t);
  assert.deepEqual((await registry.list(manager, {})).items.map(w => w.id), ["wa"]);
  for (const id of ["wa2", "wb", "absent"]) await assert.rejects(registry.get(manager, id), NotFoundException);
  await assert.rejects(registry.update(manager, "wb", { name: "Forbidden" }), NotFoundException);
  await assert.rejects(registry.update(manager, "wa2", { name: "Forbidden" }), NotFoundException);
  await assert.rejects(core.setAccess(manager, "wb", { userId: "actor-a", granted: true }), NotFoundException);
  await assert.rejects(core.setAccess(manager, "wa2", { userId: "actor-a", granted: true }), NotFoundException);
  await assert.rejects(core.setAccess(manager, "wa", { userId: "actor-b", granted: true }), NotFoundException);
  await core.setAccess(manager, "wa", { userId: "clerk-a", granted: true });
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_warehouse_access WHERE company_id='a' AND warehouse_id='wa' AND user_id='clerk-a'`)).rows[0].n, 1);
  await assert.rejects(core.setAccess({ ...keeper, permissions: [...keeper.permissions, "wms.access.manage"] }, "wa", { userId: "clerk-a", granted: false }), ForbiddenException);
  const created = await registry.create(manager, { code: "created", name: "Synthetic warehouse", isActive: false });
  assert.equal(created.code, "CREATED");
  assert.equal((await db.query(`SELECT company_id,user_id FROM wms_warehouse_access WHERE warehouse_id=$1`, [created.id])).rows[0].user_id, manager.userId);
  assert.equal((await registry.update(manager, created.id, { isActive: true })).isActive, true);
  assert.equal((await db.query(`SELECT count(*)::int n FROM test_audit WHERE entity_id=$1`, [created.id])).rows[0].n, 2);
  await assert.rejects(registry.create(manager, { code: "created", name: "Duplicate" }), ConflictException);
  await assert.rejects(registry.update(manager, created.id, { companyId: "b" }), BadRequestException);
  await assert.rejects(registry.update(manager, created.id, { physical: "9999" }), BadRequestException);
  await db.exec(`INSERT INTO warehouses(id,company_id,code,name,updated_at) SELECT 's-'||i,'a','S-'||i,'Synthetic '||i,now() FROM generate_series(1,55) i;
    INSERT INTO wms_warehouse_access SELECT 'a','s-'||i,'manager-a',now() FROM generate_series(1,55) i;`);
  let sqlCount = 0;
  const measured = new WarehouseManagementService({ ...p, $queryRaw: (...args: any[]) => { sqlCount++; return p.$queryRaw(...args); } } as never, a);
  const page = await measured.list(manager, { pageSize: 20 });
  assert.equal(page.items.length, 20); assert.equal(page.hasMore, true); assert.equal(sqlCount, 2);
  assert.equal(page.items.some(w => w.id === "wb" || w.id === "wa2"), false);
  sqlCount = 0;
  const largerPage = await measured.list(manager, { pageSize: 50 });
  assert.equal(largerPage.items.length, 50); assert.equal(sqlCount, 2);
  const datasetSize = (await db.query(`SELECT count(*)::int n FROM warehouses`)).rows[0].n;
  t.diagnostic(`Synthetic registry service scenario: warehouses=${datasetSize}; returned=20/50; service SQL=2; whole-HTTP SQL=unmeasured; concurrency=1; API p95=unmeasured; native lock waits=unmeasured.`);
});

test("registry fails closed for wrong roles, missing delegation, disabled mode/module, identity and tenant", async t => {
  const { db, registry } = await fixture(t);
  for (const roleCode of ["WAREHOUSE_KEEPER", "COMPANY_ADMIN", "MANAGER"]) await assert.rejects(registry.create({ ...manager, roleCode } as never, { code: "NO", name: "Never created" }), ForbiddenException);
  await assert.rejects(registry.list({ ...manager, companyId: "b" }, {}), ForbiddenException);
  await assert.rejects(registry.list({ ...manager, userId: "actor-a" }, {}), ForbiddenException);
  await assert.rejects(registry.list({ ...manager, permissions: ["sfa.access", "wms.read"] }, {}), ForbiddenException);
  await db.exec(`UPDATE company_operating_settings SET operating_mode='ANALYSIS_ONLY' WHERE company_id='a'`);
  await assert.rejects(registry.create(manager, { code: "NO", name: "Never created" }), ForbiddenException);
  await db.exec(`UPDATE company_operating_settings SET operating_mode='SFA' WHERE company_id='a'; UPDATE companies SET feature_access='{}' WHERE id='a'`);
  await assert.rejects(registry.create(manager, { code: "NO", name: "Never created" }), ForbiddenException);
  assert.equal((await db.query(`SELECT count(*)::int n FROM warehouses WHERE code='NO'`)).rows[0].n, 0);
});

test("audit failure rolls back registry records, automatic access and updates; explicit revocation denies access", async t => {
  const { db, registry, make } = await fixture(t);
  const broken = make(true).registry;
  await assert.rejects(broken.create(manager, { code: "ROLLBACK", name: "Never committed" }), /synthetic audit failure/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM warehouses WHERE code='ROLLBACK'`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_warehouse_access WHERE user_id='manager-a'`)).rows[0].n, 1);
  await assert.rejects(broken.update(manager, "wa", { name: "Never committed" }), /synthetic audit failure/);
  assert.equal((await registry.get(manager, "wa")).name, "Warehouse A");
  await db.exec(`DELETE FROM wms_warehouse_access WHERE company_id='a' AND warehouse_id='wa' AND user_id='manager-a'`);
  await assert.rejects(registry.update(manager, "wa", { name: "Revoked" }), NotFoundException);
  assert.equal((await registry.list(manager, {})).items.length, 0);
});

test("keeper creates receiving documents, manager reviews/approves, and failed approval retains stock and audit parity", async t => {
  const { db, operations, make, core } = await fixture(t);
  await db.exec(countSeed);
  const command = (user: typeof keeper | typeof manager, operation: string, input: unknown) => operations.command(user, "wa", { operation, input });
  const receipt = await command(keeper, "receipt.create", { reference: randomUUID(), supplierName: "Synthetic supplier", supplierReference: "REF", note: "Physical receipt", idempotencyKey: randomUUID(),
    lines: [{ productId: "p", batchId: "lot", unit: "CARTON", expectedQuantity: "2", acceptedQuantity: "2", quarantinedQuantity: "0", rejectedQuantity: "0", rejectionReason: "" }] });
  await assert.rejects(command({ ...manager, permissions: [...manager.permissions, "wms.receiving.create"] }, "receipt.submit",
    { id: receipt.id, version: 1, note: "Forged preparation permission", idempotencyKey: randomUUID() }), ForbiddenException);
  const step = (version: number) => ({ id: receipt.id, version, note: "Verified document", idempotencyKey: randomUUID() });
  await assert.rejects(command(manager, "receipt.approve", step(1)), /WMS_INVALID_TRANSITION/);
  await command(keeper, "receipt.submit", step(1));
  await assert.rejects(command(keeper, "receipt.review", step(2)), ForbiddenException);
  await command(manager, "receipt.review", step(2));
  const approval = step(3);
  await assert.rejects(make(true).operations.command(manager, "wa", { operation: "receipt.approve", input: approval }), /synthetic audit failure/);
  assert.equal((await db.query(`SELECT physical::text FROM wms_positions WHERE company_id='a' AND warehouse_id='wa' AND batch_id='lot'`)).rows[0].physical, "2400.000000");
  await command(manager, "receipt.approve", approval);
  await command(manager, "receipt.approve", approval);
  assert.equal((await db.query(`SELECT physical::text FROM wms_positions WHERE company_id='a' AND warehouse_id='wa' AND batch_id='lot'`)).rows[0].physical, "2424.000000");
  assert.equal((await db.query(`SELECT count(*)::int n FROM test_audit WHERE action='wms.receipt.approve'`)).rows[0].n, 1);
  await assert.rejects(core.postOpening({ ...manager, permissions: [...manager.permissions, "wms.opening.post"] }, "wa", {}), ForbiddenException);
  await assert.rejects(command(manager, "receipt.create", {}), BadRequestException);
});

test("inventory adjustment requires an approved count document and audited posting; approval replay is harmless", async t => {
  const { db, counts, make } = await fixture(t);
  await db.exec(countSeed);
  const position = (await counts.candidates(keeper, "wa", {})).items.find(l => l.batchId === "lot")!;
  const doc = await counts.command(keeper, "wa", "CREATE", { reference: randomUUID(), reason: "Physical stocktake", idempotencyKey: randomUUID(),
    lines: [{ batchId: "lot", revision: position.revision, countedQuantity: "199", unit: "CARTON" }] });
  const approval = { version: 1, reason: "Reviewed count difference", idempotencyKey: randomUUID() };
  await assert.rejects(counts.command(keeper, "wa", "APPROVE", approval, doc.id), ForbiddenException);
  await assert.rejects(make(true).counts.command(manager, "wa", "APPROVE", approval, doc.id), /synthetic audit failure/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_movements WHERE kind='ADJUSTMENT'`)).rows[0].n, 0);
  await counts.command(manager, "wa", "APPROVE", approval, doc.id);
  await counts.command(manager, "wa", "APPROVE", approval, doc.id);
  assert.equal((await db.query(`SELECT status,approved_by FROM wms_counts WHERE id=$1`, [doc.id])).rows[0].status, "POSTED");
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_movements WHERE kind='ADJUSTMENT' AND count_line_id IS NOT NULL`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*)::int n FROM test_audit WHERE action='wms.count.approve'`)).rows[0].n, 1);
});
