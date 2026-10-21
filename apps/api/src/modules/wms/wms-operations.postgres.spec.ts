import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {ForbiddenException,NotFoundException,BadRequestException} from "@nestjs/common";
import {WMS_OPERATION_PERMISSIONS,wmsCoreInputs,type WmsOperation} from "@field-sales-os/schemas";
import {wmsFixture,wmsPersistence,wmsUser} from "./wms-test-fixture";
import {WmsService} from "./wms.service";
import {AuditLogService} from "../audit-log/audit-log.service";
import {WmsOperationsService} from "./wms-operations.service";
const options={skip:process.env.RIE_TEST_PGLITE_MODULE?false:"Isolated PostgreSQL runtime required"};
const permissions=[...new Set([...Object.values(WMS_OPERATION_PERMISSIONS),"sfa.access","wms.read","wms.products.manage","wms.opening.post","wms.policy.manage","wms.access.manage"])];
const actor=(company="a",id="actor-a",role="COMPANY_ADMIN")=>({...wmsUser(company,id,role),permissions});
async function fixture(t:any){const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());await wmsFixture(db);
  await db.exec(`CREATE TABLE roles(id text PRIMARY KEY,code text);INSERT INTO roles VALUES('admin','COMPANY_ADMIN'),('rep','SALES_REP');ALTER TABLE users ADD COLUMN role_id text;UPDATE users SET role_id=CASE WHEN id='clerk-a' THEN 'rep' ELSE 'admin' END;`);
  const prisma=wmsPersistence(db);const audit=new AuditLogService(prisma);const core=new WmsService(prisma,audit);const service=new WmsOperationsService(prisma,core,audit);const user=actor();
  await core.setAccess(user,"wa",{userId:"clerk-a",granted:true});return {db,prisma,core,service,user};
}
async function command(service:WmsOperationsService,user:any,operation:WmsOperation,input:any,w="wa"){return service.command(user,w,{operation,input:{...input,idempotencyKey:input.idempotencyKey??randomUUID()}});}
async function step(service:WmsOperationsService,user:any,operation:WmsOperation,id:string,extra:any={}){const kind=operation.startsWith("receipt.")?"receipt":"load";const doc=kind==="receipt"?await service.receipt(user,"wa",id):await service.load(user,"wa",id);return command(service,user,operation,{id,version:doc.version,note:"Verified workflow action",...extra});}
async function product(core:WmsService,user:any,code="WATER"){return core.saveProduct(user,"wa",{code,name:code,piecesPerCarton:12,trackBatches:true,trackExpiry:true});}
const receiptLine=(p:string,extra:any={})=>({productId:p,batchCode:"LOT-1",productionDate:"2026-01-01",expiryDate:"2099-01-01",unit:"CARTON",expectedQuantity:"10",acceptedQuantity:"6",quarantinedQuantity:"1",rejectedQuantity:"1",rejectionReason:"Hold and reject after inspection",...extra});
async function receipt(service:WmsOperationsService,user:any,p:string,extra:any={}){return command(service,user,"receipt.create",{reference:randomUUID(),supplierName:"Synthetic supplier",supplierReference:"SUP-1",lines:[receiptLine(p)],...extra});}
async function post(service:WmsOperationsService,user:any,id:string){await step(service,user,"receipt.submit",id);await step(service,user,"receipt.review",id);return step(service,user,"receipt.approve",id);}
async function load(service:WmsOperationsService,user:any,p:string,q="12",extra:any={}){return command(service,user,"load.create",{reference:randomUUID(),source:"MANUAL",recipientId:"clerk-a",targetDate:"2026-10-20",customerCode:null,lines:[{productId:p,quantity:q,unit:"BASE"}],...extra});}
test("Receiving review, partial delivery, exact UOM, deduplication and auditable reversal preserve real stock",options,async t=>{
  const {service,core,user,db}=await fixture(t);const p=await product(core,user);const r=await receipt(service,user,p.id);
  await assert.rejects(step(service,user,"receipt.approve",r.id),/WMS_INVALID_TRANSITION/);
  await step(service,user,"receipt.submit",r.id);await step(service,user,"receipt.return-draft",r.id);
  const draft=await service.receipt(user,"wa",r.id);assert.equal(draft.status,"DRAFT");
  await command(service,user,"receipt.edit",{id:r.id,version:draft.version,reference:draft.reference,supplierName:draft.supplierName,supplierReference:draft.supplierReference,lines:[receiptLine(p.id)],note:"Rechecked physical delivery"});
  await step(service,user,"receipt.submit",r.id);await step(service,user,"receipt.review",r.id);
  const reviewed=await service.receipt(user,"wa",r.id);const cmd={id:r.id,version:reviewed.version,note:"Approve measured counts",idempotencyKey:randomUUID()};
  const result=await command(service,user,"receipt.approve",cmd);assert.deepEqual(await command(service,user,"receipt.approve",cmd),result);
  assert.equal((await service.receipt(user,"wa",r.id)).partial,true);
  const stock=(await core.products(user,"wa",{})).items[0]!;assert.equal(stock.physical,"84.000000");assert.equal(stock.available,"72.000000");assert.equal(stock.quarantined,"12.000000");
  assert.equal((await db.query(`SELECT count(*)::int n FROM test_audit WHERE action='wms.receipt.approve'`)).rows[0].n,1);
  await assert.rejects(command(service,user,"receipt.approve",{...cmd,note:"Changed payload"}),/WMS_IDEMPOTENCY_CONFLICT/);
  await assert.rejects(command(service,user,"receipt.edit",{...cmd,reference:"x",supplierName:"Supplier",supplierReference:"s",lines:[receiptLine(p.id)]}));
  await step(service,user,"receipt.reverse",r.id);assert.equal((await core.products(user,"wa",{})).items[0]!.physical,"0.000000");
  const history=await core.movements(user,"wa",{});assert.equal(history.items.filter(m=>m.kind==="RECEIPT"||m.kind==="RECEIPT_REVERSAL").length,2);
  await assert.rejects(db.exec(`DELETE FROM wms_operation_events`),/WMS_LEDGER_IMMUTABLE/);await assert.rejects(db.exec(`UPDATE wms_commands SET result='{}'`),/WMS_LEDGER_IMMUTABLE/);
});
test("Receiving rejects excess/bad dates and audit failure rolls back every posting effect",options,async t=>{
  const {service,core,user,db}=await fixture(t);const p=await product(core,user);
  await assert.rejects(receipt(service,user,p.id,{lines:[receiptLine(p.id,{expectedQuantity:"1"})]}));
  await assert.rejects(receipt(service,user,p.id,{lines:[receiptLine(p.id,{expiryDate:"2026-01-01"})]}),BadRequestException);
  const r=await receipt(service,user,p.id);await step(service,user,"receipt.submit",r.id);await step(service,user,"receipt.review",r.id);
  const failing=wmsPersistence(db,true);const audit=new AuditLogService(failing);const broken=new WmsOperationsService(failing,new WmsService(failing,audit),audit);
  await assert.rejects(step(broken,user,"receipt.approve",r.id),/synthetic audit failure/);
  assert.equal((await service.receipt(user,"wa",r.id)).status,"REVIEWED");assert.equal((await db.query(`SELECT count(*)::int n FROM wms_positions`)).rows[0].n,0);assert.equal((await db.query(`SELECT count(*)::int n FROM wms_batches`)).rows[0].n,0);
  await step(service,user,"receipt.approve",r.id);
  const conflict=await receipt(service,user,p.id,{lines:[receiptLine(p.id,{expiryDate:"2098-01-01"})]});await step(service,user,"receipt.submit",conflict.id);await step(service,user,"receipt.review",conflict.id);
  await assert.rejects(step(service,user,"receipt.approve",conflict.id),/WMS_BATCH_METADATA_CONFLICT/);
});
test("FEFO honors expiry, quarantine and persisted customer shelf life; reserve/cancel are ledger-backed",options,async t=>{
  const {service,core,user,db}=await fixture(t);const p=await product(core,user);
  const today=(await db.query(`SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day`)).rows[0].day;
  for(const [code,days,held]of [["EXPIRED",-1,false],["NEAR",5,false],["ELIGIBLE",60,false],["HELD",45,true]] as const){const expiry=(await db.query(`SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+$1::int,'YYYY-MM-DD') AS day`,[days])).rows[0].day;const b=await core.createBatch(user,"wa",{productId:p.id,code,expiryDate:expiry,isQuarantined:held});await core.postOpening(user,"wa",{productId:p.id,batchId:b.id,quantity:"24",unit:"BASE",reference:code,reason:"Counted fixture stock",idempotencyKey:randomUUID()});}
  const normal=await service.fefo(user,"wa",{productId:p.id,quantity:"30",targetDate:today});assert.equal(normal.choices[0]!.batchCode,"NEAR");assert.equal(normal.choices[1]!.batchCode,"ELIGIBLE");
  await service.setPolicy(user,"wa",{customerCode:"C1",minShelfLifeDays:30,version:0});
  const policy=await service.fefo(user,"wa",{productId:p.id,quantity:"24",targetDate:today,customerCode:"C1"});assert.equal(policy.choices.length,1);assert.equal(policy.choices[0]!.batchCode,"ELIGIBLE");assert.equal(policy.minShelfLifeDays,30);
  const r=await load(service,user,p.id,"24",{targetDate:today,customerCode:"C1"});const requested=await service.load(user,"wa",r.id);const reserve={id:r.id,version:requested.version,note:"Reserve fresh eligible stock",idempotencyKey:randomUUID()};
  const reserved=await command(service,user,"load.reserve",reserve);assert.deepEqual(await command(service,user,"load.reserve",reserve),reserved);
  assert.equal((await service.load(user,"wa",r.id)).allocations[0]!.batchCode,"ELIGIBLE");
  const second=await load(service,user,p.id,"1",{targetDate:today,customerCode:"C1"});await assert.rejects(step(service,user,"load.reserve",second.id),/WMS_INSUFFICIENT_STOCK/);
  await step(service,user,"load.cancel",r.id);assert.equal((await service.load(user,"wa",r.id)).status,"CANCELLED");
  assert.equal((await db.query(`SELECT sum(reserved)::text n FROM wms_positions`)).rows[0].n,"0.000000");
  await step(service,user,"load.reserve",second.id);assert.equal((await core.movements(user,"wa",{})).items.filter(m=>m.kind==="RELEASE").length,1);
});
test("Picking discrepancy releases surplus; dispatch stays in transit until named recipient accepts exactly once",options,async t=>{
  const {service,core,user,db}=await fixture(t);const p=await product(core,user);const r=await receipt(service,user,p.id);await post(service,user,r.id);
  const request=await load(service,user,p.id,"24");await step(service,user,"load.reserve",request.id);let doc=await service.load(user,"wa",request.id);const allocation=doc.allocations[0]!;
  await assert.rejects(step(service,user,"load.pick",request.id,{allocations:[{id:allocation.id,quantity:"25"}]}),/WMS_OVER_PICK/);
  await assert.rejects(step(service,user,"load.pick",request.id,{allocations:[{id:allocation.id,quantity:"12"}]}),/WMS_DISCREPANCY_REASON_REQUIRED/);
  await step(service,user,"load.pick",request.id,{allocations:[{id:allocation.id,quantity:"12"}],discrepancyReason:"One carton not picked"});
  assert.equal((await db.query(`SELECT sum(reserved)::text n FROM wms_positions`)).rows[0].n,"12.000000");
  await assert.rejects(step(service,user,"load.dispatch",request.id),/WMS_INVALID_TRANSITION/);
  await step(service,user,"load.review",request.id);await step(service,user,"load.approve",request.id);await step(service,user,"load.dispatch",request.id);
  assert.equal((await service.load(user,"wa",request.id)).status,"IN_TRANSIT");const stock=(await core.products(user,"wa",{})).items[0]!;assert.equal(stock.physical,"72.000000");assert.equal(stock.inTransit,"12.000000");assert.equal((await db.query(`SELECT count(*)::int n FROM wms_custody_positions`)).rows[0].n,0);
  await assert.rejects(step(service,user,"load.cancel",request.id),/WMS_INVALID_TRANSITION/);await assert.rejects(step(service,user,"load.accept",request.id),/WMS_INVALID_TRANSITION/);
  const recipient=actor("a","clerk-a","SALES_REP");await step(service,recipient,"load.accept",request.id);assert.equal((await service.load(user,"wa",request.id)).status,"ACCEPTED");
  assert.equal((await db.query(`SELECT quantity::text n FROM wms_custody_positions`)).rows[0].n,"12.000000");assert.equal((await core.products(user,"wa",{})).items[0]!.inTransit,"0.000000");
  await assert.rejects(step(service,recipient,"load.accept",request.id),/WMS_INVALID_TRANSITION/);
});
test("Policy revalidation blocks dispatch/acceptance, and declined transit returns only into quarantine",options,async t=>{
  const {service,core,user,db}=await fixture(t);const p=await product(core,user);const expiry=(await db.query(`SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+10,'YYYY-MM-DD') AS day`)).rows[0].day;
  const r=await receipt(service,user,p.id,{lines:[receiptLine(p.id,{expiryDate:expiry,quarantinedQuantity:"0",rejectedQuantity:"0"})]});await post(service,user,r.id);
  const request=await load(service,user,p.id,"12",{customerCode:"C1"});await step(service,user,"load.reserve",request.id);const a=(await service.load(user,"wa",request.id)).allocations[0]!;
  await step(service,user,"load.pick",request.id,{allocations:[{id:a.id,quantity:"12"}]});await step(service,user,"load.review",request.id);await step(service,user,"load.approve",request.id);
  await service.setPolicy(user,"wa",{customerCode:"C1",minShelfLifeDays:30,version:0});await assert.rejects(step(service,user,"load.dispatch",request.id),/WMS_QUALITY_OR_STOCK_BLOCKED/);
  await service.setPolicy(user,"wa",{customerCode:"C1",minShelfLifeDays:0,version:1});await step(service,user,"load.dispatch",request.id);
  await service.setPolicy(user,"wa",{customerCode:"C1",minShelfLifeDays:30,version:2});const recipient=actor("a","clerk-a","SALES_REP");await assert.rejects(step(service,recipient,"load.accept",request.id),/WMS_QUALITY_OR_STOCK_BLOCKED/);
  await step(service,recipient,"load.reject",request.id);assert.equal((await service.load(user,"wa",request.id)).status,"RETURN_REQUESTED");assert.equal((await core.products(user,"wa",{})).items[0]!.inTransit,"12.000000");
  await step(service,user,"load.receive-return",request.id);const stock=(await core.products(user,"wa",{})).items[0]!;assert.equal(stock.inTransit,"0.000000");assert.equal(stock.quarantined,"12.000000");assert.equal((await db.query(`SELECT count(*)::int n FROM wms_custody_positions`)).rows[0].n,0);
});
test("All operations reject missing capability and tenant/warehouse scope; nonpositive loading creates no effects",options,async t=>{
  const {service,core,user,db}=await fixture(t);const p=await product(core,user);const readOnly={...user,permissions:["sfa.access","wms.read"]};
  for(const op of Object.keys(WMS_OPERATION_PERMISSIONS).filter(op=>!(op in wmsCoreInputs)) as WmsOperation[]){const input=op==="receipt.create"?{reference:"x",supplierName:"s",supplierReference:"s",lines:[receiptLine(p.id)]}:op==="receipt.edit"?{id:"x",version:1,reference:"x",supplierName:"s",supplierReference:"s",lines:[receiptLine(p.id)],note:"Edit receipt"}:op==="load.create"?{reference:"x",source:"MANUAL",recipientId:"clerk-a",targetDate:"2026-10-20",lines:[{productId:p.id,quantity:"1",unit:"BASE"}]}:op==="load.pick"?{id:"x",version:1,note:"Pick stock",allocations:[{id:"a",quantity:"1"}]}:{id:"x",version:1,note:"Workflow step"};await assert.rejects(command(service,readOnly,op,input),ForbiddenException);}
  for(const kind of ["receipt","load"] as const){await assert.rejects(service.list(actor("b","actor-b"),"wa",kind,{}),NotFoundException);await assert.rejects(service.list(actor("a","unknown","MANAGER"),"wa",kind,{}),NotFoundException);}
  await assert.rejects(load(service,user,p.id,"0"),BadRequestException);await assert.rejects(load(service,user,p.id,"-1"),BadRequestException);
  await assert.rejects(load(service,user,p.id,"1",{recipientId:"actor-b"}),/WMS_RECIPIENT_NOT_FOUND/);
  await assert.rejects(receipt(service,user,p.id,{companyId:"b"}),BadRequestException);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_load_requests`)).rows[0].n,0);
});

test("Multi-line shortages and allocation bounds roll back all earlier reservations without silent correction",options,async t=>{
  const {service,core,user,db}=await fixture(t);const p=await product(core,user,"A"),missing=await product(core,user,"Z");
  const r=await receipt(service,user,p.id);await post(service,user,r.id);
  const request=await load(service,user,p.id,"1",{lines:[{productId:p.id,quantity:"1",unit:"BASE"},{productId:missing.id,quantity:"1",unit:"BASE"}]});
  await assert.rejects(step(service,user,"load.reserve",request.id),/WMS_INSUFFICIENT_STOCK/);
  assert.equal((await service.load(user,"wa",request.id)).status,"REQUESTED");
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_allocations`)).rows[0].n,0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_movements WHERE kind='RESERVE'`)).rows[0].n,0);
  await assert.rejects(command(service,user,"load.cancel",{id:request.id,version:99,note:"Outdated document"}),/WMS_DOCUMENT_STALE/);
  await assert.rejects(service.fefo(user,"wa",{productId:p.id,quantity:"0.1",targetDate:"2026-10-20"}),/WMS_FRACTIONAL_PIECE/);
  await db.exec(`INSERT INTO wms_batches(id,company_id,product_id,code,expiry_date) SELECT 'many-'||g,'a','${missing.id}','LOT-'||g,'2099-01-01' FROM generate_series(1,101) g;
    INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) SELECT 'a','wa','many-'||g,1 FROM generate_series(1,101) g;`);
  const preview=await service.fefo(user,"wa",{productId:missing.id,quantity:"101",targetDate:"2026-10-20"});assert.equal(preview.limitExceeded,true);assert.equal(preview.fulfillable,false);
  const many=await load(service,user,missing.id,"101");await assert.rejects(step(service,user,"load.reserve",many.id),/WMS_ALLOCATION_LIMIT/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_allocations`)).rows[0].n,0);
});
