import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { BadRequestException,ForbiddenException,NotFoundException } from "@nestjs/common";
import { wmsFixture,wmsPersistence,wmsUser } from "./wms-test-fixture";
import { WmsService } from "./wms.service";
import { WmsQuarantineService } from "./wms-quarantine.service";
import { AuditLogService } from "../audit-log/audit-log.service";
const migration="packages/database/prisma/migrations/20261021210000_wms_quarantine/migration.sql";
const user={...wmsUser(),permissions:[...wmsUser().permissions,"wms.quarantine.hold","wms.quarantine.release","wms.quarantine.writeoff"]};
async function fixture(t:any){assert.ok(process.env.RIE_TEST_PGLITE_MODULE);const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());await wmsFixture(db);
 await db.exec(readFileSync("packages/database/prisma/migrations/20261021200000_wms_physical_counts/migration.sql","utf8"));await db.exec(readFileSync(migration,"utf8"));
 // Existing state only: never replay opening, counts or four workflows.
 await db.exec(`INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton) VALUES('p','a','DAMAGE','Damage fixture',12);
 INSERT INTO wms_batches(id,company_id,product_id,code) VALUES('lot','a','p','LOT');
 INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('a','wa','lot',2400);
 INSERT INTO wms_custody_positions(company_id,warehouse_id,batch_id,recipient_id,quantity) VALUES('a','wa','lot','clerk-a',36);`);
 const make=(fail=false)=>{const p=wmsPersistence(db,fail),audit=new AuditLogService(p);return new WmsQuarantineService(p,new WmsService(p,audit),audit);};const s=make();
 const hold=(extra:any={})=>({batchId:"lot",unit:"CARTON",quantity:"10",reference:randomUUID(),reason:"Observed damaged packaging",idempotencyKey:randomUUID(),...extra});
 const step=(quantity="6",version=1)=>({quantity,version,reason:"Inspected physical quality decision",idempotencyKey:randomUUID()});
 const state=async()=>{const r=await db.query("SELECT physical::text,available::text,quarantined::text FROM wms_inventory_state WHERE company_id='a' AND warehouse_id='wa' AND batch_id='lot'");return r.rows[0];};
 return {db,s,make,hold,step,state};}
test("Quarantine 200: hold10 →190/10; release6 →196/4; approve write-off4 →196/0/196 with one physical ledger deduction",async t=>{
 const f=await fixture(t),input=f.hold(),d=await f.s.command(user,"wa","HOLD",input);assert.deepEqual(await f.s.command(user,"wa","HOLD",input),d);
 assert.deepEqual(await f.state(),{physical:"2400.000000",available:"2280.000000",quarantined:"120.000000"});
 const release=f.step();await f.s.command(user,"wa","RELEASE",release,d.id);await f.s.command(user,"wa","RELEASE",release,d.id);
 assert.deepEqual(await f.state(),{physical:"2400.000000",available:"2352.000000",quarantined:"48.000000"});
 const off=f.step("4",2),posted=await f.s.command(user,"wa","WRITE_OFF",off,d.id);assert.deepEqual(await f.s.command(user,"wa","WRITE_OFF",off,d.id),posted);
 assert.deepEqual(await f.state(),{physical:"2352.000000",available:"2352.000000",quarantined:"0.000000"});
 const doc=await f.s.detail(user,"wa",d.id);assert.equal(doc.status,"CLOSED");assert.equal(doc.released,"6.000000");assert.equal(doc.writtenOff,"4.000000");assert.equal(doc.remaining,"0.000000");
 const events=await f.s.events(user,"wa",d.id,{});assert.equal(events.items.length,3);assert.ok(events.items.every(e=>e.actorName==="Admin A"&&e.movementId));
 const rows=(await f.db.query("SELECT kind,quantity::text,quarantine_delta::text FROM wms_movements ORDER BY kind")).rows;assert.equal(rows.length,3);assert.equal(rows.filter((r:any)=>Number(r.quantity)!==0).length,1);assert.equal(rows.find((r:any)=>r.kind==="WRITE_OFF").quantity,"-48.000000");
 assert.equal((await f.db.query("SELECT quantity::text FROM wms_custody_positions")).rows[0].quantity,"36.000000");assert.equal((await f.db.query("SELECT count(*)::int n FROM test_audit")).rows[0].n,3);
 await assert.rejects(f.s.command(user,"wa","WRITE_OFF",f.step("4",2),d.id),/WMS_DOCUMENT_STALE/);
 for(const query of ["DELETE FROM wms_quarantines","UPDATE wms_quarantine_events SET reason='edited'","DELETE FROM wms_movements"])
  await assert.rejects(f.db.exec(query),/WMS_LEDGER_IMMUTABLE/);
});
test("Quarantine permissions/company/warehouse scope, validation, exact conversion and idempotency conflicts",async t=>{
 const f=await fixture(t),input=f.hold(),reader={...user,permissions:["sfa.access","wms.read"]};
 for(const op of ["HOLD","RELEASE","WRITE_OFF"] as const)await assert.rejects(f.s.command(reader,"wa",op,op==="HOLD"?input:f.step(),"none"),ForbiddenException);
 await assert.rejects(f.s.candidates(wmsUser("b","actor-b"),"wa",{}),NotFoundException);
 await assert.rejects(f.s.candidates({...user,roleCode:"SUPERVISOR"},"wa",{}),NotFoundException);
 const d=await f.s.command(user,"wa","HOLD",input);await assert.rejects(f.s.detail(user,"wa2",d.id),NotFoundException);
 await assert.rejects(f.s.command(user,"wa2","RELEASE",f.step(),d.id),/WMS_DOCUMENT_NOT_FOUND/);
 await assert.rejects(f.s.command(user,"wa2","HOLD",f.hold()),/WMS_POSITION_NOT_FOUND/);
 for(const quantity of ["0","-1","1e2","1.0000001"])await assert.rejects(f.s.command(user,"wa","HOLD",f.hold({quantity})),BadRequestException);
 await assert.rejects(f.s.command(user,"wa","HOLD",f.hold({companyId:"b"})),BadRequestException);
 await assert.rejects(f.s.command(user,"wa","HOLD",f.hold({quantity:"0.000001"})),/WMS_FRACTIONAL_PIECE/);
 await assert.rejects(f.s.command(user,"wa","HOLD",{...input,reason:"Changed payload on same key"}),/WMS_IDEMPOTENCY_CONFLICT/);
 await assert.rejects(f.s.command(user,"wa","HOLD",{...input,idempotencyKey:randomUUID()}),/unique constraint|WMS_DUPLICATE_REFERENCE/);
 assert.equal((await f.s.candidates(user,"wa",{search:"no match"})).items.length,0);
});
test("Quarantine stock ownership and reserved boundaries; blocked/expired goods cannot be released",async t=>{
 const f=await fixture(t);await f.db.exec("UPDATE wms_positions SET reserved=2300 WHERE batch_id='lot'");await assert.rejects(f.s.command(user,"wa","HOLD",f.hold()),/WMS_INSUFFICIENT_STOCK/);
 await f.db.exec("UPDATE wms_positions SET reserved=0 WHERE batch_id='lot'");const d=await f.s.command(user,"wa","HOLD",f.hold());
 await assert.rejects(f.s.command(user,"wa","RELEASE",f.step("11"),d.id),/WMS_QUARANTINE_EXCEEDS_REMAINING/);
 await assert.rejects(f.db.exec("UPDATE wms_positions SET quarantined=0 WHERE batch_id='lot'"),/WMS_HELD_OWNERSHIP/);
 await f.db.exec("UPDATE wms_positions SET quality_blocked=true WHERE batch_id='lot'");await assert.rejects(f.s.command(user,"wa","RELEASE",f.step(),d.id),/WMS_QUARANTINE_RELEASE_BLOCKED/);
 await f.db.exec("UPDATE wms_positions SET quality_blocked=false WHERE batch_id='lot';UPDATE wms_products SET is_active=false WHERE id='p'");await assert.rejects(f.s.command(user,"wa","RELEASE",f.step(),d.id),/WMS_QUARANTINE_RELEASE_BLOCKED/);
 // Disposal remains possible for an inactive/damaged product; it never makes goods available.
 await f.s.command(user,"wa","WRITE_OFF",f.step("10"),d.id);assert.equal((await f.s.detail(user,"wa",d.id)).status,"CLOSED");
 await f.db.exec("INSERT INTO wms_batches(id,company_id,product_id,code,expiry_date) VALUES('expired','a','p','EXPIRED','2000-01-01');INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('a','wa','expired',120)");
 const expired=await f.s.command(user,"wa","HOLD",f.hold({batchId:"expired",quantity:"0.5"}));
 await assert.rejects(f.s.command(user,"wa","RELEASE",f.step("0.5"),expired.id),/WMS_QUARANTINE_RELEASE_BLOCKED/);
 await f.s.command(user,"wa","WRITE_OFF",f.step("0.5"),expired.id);
});
test("Quarantine hold, release and write-off audit failures roll back atomically; fresh-key stale decisions fail",async t=>{
 const f=await fixture(t),input=f.hold();await assert.rejects(f.make(true).command(user,"wa","HOLD",input),/synthetic audit failure/);assert.equal((await f.state()).quarantined,"0.000000");
 const d=await f.s.command(user,"wa","HOLD",input);for(const op of ["RELEASE","WRITE_OFF"] as const){await assert.rejects(f.make(true).command(user,"wa",op,f.step("4"),d.id),/synthetic audit failure/);assert.equal((await f.s.detail(user,"wa",d.id)).version,1);assert.equal((await f.state()).physical,"2400.000000");}
 await f.s.command(user,"wa","RELEASE",f.step("6"),d.id);await assert.rejects(f.s.command(user,"wa","WRITE_OFF",f.step("4"),d.id),/WMS_DOCUMENT_STALE/);
});
