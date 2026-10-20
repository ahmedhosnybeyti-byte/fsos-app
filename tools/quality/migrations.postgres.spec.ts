import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { SfaSetupService } from "../../apps/api/src/modules/sfa-setup/sfa-setup.service";

const options = { skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Isolated PostgreSQL runtime required" };

test("all committed migrations apply to a fresh isolated database without tenant activation or role grants", options, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  const folder = "packages/database/prisma/migrations";
  const migrations = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.ok(migrations.length > 0);
  for (const migration of migrations) {
    await db.exec(readFileSync(`${folder}/${migration}/migration.sql`, "utf8"));
  }
  for (const table of ["companies", "users", "warehouses", "company_operating_settings"]) {
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0);
  }
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE p.code = 'sfa.access'`)).rows[0].count, 0);
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
