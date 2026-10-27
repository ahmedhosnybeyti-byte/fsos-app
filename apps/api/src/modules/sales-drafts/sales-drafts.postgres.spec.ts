import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from "@nestjs/common";
import {draftFixture,draftAdapter,draftUser,protectedSnapshot} from "./sales-drafts-test-fixture";
const create=()=>({commandKey:randomUUID()});
const save=(version:number,extra={})=>({commandKey:randomUUID(),version,warehouseId:"wa",notes:"ملاحظة محفوظة",lines:[{productId:"p",quantity:"2",unit:"CARTON"}],...extra});
test("Sales drafts: isolated SQL contracts and unchanged operational ledgers",async t=>{
 assert.ok(process.env.RIE_TEST_PGLITE_MODULE,"Required isolated SQL runtime");
 const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());await draftFixture(db);
 const routes={allowed:true};const {service}=draftAdapter(db,false,routes),u=draftUser();
 const before=await protectedSnapshot(db);let d:any;
 await t.test("create/re-key resume and command replay preserve one identity/audit",async()=>{
  const key=create();d=await service.create(u,"visit",key);assert.equal(d.status,"DRAFT");assert.equal(d.customerCode,"C1");assert.equal(d.lines.length,0);
  assert.deepEqual(await service.create(u,"visit",key),d);assert.equal((await service.create(u,"visit",create())).id,d.id);
  assert.equal((await db.query("SELECT count(*)::int n FROM sales_drafts")).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM test_audit WHERE action='sales_draft.create'")).rows[0].n,1);
 });
 await t.test("save/read/reopen exact quantities, immutable snapshots and safe retries",async()=>{
  const cmd=save(0);d=await service.save(u,"visit",d.id,cmd);assert.equal(d.lines[0].quantityBase,"24.000000");assert.equal(d.lines[0].conversionFactor,12);
  assert.deepEqual(await service.save(u,"visit",d.id,cmd),d);assert.deepEqual(await service.read(u,"visit",d.id),d);
  assert.equal((await service.list(u,"visit",{})).items[0]!.id,d.id);
  await assert.rejects(service.save(u,"visit",d.id,{...cmd,notes:"changed payload"}),ConflictException);
  await assert.rejects(service.save(u,"visit",d.id,save(0)),ConflictException);
 });
 await t.test("strict identity, permissions, tenant/rep/route/warehouse isolation",async()=>{
  await assert.rejects(service.create(u,"visit",{...create(),companyId:"b"}),BadRequestException);
  await assert.rejects(service.create({...u,roleCode:"MANAGER"},"visit",create()),ForbiddenException);
  await assert.rejects(service.create({...u,roleCode:"SUPER_ADMIN"},"visit",create()),ForbiddenException);
  for(const permission of u.permissions)await assert.rejects(service.read({...u,permissions:u.permissions.filter(p=>p!==permission)},"visit",d.id),ForbiddenException);
  await assert.rejects(service.read(draftUser("b","actor-b"),"visit",d.id),NotFoundException);
  await assert.rejects(service.read(draftUser("a","actor-a"),"visit",d.id),NotFoundException);
  await assert.rejects(service.read(u,"other-visit",d.id),NotFoundException);
  routes.allowed=false;await assert.rejects(service.read(u,"visit",d.id),NotFoundException);await assert.rejects(service.save(u,"visit",d.id,save(1)),NotFoundException);routes.allowed=true;
  await assert.rejects(service.save(u,"visit",d.id,save(1,{warehouseId:"wb"})),NotFoundException);
  await assert.rejects(service.save(u,"visit",d.id,save(1,{warehouseId:"wa2"})),NotFoundException);
  for(const mode of ["ANALYSIS_ONLY","INVALID"]){await db.query("UPDATE company_operating_settings SET operating_mode=$1 WHERE company_id='a'",[mode]);await assert.rejects(service.read(u,"visit",d.id),ForbiddenException)}
  await db.exec("UPDATE company_operating_settings SET operating_mode='FULL_ERP' WHERE company_id='a'");assert.equal((await service.read(u,"visit",d.id)).id,d.id);
  await db.exec("UPDATE company_operating_settings SET operating_mode='SFA' WHERE company_id='a'");
 });
 await t.test("reject unapproved product/UOM/fraction/over-limit without corrupting content",async()=>{
  for(const productId of ["missing","inactive","pb"])await assert.rejects(service.save(u,"visit",d.id,save(1,{lines:[{productId,quantity:"1",unit:"BASE"}]})),BadRequestException);
  for(const [productId,quantity,unit] of [["p","0.1","BASE"],["kg","1","CARTON"],["p","1","PACK"],["p","1.0000001","BASE"],["p","0","BASE"],["p",1,"BASE"]])await assert.rejects(service.save(u,"visit",d.id,save(1,{lines:[{productId,quantity,unit}]})));
  await assert.rejects(service.save(u,"visit",d.id,save(1,{lines:Array.from({length:21},()=>({productId:"p",quantity:"1",unit:"BASE"}))})),BadRequestException);
  await assert.rejects(service.save(u,"visit",d.id,save(1,{warehouseId:null})),BadRequestException);
  assert.deepEqual(await service.read(u,"visit",d.id),d);
 });
 await t.test("bounded catalogue and nonbinding quantities exclude another rep and expired custody",async()=>{
  const products=await service.products(u,"visit","wa",{});assert.deepEqual(products.items.map(p=>p.id).sort(),["kg","p"]);
  const check=await service.check(u,"visit",d.id);assert.equal(check.pricing,"REQUIRES_SETUP");assert.equal(check.priceSource,null);assert.equal(check.tax,null);assert.equal(check.credit,null);
  assert.equal(Number(check.lines[0]!.warehouseAvailable),120);assert.equal(Number(check.lines[0]!.ownCustody),124);assert.equal(Number(check.lines[0]!.eligibleCustody),24);
  await db.exec("UPDATE wms_products SET is_active=false WHERE id='p'");assert.equal((await service.check(u,"visit",d.id)).lines[0]!.state,"PRODUCT_CHANGED");assert.equal((await service.read(u,"visit",d.id)).lines[0]!.conversionFactor,12);
  await db.exec("UPDATE wms_products SET is_active=true WHERE id='p'");
 });
 await t.test("audit failures roll back create/save/cancel, commands, versions and lines",async()=>{
  const fail=draftAdapter(db,true).service;
  const count=async()=>(await db.query("SELECT (SELECT count(*) FROM sales_draft_commands)::int c,(SELECT count(*) FROM sales_drafts)::int d,(SELECT count(*) FROM test_audit)::int a")).rows[0];const counts=await count();
  await assert.rejects(fail.save(u,"visit",d.id,save(1,{notes:"must roll back",lines:[]})),/synthetic audit failure/);assert.deepEqual(await service.read(u,"visit",d.id),d);
  await assert.rejects(fail.cancel(u,"visit",d.id,{...create(),version:1}),/synthetic audit failure/);assert.deepEqual(await service.read(u,"visit",d.id),d);assert.deepEqual(await count(),counts);
  await assert.rejects(fail.create(draftUser("b","actor-b"),"foreign-visit",create()),/synthetic audit failure/);assert.deepEqual(await count(),counts);
 });
 await t.test("missing operational balances remain unknown, and exact base-weight units can be saved",async()=>{
  d=await service.save(u,"visit",d.id,save(d.version,{lines:[{productId:"kg",quantity:"1.25",unit:"BASE"}]}));
  const line=(await service.check(u,"visit",d.id)).lines[0]!;
  assert.equal(line.requestedBase,"1.250000");
  for(const value of [line.warehouseAvailable,line.ownCustody,line.eligibleCustody,line.warehouseShort,line.custodyShort])assert.equal(value,null);
  d=await service.save(u,"visit",d.id,save(d.version));
 });
 await t.test("cancel retains all content; new intentional draft does not rebind old request keys",async()=>{
  const cmd={...create(),version:d.version};const old=d;d=await service.cancel(u,"visit",d.id,cmd);assert.equal(d.status,"CANCELLED");assert.deepEqual(d.lines,old.lines);assert.deepEqual(await service.cancel(u,"visit",d.id,cmd),d);
  await assert.rejects(service.save(u,"visit",d.id,save(d.version)),ConflictException);
  await assert.rejects(db.exec(`DELETE FROM sales_draft_lines WHERE draft_id='${d.id}'`),/DRAFT_NOT_EDITABLE/);
  const start=create();const next=await service.create(u,"visit",start);assert.notEqual(next.id,d.id);d=await service.save(u,"visit",next.id,save(0));
 });
 await t.test("visit completion freezes drafts and keeps content readable; valid old command replays",async()=>{
  const cmd=save(1);d=await service.save(u,"visit",d.id,cmd);
  await db.exec("UPDATE visit_executions SET status='COMPLETED',completed_at=now(),outcome='ACHIEVED' WHERE id='visit'");
  const frozen=await service.read(u,"visit",d.id);assert.equal(frozen.editable,false);assert.deepEqual(frozen.lines,d.lines);
  await assert.rejects(service.save(u,"visit",d.id,save(2)),ConflictException);await assert.rejects(service.cancel(u,"visit",d.id,{...create(),version:2}),ConflictException);await assert.rejects(service.create(u,"visit",create()),ConflictException);
  assert.deepEqual(await service.save(u,"visit",d.id,cmd),d);
 });
 await t.test("all draft operations have zero stock/custody/GL/AR/reference effects",async()=>{assert.deepEqual(await protectedSnapshot(db),before)});
});

test("Sales draft grouped stock/custody eligibility preserves WMS function parity without per-lot function probes",async t=>{
 assert.ok(process.env.RIE_TEST_PGLITE_MODULE,"Required isolated SQL runtime");
 const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());await draftFixture(db);
 await db.exec(`INSERT INTO wms_batches(id,company_id,product_id,code,expiry_date,is_quarantined) VALUES
  ('near','a','p','NEAR',CURRENT_DATE+2,false),('held','a','p','HELD','2099-01-01',true),
  ('blocked','a','p','BLOCKED','2099-01-01',false),('undated','a','p','UNDATED',NULL,false);
  INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical,quality_blocked) VALUES
  ('a','wa','near',12,false),('a','wa','held',12,false),('a','wa','blocked',12,true),('a','wa','undated',12,false);
  INSERT INTO wms_custody_positions(company_id,warehouse_id,batch_id,recipient_id,quantity) VALUES
  ('a','wa','near','clerk-a',6),('a','wa','held','clerk-a',6),('a','wa','blocked','clerk-a',6),('a','wa','undated','clerk-a',6);`);
 const {service}=draftAdapter(db),u=draftUser();const first=await service.create(u,"visit",create());const d=await service.save(u,"visit",first.id,save(0));
 for(const minDays of [0,2,3,60]){
  await db.query("INSERT INTO wms_customer_policies(company_id,customer_code,min_shelf_life_days) VALUES('a','C1',$1) ON CONFLICT(company_id,customer_code) DO UPDATE SET min_shelf_life_days=excluded.min_shelf_life_days",[minDays]);
  const expected=(await db.query(`SELECT
   (SELECT sum(CASE WHEN (b.expiry_date IS NOT NULL OR NOT p.track_expiry) AND
     (b.expiry_date IS NULL AND wms_min_days('a','C1')=0 OR b.expiry_date>=CURRENT_DATE+wms_min_days('a','C1')) THEN s.available ELSE 0 END)
    FROM wms_inventory_state s JOIN wms_batches b ON b.company_id=s.company_id AND b.id=s.batch_id JOIN wms_products p ON p.company_id=b.company_id AND p.id=b.product_id
    WHERE s.company_id='a' AND s.warehouse_id='wa' AND s.product_id='p')::text stock,
   sum(CASE WHEN p.is_active AND NOT b.is_quarantined AND NOT coalesce(pos.quality_blocked,true)
    AND (b.expiry_date IS NOT NULL OR NOT p.track_expiry) AND wms_custody_quality('a',b.id,CURRENT_DATE,wms_min_days('a','C1')) THEN s.quantity ELSE 0 END)::text eligible
   FROM wms_custody_positions s JOIN wms_batches b ON b.company_id=s.company_id AND b.id=s.batch_id JOIN wms_products p ON p.company_id=b.company_id AND p.id=b.product_id
   LEFT JOIN wms_positions pos ON pos.company_id=s.company_id AND pos.warehouse_id=s.warehouse_id AND pos.batch_id=s.batch_id
   WHERE s.company_id='a' AND s.warehouse_id='wa' AND s.recipient_id='clerk-a' AND b.product_id='p'`)).rows[0];
  const line=(await service.check(u,"visit",d.id)).lines[0]!;assert.equal(Number(line.warehouseAvailable),Number(expected.stock));assert.equal(Number(line.eligibleCustody),Number(expected.eligible));
 }
});
