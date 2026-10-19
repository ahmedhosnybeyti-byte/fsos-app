import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("operating-settings migration preserves legacy companies, facts and role grants", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE for isolated migration validation",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => {
    exec(sql: string): Promise<unknown>;
    query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
    close(): Promise<void>;
  } };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE companies (id text PRIMARY KEY, name text, status text);
    CREATE TABLE permissions (id text PRIMARY KEY, code text UNIQUE, description text);
    CREATE TABLE role_permissions (role_id text, permission_id text);
    CREATE TABLE files (id text PRIMARY KEY, company_id text, status text);
    CREATE TABLE rie_canonical_entity_rows (id text PRIMARY KEY, company_id text, data jsonb);
    INSERT INTO companies VALUES ('old-a', 'Old A', 'ACTIVE'), ('old-b', 'Old B', 'SUSPENDED');
    INSERT INTO permissions VALUES ('files-view', 'files.view', 'View files');
    INSERT INTO role_permissions VALUES ('rep', 'files-view');
    INSERT INTO files VALUES ('f1', 'old-a', 'READY');
    INSERT INTO rie_canonical_entity_rows VALUES ('r1', 'old-a', '{"InvoiceNo":"INV-1","LineTotal":10}');
  `);
  const tables = ["companies", "files", "rie_canonical_entity_rows", "role_permissions"];
  const before = await Promise.all(tables.map(async (table) => (await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows));
  await db.exec(readFileSync(resolve("packages/database/prisma/migrations/20261019090000_company_operating_settings/migration.sql"), "utf8"));
  for (const [index, table] of tables.entries()) assert.deepEqual((await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows, before[index]);
  assert.deepEqual((await db.query("SELECT * FROM company_operating_settings")).rows, []);
  assert.deepEqual((await db.query("SELECT c.id, COALESCE(s.operating_mode, 'ANALYSIS_ONLY') AS mode FROM companies c LEFT JOIN company_operating_settings s ON s.company_id = c.id ORDER BY c.id")).rows,
    [{ id: "old-a", mode: "ANALYSIS_ONLY" }, { id: "old-b", mode: "ANALYSIS_ONLY" }]);
  await db.exec("INSERT INTO companies VALUES ('new', 'New', 'ACTIVE'); INSERT INTO company_operating_settings (company_id, updated_at) VALUES ('new', now())");
  assert.deepEqual((await db.query("SELECT operating_mode FROM company_operating_settings WHERE company_id = 'new'")).rows, [{ operating_mode: "ANALYSIS_ONLY" }]);
  await assert.rejects(db.exec("INSERT INTO company_operating_settings (company_id, updated_at) VALUES ('missing', now())"));
  await assert.rejects(db.exec("UPDATE company_operating_settings SET operating_mode = 'ERP' WHERE company_id = 'new'"));
});
