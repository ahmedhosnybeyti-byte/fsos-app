import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("warehouse migration is additive and enforces tenant code uniqueness, defaults and foreign keys", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE for isolated PostgreSQL validation",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE companies(id text PRIMARY KEY);
    CREATE TABLE permissions(id text PRIMARY KEY, code text UNIQUE, description text);
    CREATE TABLE files(id text PRIMARY KEY, company_id text);
    CREATE TABLE rie_canonical_entity_rows(id text PRIMARY KEY, company_id text, data jsonb);
    INSERT INTO companies VALUES ('a'), ('b');
    INSERT INTO files VALUES ('file-a','a');
    INSERT INTO rie_canonical_entity_rows VALUES ('row-a','a','{"value":10}');`);
  const before = (await db.query("SELECT * FROM rie_canonical_entity_rows")).rows;
  await db.exec(readFileSync(resolve("packages/database/prisma/migrations/20261019090000_company_operating_settings/migration.sql"), "utf8"));
  await db.exec(readFileSync(resolve("packages/database/prisma/migrations/20261019120000_sfa_warehouses/migration.sql"), "utf8"));
  assert.deepEqual((await db.query("SELECT * FROM warehouses")).rows, []);
  assert.deepEqual((await db.query("SELECT * FROM company_operating_settings")).rows, []);
  assert.deepEqual((await db.query("SELECT * FROM rie_canonical_entity_rows")).rows, before);
  assert.deepEqual((await db.query("SELECT * FROM files")).rows, [{ id: "file-a", company_id: "a" }]);
  await db.exec(`INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES ('a-main','a','MAIN','Main',now()), ('b-main','b','MAIN','Main B',now());`);
  assert.deepEqual((await db.query("SELECT id,is_active FROM warehouses WHERE company_id='a'")).rows, [{ id: "a-main", is_active: true }]);
  await assert.rejects(db.exec("INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES ('dup','a','MAIN','Duplicate',now())"));
  await assert.rejects(db.exec("INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES ('orphan','missing','MAIN','Orphan',now())"));
  await db.exec("UPDATE warehouses SET name='Hijacked' WHERE company_id='b' AND id='a-main'");
  assert.equal((await db.query("SELECT name FROM warehouses WHERE id='a-main'")).rows[0].name, "Main");
  await db.exec("BEGIN; INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES ('rollback','a','SECOND','Second',now()); ROLLBACK;");
  assert.deepEqual((await db.query("SELECT id FROM warehouses WHERE id='rollback'")).rows, []);
  await db.exec("INSERT INTO companies VALUES ('new-company')");
  assert.deepEqual((await db.query("SELECT id FROM warehouses WHERE company_id='new-company'")).rows, []);
});
