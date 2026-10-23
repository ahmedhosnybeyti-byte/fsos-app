import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BadRequestException,ForbiddenException,NotFoundException } from "@nestjs/common";
import { wmsAdapter,wmsFixture,wmsUser } from "./wms-test-fixture";

const options={skip:process.env.RIE_TEST_PGLITE_MODULE?false:"Isolated PostgreSQL runtime required"};
async function fixture(t:any) {
  const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!); const db=new PGlite();t.after(()=>db.close());
  const service=await wmsFixture(db); return {db,service,user:wmsUser()};
}
const product={code:"WATER",name:"Water",piecesPerCarton:24,trackBatches:true,trackExpiry:true};
const opening=(productId:string,batchId:string|null=null,extra={})=>({productId,batchId,quantity:"2",unit:"CARTON",reference:randomUUID(),reason:"Verified opening count",idempotencyKey:randomUUID(),...extra});
test("WMS category ordering stays scoped and paged; carton totals divide before summing mixed packaging",options,async t=>{
 const {db,service,user}=await fixture(t);
 const a=await service.saveProduct(user,"wa",{code:"MILK",name:"Milk",piecesPerCarton:12});
 const b=await service.saveProduct(user,"wa",{code:"SNACK",name:"Snack",piecesPerCarton:24});
 await service.postOpening(user,"wa",opening(a.id,null,{quantity:"100"}));
 await service.postOpening(user,"wa",opening(b.id,null,{quantity:"100"}));
 await db.exec(`INSERT INTO rie_canonical_entity_rows VALUES('a','Products','MILK','{"Category":"Dairy"}'),('a','Products','SNACK','{"Category":"Snacks"}'),('b','Products','MILK','{"Category":"FOREIGN"}');`);
 const products=await service.products(user,"wa",{});
 assert.deepEqual(products.items.map(p=>[p.code,p.category]),[["MILK","Dairy"],["SNACK","Snacks"]]);
 assert.equal(products.items[0]!.physical,"1200.000000");assert.equal(products.items[1]!.physical,"2400.000000");
 const summary=await service.summary(user,"wa",{});
 assert.equal(Number(summary.cartons!.physical),200);assert.equal(Number(summary.cartons!.available),200);
 assert.equal(Number(summary.units[0]!.physical),3600);
 assert.equal((await service.products(user,"wa",{search:"SNACK"})).items.length,1);
 assert.equal((await service.batches(user,"wa",{})).items[0]!.piecesPerCarton!==undefined,true);
 assert.equal((await service.movements(user,"wa",{})).items[0]!.piecesPerCarton!==undefined,true);
 await db.exec(`INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton) SELECT 'extra-'||i,'a','EXTRA-'||i,'Extra '||i,12 FROM generate_series(1,22) i`);
 const first=await service.products(user,"wa",{}),second=await service.products(user,"wa",{page:2});
 assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.equal(second.items.length,4);assert.equal(second.hasMore,false);
 assert.equal(new Set([...first.items,...second.items].map(p=>p.id)).size,24);
});
async function tracked(service:any,user:any,extra={}) {
  const p=await service.saveProduct(user,"wa",{...product,...extra});
  const b=await service.createBatch(user,"wa",{productId:p.id,code:"L1",productionDate:"2026-01-01",expiryDate:"2099-01-01"});return {p,b};
}
test("WMS opening is exact, idempotent, once per position, auditable and explicitly reversible",options,async t=>{
  const {db,service,user}=await fixture(t);const {p,b}=await tracked(service,user);const cmd=opening(p.id,b.id);
  const posted=await service.postOpening(user,"wa",cmd);
  assert.deepEqual(await service.postOpening(user,"wa",{...cmd,quantity:"2.000000"}),posted);
  await assert.rejects(service.postOpening(user,"wa",{...cmd,quantity:"3"}),/WMS_IDEMPOTENCY_CONFLICT/);
  await assert.rejects(service.postOpening(user,"wa",opening(p.id,b.id)),/WMS_OPENING_EXISTS/);
  const rows=await service.products(user,"wa",{});assert.equal(rows.items[0]!.physical,"48.000000");assert.equal(rows.items[0]!.available,"48.000000");
  const summary=await service.summary(user,"wa",{});assert.equal(summary.stockedProducts,1);assert.equal(summary.units[0]!.physical,"48.000000");
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM test_audit WHERE action='wms.opening.posted'`)).rows[0].n,1);
  await assert.rejects(db.exec(`UPDATE wms_movements SET quantity=999`),/WMS_LEDGER_IMMUTABLE/);
  await assert.rejects(db.exec(`DELETE FROM wms_movements`),/WMS_LEDGER_IMMUTABLE/);
  const reversal={reason:"Incorrect count; reverse for recount",idempotencyKey:randomUUID()};
  const reversed=await service.reverseOpening(user,"wa",posted!.id,reversal);
  assert.deepEqual(await service.reverseOpening(user,"wa",posted!.id,reversal),reversed);
  await assert.rejects(service.reverseOpening(user,"wa",posted!.id,{...reversal,idempotencyKey:randomUUID()}),/WMS_ALREADY_REVERSED/);
  assert.equal((await service.products(user,"wa",{})).items[0]!.physical,"0.000000");
  const ledger=await service.movements(user,"wa",{});assert.equal(ledger.items.length,2);assert.equal(ledger.items.find(m=>m.id===posted!.id)!.reversed,true);
  await service.postOpening(user,"wa",opening(p.id,b.id,{quantity:"3"}));
  assert.equal((await service.products(user,"wa",{})).items[0]!.physical,"72.000000");
});
test("WMS quarantined, expired, inactive and unknown-date stock never masquerade as available",options,async t=>{
  const {db,service,user}=await fixture(t);const {p,b}=await tracked(service,user);
  await service.postOpening(user,"wa",opening(p.id,b.id,{quarantined:true}));
  assert.match((await service.products(user,"wa",{})).items[0]!.available,/^0(?:\.0+)?$/);
  await assert.rejects(db.query(`SELECT wms_assert_issuable('a','wa',$1,1)`,[b.id]),/WMS_STOCK_NOT_ISSUABLE/);
  const exp=await service.createBatch(user,"wa",{productId:p.id,code:"EXPIRED",expiryDate:"2000-01-01"});
  await service.postOpening(user,"wa",opening(p.id,exp.id));
  const lots=await service.batches(user,"wa",{});assert.equal(lots.items.find(x=>x.id===exp.id)!.lifeConsumedPct,null);
  assert.equal(lots.items.find(x=>x.id===exp.id)!.available,"0");
  await assert.rejects(db.query(`SELECT wms_assert_issuable('a','wa',$1,1)`,[exp.id]),/WMS_STOCK_NOT_ISSUABLE/);
  const today=(await db.query(`SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS date`)).rows[0].date;
  const boundary=await service.createBatch(user,"wa",{productId:p.id,code:"TODAY",expiryDate:today});
  await service.postOpening(user,"wa",opening(p.id,boundary.id));
  assert.equal((await service.batches(user,"wa",{})).items.find(x=>x.id===boundary.id)!.available,"0");
  const fresh=await service.createBatch(user,"wa",{productId:p.id,code:"NEAR",expiryDate:(await db.query(`SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+7,'YYYY-MM-DD') AS date`)).rows[0].date});
  await service.postOpening(user,"wa",opening(p.id,fresh.id));
  assert.equal((await service.batches(user,"wa",{nearExpiry:"true",horizon:7})).items.length,1);
  assert.equal((await service.summary(user,"wa",{horizon:7})).nearExpiryBatches,1);
  const before=await service.products(user,"wa",{});
  await service.saveProduct(user,"wa",{...product,isActive:false,version:before.items[0]!.version},p.id);
  await assert.rejects(db.query(`SELECT wms_assert_issuable('a','wa',$1,1)`,[fresh.id]),/WMS_STOCK_NOT_ISSUABLE/);
  assert.match((await service.products(user,"wa",{})).items[0]!.available,/^0(?:\.0+)?$/);
});
test("WMS SQL rejects cross-tenant keys, unsafe packaging, fractions, negatives and partial failure",options,async t=>{
  const {db,service,user}=await fixture(t);const {p,b}=await tracked(service,user);
  await assert.rejects(service.createBatch(user,"wa",{productId:p.id,code:"MISSING"}),/WMS_EXPIRY_REQUIRED/);
  await assert.rejects(service.postOpening(user,"wa",opening(p.id,null)),/WMS_BATCH_REQUIRED/);
  await assert.rejects(service.postOpening(user,"wa",opening(p.id,b.id,{quantity:"0.01",unit:"BASE"})),/WMS_FRACTIONAL_PIECE/);
  await assert.rejects(service.saveProduct(user,"wa",{...product,piecesPerCarton:12,version:1},p.id),/WMS_PACKAGING_LOCKED/);
  await assert.rejects(service.saveProduct(user,"wa",{...product,version:99},p.id),/WMS_PRODUCT_STALE/);
  const failing=wmsAdapter(db,true);
  await assert.rejects(failing.postOpening(user,"wa",opening(p.id,b.id)),/synthetic audit failure/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_movements`)).rows[0].n,0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM wms_positions`)).rows[0].n,0);
  await assert.rejects(failing.saveProduct(user,"wa",{code:"ROLLBACK",name:"Rollback"}),/synthetic audit failure/);
  assert.equal((await service.products(user,"wa",{})).items.length,1);
  const posted=await service.postOpening(user,"wa",opening(p.id,b.id));
  await db.query(`UPDATE wms_positions SET reserved=1 WHERE batch_id=$1`,[b.id]);
  await assert.rejects(service.reverseOpening(user,"wa",posted!.id,{reason:"Count correction",idempotencyKey:randomUUID()}),/WMS_REVERSAL_STOCK_CHANGED/);
  await assert.rejects(db.exec(`UPDATE wms_positions SET physical=-1`));
  await assert.rejects(db.exec(`UPDATE wms_positions SET reserved=999`));
  await assert.rejects(db.query(`INSERT INTO wms_positions(company_id,warehouse_id,batch_id) VALUES('b','wb',$1)`,[b.id]));
  await assert.rejects(db.query(`INSERT INTO wms_warehouse_access VALUES('a','wa','actor-b',now())`));
});
test("WMS warehouse scope is enforced for every read/write; resource assignment never grants capabilities",options,async t=>{
  const {service,user}=await fixture(t);const {p,b}=await tracked(service,user);
  const clerk=wmsUser("a","clerk-a","SALES_REP");
  assert.equal((await service.warehouses(clerk,{})).items.length,0);
  for(const method of ["summary","products","batches","movements"] as const){
    await assert.rejects(service[method](clerk,"wa",{}),NotFoundException);
    await assert.rejects(service[method](wmsUser("b","actor-b"),"wa",{}),NotFoundException);
  }
  await service.setAccess(user,"wa",{userId:"clerk-a",granted:true});
  assert.equal((await service.warehouses(clerk,{})).items.length,1);
  assert.equal((await service.products(clerk,"wa",{})).items.length,1);
  await assert.rejects(service.postOpening(clerk,"wa2",opening(p.id,b.id)),NotFoundException);
  await assert.rejects(service.setAccess(clerk,"wa",{userId:"clerk-a",granted:false}),ForbiddenException);
  const readOnly={...clerk,permissions:["sfa.access","wms.read"]};
  await assert.rejects(service.postOpening(readOnly,"wa",opening(p.id,b.id)),ForbiddenException);
  await assert.rejects(service.saveProduct(readOnly,"wa",{code:"DENIED",name:"Denied"}),ForbiddenException);
  await assert.rejects(service.setAccess(user,"wa",{userId:"actor-b",granted:true}),NotFoundException);
  await assert.rejects(service.postOpening(wmsUser("b","actor-b"),"wb",opening(p.id,b.id)),/WMS_PRODUCT_NOT_FOUND/);
  await service.setAccess(user,"wa",{userId:"clerk-a",granted:false});
  await assert.rejects(service.products(clerk,"wa",{}),NotFoundException);
  await assert.rejects(service.products(user,"wa",{page:1001}),BadRequestException);
  await assert.rejects(service.postOpening(user,"wa",{...opening(p.id,b.id),companyId:"b"}),BadRequestException);
});
test("WMS exact fractional base quantities and bounded pages keep unlike units separate",options,async t=>{
  const {service,user}=await fixture(t);
  const kg=await service.saveProduct(user,"wa",{code:"KG",name:"Bulk",baseUnit:"KG"});
  await service.postOpening(user,"wa",opening(kg.id,null,{quantity:"0.000001",unit:"BASE"}));
  const piece=await service.saveProduct(user,"wa",{code:"PC",name:"Piece"});
  await service.postOpening(user,"wa",opening(piece.id,null,{quantity:"1",unit:"BASE"}));
  assert.equal((await service.summary(user,"wa",{})).units.length,2);
  assert.equal((await service.products(user,"wa",{search:"KG"})).items[0]!.physical,"0.000001");
  for(let i=0;i<22;i++)await service.saveProduct(user,"wa",{code:`P${i}`,name:`Product ${i}`});
  const first=await service.products(user,"wa",{});const second=await service.products(user,"wa",{page:2});
  assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.equal(second.items.length,4);assert.equal(second.hasMore,false);
});
