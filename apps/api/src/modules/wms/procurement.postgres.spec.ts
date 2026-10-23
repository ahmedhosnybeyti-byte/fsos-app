import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {ForbiddenException,NotFoundException} from "@nestjs/common";
import {wmsFixture,wmsPersistence,wmsUser} from "./wms-test-fixture";
import {WmsService} from "./wms.service";
import {WmsOperationsService} from "./wms-operations.service";
import {ProcurementService} from "./procurement.service";
import {AuditLogService} from "../audit-log/audit-log.service";
import {procurementMigration,procurementSeed,procurementUser} from "./procurement-test-fixture";
async function fixture(t:any){
 assert.ok(process.env.RIE_TEST_PGLITE_MODULE);const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());await wmsFixture(db);await db.exec(procurementSeed);await db.exec(readFileSync(procurementMigration,"utf8"));
 const make=(fail=false)=>{const p=wmsPersistence(db,fail),a=new AuditLogService(p),access=new WmsService(p,a);return {s:new ProcurementService(p,access,a),wms:new WmsOperationsService(p,access,a)};};
 const {s,wms}=make();const u=procurementUser(),approver=procurementUser("clerk-a");
 const command=(operation:string,id?:string,version?:number,extra:any={})=>({operation,id,version,reason:"Focused procurement action",idempotencyKey:randomUUID(),...extra});
 const draft=()=>command("CREATE",undefined,undefined,{draft:{reference:randomUUID(),lines:[{productId:"p",quantity:"40",unit:"CARTON"}]}});
 async function order(){const d=await s.command(u,"wa",draft());await s.command(u,"wa",command("SUBMIT",d.id,1));await s.command(approver,"wa",command("APPROVE",d.id,2));await s.command(approver,"wa",command("ORDER",d.id,3,{supplierId:"supplier"}));return d.id;}
 const receipt=(q:string)=>({reference:randomUUID(),lines:[{productId:"p",batchId:"lot",unit:"CARTON",expectedQuantity:q,acceptedQuantity:q,quarantinedQuantity:"0",rejectedQuantity:"0"}]});
 async function post(id:string){await wms.command(u,"wa",{operation:"receipt.submit",input:{id,version:1,note:"Submit actual delivery",idempotencyKey:randomUUID()}});await wms.command(u,"wa",{operation:"receipt.review",input:{id,version:2,note:"Review actual delivery",idempotencyKey:randomUUID()}});const b={operation:"receipt.approve",input:{id,version:3,note:"Post actual delivery",idempotencyKey:randomUUID()}};const r=await wms.command(approver,"wa",b);return {b,r};}
 const stock=async()=>Number((await db.query("SELECT sum(physical)::text AS n FROM wms_positions WHERE company_id='a' AND warehouse_id='wa'")).rows[0].n);
 return {db,s,wms,make,u,approver,command,draft,order,receipt,post,stock};
}

test("company admin reads purchase orders only, even when request filters or draft IDs are supplied",async t=>{
 const f=await fixture(t),draft=await f.s.command(f.u,"wa",f.draft());
 const admin={...f.u,roleCode:"COMPANY_ADMIN" as const,permissions:["sfa.access","erp.admin.read"]};
 assert.equal((await f.s.list(admin,"wa",{kind:"all"})).items.length,0);
 await assert.rejects(f.s.detail(admin,"wa",draft.id),NotFoundException);
 const ordered=await f.order();
 const rows=await f.s.list(admin,"wa",{kind:"requests"});assert.equal(rows.items.length,1);assert.equal(rows.items[0]!.id,ordered);
 assert.equal((await f.s.detail(admin,"wa",ordered)).orderId!==null,true);
 assert.equal((await f.s.summary(admin,"wa")).pending,0);
 await assert.rejects(f.s.list({...admin,companyId:"b",userId:"actor-b"},"wa",{}),NotFoundException);
});
test("Procurement 40 cartons: request/approval/order inert; WMS 25 + 15; retries once; reversal reopens supply",async t=>{
 const f=await fixture(t),before=await f.stock(),id=await f.order();assert.equal(await f.stock(),before);
 let d=await f.s.detail(f.u,"wa",id);assert.equal(d.status,"OPEN");assert.equal(d.lines[0]!.price,null);
 const first=f.command("RECEIVE",id,1,{receipt:f.receipt("25")});const r=await f.s.command(f.u,"wa",first);assert.deepEqual(await f.s.command(f.u,"wa",first),r);assert.equal(await f.stock(),before);
 const posted=await f.post(r.id);assert.deepEqual(await f.wms.command(f.approver,"wa",posted.b),posted.r);
 d=await f.s.detail(f.u,"wa",id);assert.equal(d.status,"PARTIAL");assert.equal(Number(d.lines[0]!.remaining),15);assert.equal(await f.stock(),before+25*12);
 const second=await f.s.command(f.u,"wa",f.command("RECEIVE",id,1,{receipt:f.receipt("15")}));await f.post(second.id);
 d=await f.s.detail(f.u,"wa",id);assert.equal(d.status,"COMPLETED");assert.equal(Number(d.lines[0]!.remaining),0);assert.equal(await f.stock(),before+40*12);
 assert.equal((await f.db.query("SELECT count(*)::int n FROM wms_movements")).rows[0].n,2);
 await f.wms.command(f.approver,"wa",{operation:"receipt.reverse",input:{id:second.id,version:4,note:"Reverse mistaken delivery",idempotencyKey:randomUUID()}});
 d=await f.s.detail(f.u,"wa",id);assert.equal(d.status,"PARTIAL");assert.equal(Number(d.lines[0]!.remaining),15);
});
test("Procurement separation, permissions, Full ERP, company/warehouse scope, conversion deduplication and prices",async t=>{
 const f=await fixture(t),b=f.draft(),r=await f.s.command(f.u,"wa",b);assert.deepEqual(await f.s.command(f.u,"wa",b),r);
 await assert.rejects(f.s.command(f.u,"wa",{...b,reason:"Changed payload"}),/IDEMPOTENCY_CONFLICT/);
 await f.s.command(f.u,"wa",f.command("SUBMIT",r.id,1));await assert.rejects(f.s.command(f.u,"wa",f.command("APPROVE",r.id,2)),/SEPARATE_APPROVER/);
 await f.s.command(f.approver,"wa",f.command("APPROVE",r.id,2));await assert.rejects(f.s.command(f.approver,"wa",f.command("ORDER",r.id,3,{supplierId:"foreign"})),/SUPPLIER/);
 const order=f.command("ORDER",r.id,3,{supplierId:"supplier",prices:[{productId:"p",price:"12.25"}]});await f.s.command(f.approver,"wa",order);await f.s.command(f.approver,"wa",order);
 await assert.rejects(f.s.command(f.approver,"wa",{...order,idempotencyKey:randomUUID()}),/STALE|ALREADY_CONVERTED/);
 assert.equal(Number((await f.s.detail(f.u,"wa",r.id)).lines[0]!.price),12.25);
 await assert.rejects(f.s.list({...f.u,permissions:["sfa.access","wms.read"]},"wa",{}),ForbiddenException);
 await assert.rejects(f.s.command({...f.u,permissions:f.u.permissions.filter(p=>p!=="procurement.request.create")},"wa",f.draft()),ForbiddenException);
 await assert.rejects(f.s.detail(f.u,"wa2",r.id),NotFoundException);
 await assert.rejects(f.s.list({...f.u,companyId:"b",userId:"actor-b"},"wa",{}),NotFoundException);
 await f.db.exec("UPDATE company_operating_settings SET operating_mode='ANALYSIS_ONLY' WHERE company_id='a'");await assert.rejects(f.s.list(f.u,"wa",{}),ForbiddenException);
});
test("Procurement over-receipt protection covers multiple drafts and direct WMS edits, cancellation and atomic audit rollback",async t=>{
 const f=await fixture(t),id=await f.order(),before=await f.stock();
 await assert.rejects(f.s.command(f.u,"wa",f.command("RECEIVE",id,1,{receipt:f.receipt("41")})),/EXCEEDS_REMAINING/);
 const a=await f.s.command(f.u,"wa",f.command("RECEIVE",id,1,{receipt:f.receipt("25")})),b=await f.s.command(f.u,"wa",f.command("RECEIVE",id,1,{receipt:f.receipt("25")}));
 await f.post(a.id);await assert.rejects(f.post(b.id),/EXCEEDS_REMAINING/);assert.equal(await f.stock(),before+300);
 await assert.rejects(f.s.command(f.u,"wa",f.command("CANCEL",id,1)),/INVALID_TRANSITION/);
 const count=(await f.s.list(f.u,"wa",{})).items.length;await assert.rejects(f.make(true).s.command(f.u,"wa",f.draft()),/synthetic audit failure/);assert.equal((await f.s.list(f.u,"wa",{})).items.length,count);
 const unreceived=await f.order();await f.s.command(f.u,"wa",f.command("CANCEL",unreceived,1));assert.equal((await f.s.detail(f.u,"wa",unreceived)).status,"CANCELLED");
 await assert.rejects(f.s.command(f.u,"wa",f.command("RECEIVE",unreceived,2,{receipt:f.receipt("1")})),/INVALID_TRANSITION/);
 const stats=await f.s.summary(f.u,"wa");assert.equal(stats.partial,1);assert.equal(Number(stats.remaining[0]!.quantity),15);
});
test("Procurement editable inert drafts, rejection, exact units and atomic conversion/receiving audit",async t=>{
 const f=await fixture(t),before=await f.stock(),created=await f.s.command(f.u,"wa",f.draft());
 const edit=f.command("EDIT",created.id,1,{draft:{reference:randomUUID(),lines:[{productId:"p",quantity:"20",unit:"CARTON"}]}});
 await f.s.command(f.u,"wa",edit);assert.equal(Number((await f.s.detail(f.u,"wa",created.id)).lines[0]!.quantity),20);
 await assert.rejects(f.s.command(f.u,"wa",{...edit,idempotencyKey:randomUUID()}),/STALE/);
 await f.s.command(f.u,"wa",f.command("SUBMIT",created.id,2));await f.s.command(f.approver,"wa",f.command("REJECT",created.id,3));assert.equal((await f.s.detail(f.u,"wa",created.id)).status,"REJECTED");
 await assert.rejects(f.s.command(f.approver,"wa",f.command("ORDER",created.id,4,{supplierId:"supplier"})),/ALREADY_CONVERTED/);
 await assert.rejects(f.s.command(f.u,"wa",f.command("CREATE",undefined,undefined,{draft:{reference:randomUUID(),lines:[{productId:"p",quantity:"0.000001",unit:"CARTON"}]}})),/FRACTIONAL_PIECE/);
 const id=await f.order();const n=(await f.db.query("SELECT count(*)::int AS n FROM wms_receipts")).rows[0].n;
 await assert.rejects(f.make(true).s.command(f.u,"wa",f.command("RECEIVE",id,1,{receipt:f.receipt("10")})),/synthetic audit failure/);
 assert.equal((await f.db.query("SELECT count(*)::int AS n FROM wms_receipts")).rows[0].n,n);assert.equal((await f.s.detail(f.u,"wa",id)).receipts.length,0);assert.equal(await f.stock(),before);
 const r=await f.s.command(f.u,"wa",f.command("RECEIVE",id,1,{receipt:f.receipt("10")}));
 await f.wms.command(f.u,"wa",{operation:"receipt.edit",input:{...f.receipt("41"),id:r.id,version:1,supplierName:"Existing supplier",supplierReference:"Edited directly in WMS",note:"Direct receipt edit",idempotencyKey:randomUUID()}});
 for(const [operation,version] of [["receipt.submit",2],["receipt.review",3]] as const)await f.wms.command(f.u,"wa",{operation,input:{id:r.id,version,note:"Review direct WMS edit",idempotencyKey:randomUUID()}});
 await assert.rejects(f.wms.command(f.u,"wa",{operation:"receipt.approve",input:{id:r.id,version:4,note:"Over receipt must fail",idempotencyKey:randomUUID()}}),/EXCEEDS_REMAINING/);assert.equal(await f.stock(),before);
});
