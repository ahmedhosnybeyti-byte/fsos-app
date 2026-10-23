import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {BadRequestException,ConflictException,ForbiddenException,NotFoundException} from "@nestjs/common";
import {draftFixture,draftAdapter,draftUser,protectedSnapshot} from "./sales-drafts-test-fixture";
import {wmsPersistence} from "../wms/wms-test-fixture";
import {AuditLogService} from "../audit-log/audit-log.service";
import {SalesPriceExceptionsService} from "./sales-price-exceptions.service";
import {PRICE_EXCEPTION_PERMISSIONS as P,priceExceptionCreateSchema,priceExceptionDecisionSchema} from "@field-sales-os/schemas";

test("B2 price requests: isolated roles, immutable approval and no price/financial/stock execution",async t=>{
 assert.ok(process.env.RIE_TEST_PGLITE_MODULE);const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());await draftFixture(db);
 await db.exec(`CREATE TABLE roles(id text PRIMARY KEY,code text UNIQUE);ALTER TABLE users ADD COLUMN role_id text REFERENCES roles(id);ALTER TABLE users ADD COLUMN email text;
  CREATE TABLE role_permissions(role_id text REFERENCES roles(id),permission_id text REFERENCES permissions(id),PRIMARY KEY(role_id,permission_id));
  CREATE TABLE IF NOT EXISTS rie_canonical_entity_rows(company_id text,entity_name text,entity_key text,data jsonb);
  INSERT INTO rie_canonical_entity_rows(company_id,entity_name,data) VALUES('a','Customers','{"CustomerCode":"C1","RouteID":"r1","Channel":"Cash Van"}'),('b','Customers','{"CustomerCode":"C1","RouteID":"r1","Channel":"Cash Van"}');
  INSERT INTO roles VALUES('rep','SALES_REP'),('sup','SUPERVISOR'),('mgr','MANAGER'),('acc','ACCOUNTANT');
  UPDATE users SET role_id='rep',email='rep@example.invalid' WHERE id IN('clerk-a','actor-b');
  UPDATE users SET role_id='acc' WHERE id='actor-a';
  INSERT INTO users(id,company_id,full_name,role_id,email) VALUES('sup','a','Supervisor','sup','sup@example.invalid'),('mgr','a','Manager','mgr','mgr@example.invalid');`);
 await db.exec(readFileSync("packages/database/prisma/migrations/20261023001000_sales_price_exceptions/migration.sql","utf8"));
 const grants={rep:["sfa.access","visits.execute","sales.drafts.manage",P.request],sup:["sfa.access",P.review],mgr:["sfa.access",P.approve],acc:["sfa.access","accounting.read",P.accounting]};
 for(const [role,codes]of Object.entries(grants))for(const code of codes){await db.query("INSERT INTO permissions(id,code) VALUES($1,$1) ON CONFLICT(code) DO NOTHING",[code]);await db.query("INSERT INTO role_permissions SELECT $1,id FROM permissions WHERE code=$2 ON CONFLICT DO NOTHING",[role,code]);}
 const rep={...draftUser(),permissions:grants.rep},sup={...draftUser("a","sup"),roleCode:"SUPERVISOR" as const,permissions:grants.sup},mgr={...draftUser("a","mgr"),roleCode:"MANAGER" as const,permissions:grants.mgr},acc={...draftUser("a","actor-a"),roleCode:"ACCOUNTANT" as const,permissions:grants.acc};
 const draftService=draftAdapter(db).service;let d=await draftService.create(rep,"visit",{commandKey:randomUUID()});d=await draftService.save(rep,"visit",d.id,{commandKey:randomUUID(),version:d.version,warehouseId:"wa",notes:"B2 preserved draft",lines:[{productId:"p",quantity:"2",unit:"CARTON"}]});
 const controls={allowed:true};const adapter=(fail=false)=>{const prisma=wmsPersistence(db,fail);return new SalesPriceExceptionsService(prisma,{queryCanonicalRecords:async(q:any)=>({records:controls.allowed?(await db.query("SELECT data FROM rie_canonical_entity_rows WHERE company_id=$1 AND entity_name='Customers' AND data->>'CustomerCode'=$2",[q.companyId,q.scope.customer.values[0]])).rows.map((r:any)=>r.data):[]})} as never,{resolveAllowedRouteIds:async()=>new Set(controls.allowed?["r1"]:[])} as never,new AuditLogService(prisma));};const s=adapter();
 const body=(extra={})=>({commandKey:randomUUID(),draftId:d.id,draftVersion:d.version,productId:"p",kind:"SPECIAL_PRICE",value:"10.123456",currency:"SAR",reason:"Official customer exception",desiredFrom:"2026-11-01",desiredTo:null,evidenceType:"EMAIL",evidenceReference:"Company archive reference 001",...extra});
 const decision=(version:number,action="FORWARD",extra={})=>({commandKey:randomUUID(),version,decision:action,reason:"Official evidence reviewed",evidenceType:"EMAIL",evidenceReference:"Official approval archive 002",evidenceAttested:true,...extra});
 const before=await protectedSnapshot(db);const canonicalBefore=(await db.query("SELECT data FROM rie_canonical_entity_rows ORDER BY company_id")).rows;let r:any;
 await t.test("strict proposals reject identity/financial spoofing, invalid decimals/dates and unverified evidence",async()=>{
  for(const x of [body({companyId:"b"}),body({status:"APPROVED"}),body({priceBefore:"1"}),body({value:"1.0000001"}),body({value:"0"}),body({desiredFrom:"2026-02-30"}),body({desiredTo:"2025-01-01"}),body({kind:"DISCOUNT_PERCENT",value:"101",currency:null}),body({attachments:["arbitrary"]})])assert.equal(priceExceptionCreateSchema.safeParse(x).success,false);
  assert.equal(priceExceptionDecisionSchema.safeParse(decision(0,"APPROVE",{evidenceAttested:false})).success,false);
  assert.equal(priceExceptionCreateSchema.safeParse(body({desiredFrom:"0000-01-01"})).success,false);
  for(const c of [["1",randomUUID()],["2026-10-23T00:00:00.000Z","-".repeat(36)]])await assert.rejects(s.list(rep,{cursor:Buffer.from(JSON.stringify(c)).toString("base64url")}),BadRequestException);
 });
 await t.test("durable duplicate retry returns identical request, re-key duplicate open request conflicts",async()=>{
  const b=body();r=await s.create(rep,b);assert.equal(r.channel,"Cash Van");assert.equal(r.unit,"CARTON");assert.equal(r.conversionFactor,12);assert.equal(r.value,"10.123456");assert.equal(r.priceBefore,null);assert.equal(r.activation,"REQUIRES_SETUP");assert.equal(r.events.length,1);
  assert.deepEqual(await s.create(rep,b),r);await assert.rejects(s.create(rep,{...b,value:"11"}),ConflictException);await assert.rejects(s.create(rep,body()),ConflictException);
 });
 await t.test("deny skipped stages, wrong roles, missing permissions, company/route and inactive access",async()=>{
  await assert.rejects(s.decide(mgr,r.id,decision(0,"APPROVE")),ConflictException);await assert.rejects(s.decide(rep,r.id,decision(0)),ForbiddenException);await assert.rejects(s.decide(acc,r.id,decision(0,"APPROVE")),ForbiddenException);
  await assert.rejects(s.decide(sup,r.id,decision(0,"APPROVE")),ForbiddenException);await assert.rejects(s.decide(mgr,r.id,decision(0,"FORWARD")),ForbiddenException);
  await assert.rejects(s.decide(sup,r.id,decision(0,"REJECT")),ForbiddenException);
  await assert.rejects(db.transaction(async(tx:any)=>{await tx.query("SELECT set_config('murshidak.price_actor','sup',true)");await tx.query("UPDATE sales_price_requests SET status='REJECTED',version=1,reviewed_by='sup' WHERE id=$1",[r.id])}),/PRICE_INVALID_TRANSITION/);
  for(const p of sup.permissions)await assert.rejects(s.read({...sup,permissions:sup.permissions.filter(x=>x!==p)},r.id),ForbiddenException);
  await assert.rejects(s.read({...rep,companyId:"b",userId:"actor-b"},r.id),NotFoundException);
  controls.allowed=false;await assert.rejects(s.read(sup,r.id),NotFoundException);assert.equal((await s.list(sup,{})).items.length,0);controls.allowed=true;
  await db.exec("UPDATE users SET status='DISABLED' WHERE id='sup'");await assert.rejects(s.read(sup,r.id),ForbiddenException);await db.exec("UPDATE users SET status='ACTIVE' WHERE id='sup'");
  await db.exec("UPDATE company_operating_settings SET operating_mode='ANALYSIS_ONLY' WHERE company_id='a'");await assert.rejects(s.read(rep,r.id),ForbiddenException);await db.exec("UPDATE company_operating_settings SET operating_mode='SFA' WHERE company_id='a'");
 });
 await t.test("distinct actors survive role changes; current database permission revocation wins over stale claims",async()=>{
  await db.exec("UPDATE users SET role_id='sup' WHERE id='clerk-a'");await assert.rejects(s.decide({...sup,userId:rep.userId},r.id,decision(0)),ForbiddenException);await db.exec("UPDATE users SET role_id='rep' WHERE id='clerk-a'");
  await db.query("DELETE FROM role_permissions WHERE role_id='sup' AND permission_id=(SELECT id FROM permissions WHERE code=$1)",[P.review]);await assert.rejects(s.decide(sup,r.id,decision(0)),ForbiddenException);
  await db.query("INSERT INTO role_permissions SELECT 'sup',id FROM permissions WHERE code=$1",[P.review]);
 });
 await t.test("audit failure rolls back decision, version, event and command before valid forward/approval",async()=>{
  const previous=await s.read(rep,r.id);await assert.rejects(adapter(true).decide(sup,r.id,decision(0)),/synthetic audit failure/);assert.deepEqual(await s.read(rep,r.id),previous);
  const forward=decision(0);r=await s.decide(sup,r.id,forward);assert.equal(r.status,"REVIEWED");assert.deepEqual(await s.decide(sup,r.id,forward),r);await assert.rejects(s.decide(sup,r.id,decision(0)),ConflictException);
  await db.exec("UPDATE users SET role_id='mgr' WHERE id='sup'");await assert.rejects(s.decide({...mgr,userId:sup.userId},r.id,decision(1,"APPROVE")),ForbiddenException);await db.exec("UPDATE users SET role_id='sup' WHERE id='sup'");
  const approve=decision(1,"APPROVE");r=await s.decide(mgr,r.id,approve);assert.equal(r.status,"APPROVED");assert.equal(r.events.length,3);assert.equal(r.decidedBy,mgr.userId);assert.equal(r.activation,"REQUIRES_SETUP");assert.deepEqual(await s.decide(mgr,r.id,approve),r);
  assert.equal((await s.list(acc,{})).items[0]!.id,r.id);await assert.rejects(s.decide(mgr,r.id,decision(2,"REJECT")),ConflictException);
 });
 await t.test("SQL prevents proposal tampering, deletion, forged terminal states and history changes",async()=>{
  for(const sql of ["UPDATE sales_price_requests SET proposed_value=1", "DELETE FROM sales_price_requests", "UPDATE sales_price_events SET evidence_reference='rewritten'", "DELETE FROM sales_price_events", "DELETE FROM sales_price_commands", "UPDATE sales_price_requests SET status='EXECUTED'"])await assert.rejects(db.exec(sql));
 });
 await t.test("rejection is terminal; approved queue excludes unapproved requests; changed customer scope fails closed",async()=>{
  let next=await s.create(rep,body({kind:"DISCOUNT_PERCENT",currency:null,value:"7.5"}));assert.equal((await s.list(acc,{})).items.length,1);await assert.rejects(s.read(acc,next.id),NotFoundException);
  await db.exec(`UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{Channel}','"HORECA"') WHERE company_id='a'`);await assert.rejects(s.decide(sup,next.id,decision(0)),NotFoundException);await db.exec(`UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{Channel}','"Cash Van"') WHERE company_id='a'`);
  next=await s.decide(sup,next.id,decision(0,"FORWARD"));next=await s.decide(mgr,next.id,decision(1,"REJECT"));assert.equal(next.status,"REJECTED");await assert.rejects(s.decide(mgr,next.id,decision(2,"APPROVE")),ConflictException);
 });
 await t.test("keyset pages are bounded and do not repeat IDs",async()=>{
  for(let i=0;i<21;i++){const n=await s.create(rep,body({kind:"DISCOUNT_PERCENT",currency:null,value:"5"}));await s.decide(sup,n.id,decision(0,"FORWARD"));await s.decide(mgr,n.id,decision(1,"REJECT"));}
  const a=await s.list(rep,{}),b=await s.list(rep,{cursor:a.nextCursor});assert.equal(a.items.length,20);assert.ok(a.nextCursor);assert.ok(b.items.length>0&&b.items.length<=20);assert.equal(new Set([...a.items,...b.items].map(x=>x.id)).size,a.items.length+b.items.length);
 });
 await t.test("request workflow has no effects on prior draft/stock/custody/GL/AR/canonical data",async()=>{assert.deepEqual(await protectedSnapshot(db),before);assert.deepEqual((await db.query("SELECT data FROM rie_canonical_entity_rows ORDER BY company_id")).rows,canonicalBefore);assert.deepEqual(await draftService.read(rep,"visit",d.id),d)});
});
