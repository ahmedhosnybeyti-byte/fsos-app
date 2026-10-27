import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DEMO_COMPANY, importDemoDistribution, prepareDemoDistribution, type DemoSql } from "./demo-distribution";

async function fixture(t: {after:(fn:()=>Promise<void>)=>void}) {
  const { PGlite }=require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db=new PGlite();t.after(()=>db.close());
  const folder="packages/database/prisma/migrations";
  for(const name of readdirSync(folder).sort())if(name!=="migration_lock.toml")await db.exec(readFileSync(`${folder}/${name}/migration.sql`,"utf8"));
  await db.exec(`INSERT INTO companies(id,name,slug,updated_at) VALUES ('egypt-fixture','Egypt synthetic fixture','egypt-fixture',now()),('saudi-fixture','Saudi synthetic fixture','saudi-fixture',now());`);
  return db as DemoSql;
}

test("synthetic Canonical demo imports as third tenant, publishes history once and never posts opening/financial ledgers",async t=>{
  const db=await fixture(t),bundle=prepareDemoDistribution();
  const before=(await db.query(`SELECT * FROM companies ORDER BY id`)).rows;
  const grantsBefore=(await db.query(`SELECT role_id,permission_id FROM role_permissions ORDER BY role_id,permission_id`)).rows;
  const first=await importDemoDistribution(db,bundle);assert.equal(first.status,"IMPORTED");assert.ok(first.rows>100);
  assert.equal((await db.query(`SELECT count(*)::int n FROM companies`)).rows[0]!.n,3);
  const counts=await db.query(`SELECT entity_name,count(*)::int n FROM rie_canonical_entity_rows WHERE company_id=$1 GROUP BY entity_name`,[DEMO_COMPANY.id]);
  assert.equal(counts.rows.find(r=>r.entity_name==="Invoices")?.n,24);
  assert.equal(counts.rows.find(r=>r.entity_name==="Invoice Items")?.n,48);
  assert.equal(counts.rows.find(r=>r.entity_name==="Collections")?.n,12);
  assert.equal((await db.query(`SELECT operating_mode FROM company_operating_settings WHERE company_id=$1`,[DEMO_COMPANY.id])).rows[0]!.operating_mode,"FULL_ERP");
  const second=await importDemoDistribution(db,bundle);assert.equal(second.status,"UNCHANGED");
  assert.deepEqual((await db.query(`SELECT * FROM companies WHERE id<>$1 ORDER BY id`,[DEMO_COMPANY.id])).rows,before);
  for(const table of ["wms_movements","wms_positions","payments","wms_warehouse_access"])
    assert.equal((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0]!.n,0);
  assert.deepEqual((await db.query(`SELECT role_id,permission_id FROM role_permissions ORDER BY role_id,permission_id`)).rows,grantsBefore);
  const totals=await db.query(`SELECT entity_name,sum((data->>'TotalAfterVAT')::numeric) invoices,sum((data->>'LineTotal')::numeric) lines,sum((data->>'Amount')::numeric) collections FROM rie_canonical_entity_rows WHERE company_id=$1 GROUP BY entity_name`,[DEMO_COMPANY.id]);
  assert.equal(totals.rows.find(r=>r.entity_name==="Invoices")?.invoices,"552");
  assert.equal(totals.rows.find(r=>r.entity_name==="Invoice Items")?.lines,"552.0");
  assert.equal(totals.rows.find(r=>r.entity_name==="Collections")?.collections,"276");
  assert.equal((await db.query(`SELECT count(*)::int n FROM audit_logs WHERE action='demo.synthetic.import'`)).rows[0]!.n,1);
  const orphans=await db.query(`SELECT count(*)::int n FROM rie_canonical_entity_rows i WHERE i.company_id=$1 AND i.entity_name='Invoice Items' AND NOT EXISTS(SELECT 1 FROM rie_canonical_entity_rows h WHERE h.company_id=i.company_id AND h.entity_name='Invoices' AND h.data->>'InvoiceNo'=i.data->>'InvoiceNo')`,[DEMO_COMPANY.id]);
  assert.equal(orphans.rows[0]!.n,0);
  await db.query(`UPDATE files SET is_active=false WHERE company_id=$1 AND dataset_type='Products'`,[DEMO_COMPANY.id]);
  await assert.rejects(importDemoDistribution(db,bundle),/manifest drift/);
});

test("demo import rejects tenant collisions and altered payloads; audit failure rolls back the entire company",async t=>{
  const db=await fixture(t),bundle=prepareDemoDistribution();
  const tampered=prepareDemoDistribution();tampered.entities.Customers![0]!.CustomerCode="real-customer";
  await assert.rejects(importDemoDistribution(db,tampered),/reviewed synthetic/);
  const fail:DemoSql={exec:s=>db.exec(s),query:async(s,p)=>{if(s.includes("INSERT INTO audit_logs"))throw Error("audit unavailable");return db.query(s,p) as never;}};
  await assert.rejects(importDemoDistribution(fail,bundle),/audit unavailable/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM companies`)).rows[0]!.n,2);
  assert.equal((await db.query(`SELECT count(*)::int n FROM files`)).rows[0]!.n,0);
  await db.query(`INSERT INTO companies(id,name,slug,updated_at) VALUES('other','Real tenant',$1,now())`,[DEMO_COMPANY.slug]);
  await assert.rejects(importDemoDistribution(db,bundle),/identity collision/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM company_operating_settings`)).rows[0]!.n,0);
});
