import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {draftFixture,draftAdapter,draftUser,protectedSnapshot} from "./sales-drafts-test-fixture";
import {SALES_DRAFT_PRICE_BLOCKERS,SALES_DRAFT_CREDIT_BLOCKERS} from "@field-sales-os/schemas";

test("B1: preliminary exact unit/lot checks and fail-closed commercial review have no ledger effects",async t=>{
 assert.ok(process.env.RIE_TEST_PGLITE_MODULE,"Required isolated SQL runtime");
 const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());await draftFixture(db);
 const {service}=draftAdapter(db),u=draftUser();let d=await service.create(u,"visit",{commandKey:randomUUID()});
 const save=async(quantity:string,unit:"BASE"|"CARTON"="CARTON",productId="p")=>d=await service.save(u,"visit",d.id,{commandKey:randomUUID(),version:d.version,warehouseId:"wa",notes:"B1",lines:[{productId,quantity,unit}]});
 await db.exec(`INSERT INTO wms_batches(id,company_id,product_id,code,expiry_date) VALUES('near-b1','a','p','NEAR',CURRENT_DATE+2);
  INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('a','wa','near-b1',60);
  INSERT INTO wms_custody_positions(company_id,warehouse_id,batch_id,recipient_id,quantity) VALUES('a','wa','near-b1','clerk-a',12);
  INSERT INTO wms_customer_policies(company_id,customer_code,min_shelf_life_days) VALUES('a','C1',3);`);
 const before=await protectedSnapshot(db);
 await t.test("revision, explicit setup reasons and existing GL balance never imply credit approval",async()=>{
  await save("2");const check=await service.check(u,"visit",d.id);
  assert.equal(check.draftId,d.id);assert.equal(check.draftVersion,d.version);assert.equal(check.warehouseId,"wa");assert.equal(check.nonbinding,true);assert.equal(check.approvalAllowed,false);
  assert.equal(check.commercial.pricing.reason,"REQUIRES_SETUP");assert.deepEqual(check.commercial.pricing.blockers,SALES_DRAFT_PRICE_BLOCKERS);
  assert.equal(check.commercial.credit.state,"NEEDS_REVIEW");assert.deepEqual(check.commercial.credit.blockers,SALES_DRAFT_CREDIT_BLOCKERS);
  assert.equal(check.credit,null);assert.equal(check.priceSource,null);assert.equal(check.lines[0]!.pricingState,"NEEDS_REVIEW");
  assert.ok((await db.query("SELECT count(*)::int n FROM accounting_lines")).rows[0].n>0);
 });
 await t.test("carton boundary uses exact WMS factor; stock and own custody are never summed",async()=>{
  await save("2");let l=(await service.check(u,"visit",d.id)).lines[0]!;
  assert.equal(l.unitState,"AVAILABLE");assert.equal(l.requestedBase,"24.000000");assert.equal(l.warehouseState,"AVAILABLE");assert.equal(l.custodyState,"AVAILABLE");
  await save("3");l=(await service.check(u,"visit",d.id)).lines[0]!;
  assert.equal(l.requestedBase,"36.000000");assert.equal(l.warehouseState,"AVAILABLE");assert.equal(l.custodyState,"UNAVAILABLE");
  await save("121","BASE");l=(await service.check(u,"visit",d.id)).lines[0]!;
  assert.equal(l.warehouseState,"UNAVAILABLE");assert.equal(l.custodyState,"UNAVAILABLE");
 });
 await t.test("near expiry excluded by customer policy; counts/nearest date use only eligible positive lots",async()=>{
  await save("1");let l=(await service.check(u,"visit",d.id)).lines[0]!;
  assert.equal(l.minShelfLifeDays,3);assert.equal(l.warehouseEligibleLots,1);assert.equal(l.custodyEligibleLots,1);
  assert.equal(l.warehouseNearestExpiry,"2099-01-01");assert.equal(l.custodyNearestExpiry,"2099-01-01");
  assert.equal(Number(l.warehouseAvailable),120);assert.equal(Number(l.eligibleCustody),24);assert.equal(Number(l.ownCustody),136);
  // Existing WMS policy change is test setup, not an action performed by check.
  await db.exec("UPDATE wms_customer_policies SET min_shelf_life_days=2 WHERE company_id='a' AND customer_code='C1'");
  l=(await service.check(u,"visit",d.id)).lines[0]!;assert.equal(l.warehouseEligibleLots,2);assert.equal(l.custodyEligibleLots,2);assert.equal(Number(l.warehouseAvailable),180);assert.equal(Number(l.eligibleCustody),36);
  assert.notEqual(l.warehouseNearestExpiry,"2099-01-01");
  await db.exec("UPDATE wms_customer_policies SET min_shelf_life_days=3 WHERE company_id='a' AND customer_code='C1'");
 });
 await t.test("unknown balance never passes; WMS prevents conversion changes and inactive products require review",async()=>{
  await save("1.123456","BASE","kg");let l=(await service.check(u,"visit",d.id)).lines[0]!;
  assert.equal(l.requestedBase,"1.123456");assert.equal(l.unitState,"AVAILABLE");assert.equal(l.warehouseState,"NEEDS_REVIEW");assert.equal(l.custodyState,"NEEDS_REVIEW");assert.equal(l.warehouseEligibleLots,0);assert.equal(l.warehouseNearestExpiry,null);
  await save("1");await assert.rejects(db.exec("UPDATE wms_products SET pieces_per_carton=24 WHERE id='p'"),/WMS_PACKAGING_LOCKED/);
  await db.exec("UPDATE wms_products SET is_active=false WHERE id='p'");
  l=(await service.check(u,"visit",d.id)).lines[0]!;assert.equal(l.state,"PRODUCT_CHANGED");for(const state of [l.unitState,l.warehouseState,l.custodyState])assert.equal(state,"NEEDS_REVIEW");
  assert.equal((await service.read(u,"visit",d.id)).lines[0]!.conversionFactor,12);
  await db.exec("UPDATE wms_products SET is_active=true WHERE id='p'");
 });
 await t.test("check does not mutate drafts, commands, audit or any protected ledger",async()=>{
  const meta=async()=>(await db.query("SELECT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM sales_drafts t) d,(SELECT count(*) FROM sales_draft_commands) c,(SELECT count(*) FROM test_audit) a")).rows;
  const prior=await meta();await service.check(u,"visit",d.id);await service.check(u,"visit",d.id);assert.deepEqual(await meta(),prior);assert.deepEqual(await protectedSnapshot(db),before);
 });
});
