import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { SfaSetupService } from "../../apps/api/src/modules/sfa-setup/sfa-setup.service";
import { warehouseManagerPermissions, warehouseKeeperPermissions } from "../../packages/schemas/src/operational-role-policy";

const options = { skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Isolated PostgreSQL runtime required" };

test("all committed migrations apply without tenant activation or user assignment and retain exactly the reviewed warehouse role profiles", options, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  const folder = "packages/database/prisma/migrations";
  const migrations = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.ok(migrations.length > 0);
  for (const migration of migrations) {
    await db.exec(readFileSync(`${folder}/${migration}/migration.sql`, "utf8"));
  }
  for (const table of ["companies", "users", "warehouses", "company_operating_settings", "wms_products", "wms_batches", "wms_positions", "wms_movements", "wms_warehouse_access", "wms_receipts", "wms_receipt_lines", "wms_load_requests", "wms_load_lines", "wms_allocations", "wms_customer_policies", "wms_custody_positions", "wms_operation_events", "wms_commands", "wms_returns", "wms_return_lines", "wms_loading_proposals", "wms_proposal_lines"]) {
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0);
  }
  const grants = (await db.query(`SELECT r.code AS role,p.code AS permission FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
    WHERE p.code='sfa.access' OR p.code LIKE 'wms.%' ORDER BY r.code,p.code`)).rows;
  const expected = [
    ...warehouseKeeperPermissions.map(permission => ({role:"WAREHOUSE_KEEPER",permission})),
    ...warehouseManagerPermissions.map(permission => ({role:"WAREHOUSE_MANAGER",permission})),
  ].sort((a,b)=>a.role.localeCompare(b.role)||a.permission.localeCompare(b.permission));
  assert.deepEqual(grants,expected);
  for (const table of ["wms_suppliers","wms_receipt_supplier_metadata"])
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count,0);
});

test("warehouse service rolls back its write when audit persistence fails in the same SQL transaction", options, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec("CREATE TABLE companies(id text PRIMARY KEY); INSERT INTO companies VALUES ('company-a');");
  await db.exec(readFileSync("packages/database/prisma/migrations/20261019120000_sfa_warehouses/migration.sql", "utf8"));
  const tx = { warehouse: { create: async ({ data }: any) => {
    const result = await db.query(`INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES ('fixture', $1, $2, $3, now()) RETURNING id,code,name,address,is_active AS "isActive"`, [data.companyId, data.code, data.name]);
    return result.rows[0];
  } } };
  const service = new SfaSetupService({ $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
    await db.exec("BEGIN");
    try { const value = await work(tx); await db.exec("COMMIT"); return value; }
    catch (error) { await db.exec("ROLLBACK"); throw error; }
  } } as never, { record: async (_entry: unknown, client: unknown) => {
    assert.equal(client, tx); throw new Error("fixture audit unavailable");
  } } as never);
  await assert.rejects(service.create("company-a", { code: "MAIN", name: "Fixture" }, "actor"), /fixture audit unavailable/);
  assert.deepEqual((await db.query("SELECT id FROM warehouses")).rows, []);
});
