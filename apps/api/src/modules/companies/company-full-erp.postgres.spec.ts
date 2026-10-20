import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Full ERP migration preserves Egypt/Saudi fixtures, SFA grants, snapshots and opening balances", async t => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE companies(id text PRIMARY KEY);
    CREATE TABLE permissions(id text PRIMARY KEY, code text UNIQUE, description text);
    INSERT INTO companies VALUES ('egypt-fixture'),('saudi-fixture'),('demo-fixture');
    CREATE TABLE legacy_facts(company_id text, amount numeric);
    INSERT INTO legacy_facts VALUES ('egypt-fixture',123.45),('saudi-fixture',456.78);
    CREATE TABLE opening_balances(company_id text, amount numeric);
    INSERT INTO opening_balances VALUES ('saudi-fixture',77.70);`);
  await db.exec(readFileSync("packages/database/prisma/migrations/20261019090000_company_operating_settings/migration.sql", "utf8"));
  await db.exec(`INSERT INTO company_operating_settings(company_id,operating_mode,updated_at) VALUES ('saudi-fixture','SFA',now())`);
  await db.exec(readFileSync("packages/database/prisma/migrations/20261020130000_company_full_erp_mode/migration.sql", "utf8"));
  assert.deepEqual((await db.query(`SELECT c.id,COALESCE(s.operating_mode,'ANALYSIS_ONLY') AS mode FROM companies c LEFT JOIN company_operating_settings s ON s.company_id=c.id ORDER BY c.id`)).rows,
    [{ id:"demo-fixture",mode:"ANALYSIS_ONLY" },{ id:"egypt-fixture",mode:"ANALYSIS_ONLY" },{ id:"saudi-fixture",mode:"SFA" }]);
  await db.exec(`INSERT INTO company_operating_settings(company_id,operating_mode,updated_at) VALUES ('demo-fixture','FULL_ERP',now())`);
  for (const mode of ["SFA", "ANALYSIS_ONLY", "FULL_ERP"]) await db.query(`UPDATE company_operating_settings SET operating_mode=$1 WHERE company_id='demo-fixture'`,[mode]);
  assert.deepEqual((await db.query(`SELECT * FROM legacy_facts ORDER BY company_id`)).rows,[{company_id:"egypt-fixture",amount:"123.45"},{company_id:"saudi-fixture",amount:"456.78"}]);
  assert.deepEqual((await db.query(`SELECT * FROM opening_balances`)).rows,[{company_id:"saudi-fixture",amount:"77.70"}]);
});
