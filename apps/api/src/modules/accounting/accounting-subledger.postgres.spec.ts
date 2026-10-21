import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BadRequestException,ForbiddenException,NotFoundException } from "@nestjs/common";
import { subledgerAdapter,subledgerFixture,subledgerUser } from "./accounting-subledger-test-fixture";
const options={skip:process.env.RIE_TEST_PGLITE_MODULE?false:"Isolated PostgreSQL runtime required"};
const command=(extra={})=>({idempotencyKey:randomUUID(),date:"2026-10-21",reference:randomUUID(),reason:"Synthetic explicit Demo balance",amount:"1000",...extra});
async function fixture(t:any){
 const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());const {core,service}=await subledgerFixture(db);const user=subledgerUser();
 for(const a of [{code:"1000",name:"Cash",type:"ASSET"},{code:"1010",name:"Bank",type:"ASSET"},{code:"1200",name:"Demo AR",type:"ASSET"},{code:"2100",name:"Demo AP",type:"LIABILITY"},{code:"3000",name:"Equity",type:"EQUITY"}])await core.createAccount(user,a);
 const {amount:fundingAmount,...funding}=command();await core.post(user,{...funding,lines:[{accountCode:"1000",debit:fundingAmount},{accountCode:"3000",credit:fundingAmount}]});
 const customer=await service.createParty(user,{kind:"CUSTOMER",code:"C1",name:"Demo customer",accountCode:"1200"});const supplier=await service.createParty(user,{kind:"SUPPLIER",code:"S1",name:"Demo supplier",accountCode:"2100"});
 await service.registerTreasury(user,{accountCode:"1000",kind:"CASH"});await service.registerTreasury(user,{accountCode:"1010",kind:"BANK"});
 return {db,core,service,user,customer,supplier};
}
async function opened(f:Awaited<ReturnType<typeof fixture>>){
 const ar=await f.service.opening(f.user,{...command(),partyId:f.customer.id,equityAccountCode:"3000"});const ap=await f.service.opening(f.user,{...command(),partyId:f.supplier.id,equityAccountCode:"3000"});return {ar,ap};
}
test("Phase 2 Demo AR/AP: 1000 − 300 = 700, linked exact journals and existing trial balance",options,async t=>{
 const f=await fixture(t);await opened(f);
 const receipt=await f.service.receipt(f.user,{...command({amount:"300"}),partyId:f.customer.id,treasuryAccountCode:"1000"});
 const payment=await f.service.payment(f.user,{...command({amount:"300"}),partyId:f.supplier.id,treasuryAccountCode:"1000"});
 assert.equal((await f.service.parties(f.user,{kind:"CUSTOMER"})).items[0]!.balance,"700.00");assert.equal((await f.service.parties(f.user,{kind:"SUPPLIER"})).items[0]!.balance,"700.00");
 const ar=await f.core.journal(f.user,receipt.journalId),ap=await f.core.journal(f.user,payment.journalId);
 assert.deepEqual(ar.items.map(({accountCode,debit,credit})=>({accountCode,debit,credit})),[{accountCode:"1200",debit:"0.00",credit:"300.00"},{accountCode:"1000",debit:"300.00",credit:"0.00"}]);
 assert.deepEqual(ap.items.map(({accountCode,debit,credit})=>({accountCode,debit,credit})),[{accountCode:"2100",debit:"300.00",credit:"0.00"},{accountCode:"1000",debit:"0.00",credit:"300.00"}]);
 assert.equal((await f.service.statement(f.user,f.customer.id,{})).items.length,2);const trial=await f.core.trial(f.user,{asOf:"2026-10-21"});assert.equal(trial.totals.debit,trial.totals.credit);assert.equal(trial.items.find(a=>a.code==="1200")!.balanceDebit,"700.00");assert.equal(trial.items.find(a=>a.code==="2100")!.balanceCredit,"700.00");
 assert.equal((await f.service.statement(f.user,f.customer.id,{})).items.find(v=>v.kind==="OPENING")!.origin,"EXPLICIT_OPENING");
});
test("Phase 2 idempotency, business-reference uniqueness, opening-once and exact sub-halala rejection",options,async t=>{
 const f=await fixture(t);const opening={...command(),partyId:f.customer.id,equityAccountCode:"3000"};const first=await f.service.opening(f.user,opening);assert.deepEqual(await f.service.opening(f.user,{...opening,amount:"1000.00"}),first);
 await assert.rejects(f.service.opening(f.user,{...opening,idempotencyKey:randomUUID()}),/ACC_OPENING_EXISTS/);
 const cmd={...command({amount:"0.10"}),partyId:f.customer.id,treasuryAccountCode:"1010"};const r=await f.service.receipt(f.user,cmd);assert.deepEqual(await f.service.receipt(f.user,cmd),r);
 await assert.rejects(f.service.receipt(f.user,{...cmd,amount:"0.20"}),/ACC_IDEMPOTENCY_CONFLICT/);await assert.rejects(f.service.receipt(f.user,{...cmd,idempotencyKey:randomUUID()}),/ACC_DUPLICATE_REFERENCE/);
 for(const amount of ["0","-1","0.001","NaN","1e2",100])await assert.rejects(f.service.receipt(f.user,{...cmd,idempotencyKey:randomUUID(),amount}),BadRequestException);
 assert.equal((await f.service.parties(f.user,{kind:"CUSTOMER"})).items[0]!.balance,"999.90");assert.equal((await f.service.treasury(f.user,{})).items.find(a=>a.accountCode==="1010")!.balance,"0.10");
});
test("Phase 2 overpayment, insufficient cash, matching account types and chronological settlement are enforced",options,async t=>{
 const f=await fixture(t);await opened(f);
 await assert.rejects(f.service.receipt(f.user,{...command({amount:"1000.01"}),partyId:f.customer.id,treasuryAccountCode:"1000"}),/ACC_AMOUNT_EXCEEDS_DUE/);
 await assert.rejects(f.service.payment(f.user,{...command({amount:"1"}),partyId:f.supplier.id,treasuryAccountCode:"1010"}),/ACC_INSUFFICIENT_FUNDS/);
 await assert.rejects(f.service.payment(f.user,{...command(),partyId:f.customer.id,treasuryAccountCode:"1000"}),/ACC_VOUCHER_PARTY_MISMATCH/);
 await assert.rejects(f.service.receipt(f.user,{...command({date:"2026-10-20",amount:"10"}),partyId:f.customer.id,treasuryAccountCode:"1000"}),/ACC_VOUCHER_BACKDATED/);
 await assert.rejects(f.service.registerTreasury(f.user,{accountCode:"2100",kind:"BANK"}),/ACC_INVALID_TREASURY_ACCOUNT/);
 await assert.rejects(f.service.createParty(f.user,{kind:"SUPPLIER",code:"BAD",name:"Wrong asset",accountCode:"1010"}),/ACC_PARTY_ACCOUNT_REQUIRES_UNUSED_MATCHING_TYPE/);
 await assert.rejects(f.service.receipt(f.user,{...command({amount:"10"}),partyId:f.customer.id,treasuryAccountCode:"3000"}),/ACC_INVALID_TREASURY_ACCOUNT/);
});
test("Phase 2 audit failures roll back vouchers, journal, command and registry together",options,async t=>{
 const f=await fixture(t);await opened(f);const fail=subledgerAdapter(f.db,true).service;
 const count=async()=>(await f.db.query(`SELECT (SELECT count(*) FROM accounting_journals)::int AS j,(SELECT count(*) FROM accounting_vouchers)::int AS v,(SELECT count(*) FROM accounting_commands)::int AS c`)).rows[0];const before=await count();
 await assert.rejects(fail.receipt(f.user,{...command({amount:"300"}),partyId:f.customer.id,treasuryAccountCode:"1000"}),/synthetic accounting audit failure/);assert.deepEqual(await count(),before);
 await assert.rejects(fail.payment(f.user,{...command({amount:"300"}),partyId:f.supplier.id,treasuryAccountCode:"1000"}),/synthetic accounting audit failure/);assert.deepEqual(await count(),before);
 const receipt=await f.service.receipt(f.user,{...command({amount:"300"}),partyId:f.customer.id,treasuryAccountCode:"1000"});const reverse={date:"2026-10-21",reason:"Demo reversal",idempotencyKey:randomUUID()};const withReceipt=await count();
 await assert.rejects(fail.reverse(f.user,f.customer.id,receipt.voucherId,reverse),/synthetic accounting audit failure/);assert.deepEqual(await count(),withReceipt);
});
test("Phase 2 reversal restores AR/AP and GL without manual bypass or silent voucher mutation",options,async t=>{
 const f=await fixture(t);const openings=await opened(f);const cmd={...command({amount:"300"}),partyId:f.customer.id,treasuryAccountCode:"1000"};const receipt=await f.service.receipt(f.user,cmd);
 const reverse={date:"2026-10-21",reason:"Receipt entered in error",idempotencyKey:randomUUID()};
 await assert.rejects(f.core.reverse(f.user,receipt.journalId,reverse),/ACC_USE_PARTY_VOUCHER/);
 await assert.rejects(f.service.reverse(f.user,f.customer.id,openings.ar.voucherId,reverse),/ACC_OPENING_HAS_SETTLEMENTS/);
 const r=await f.service.reverse(f.user,f.customer.id,receipt.voucherId,reverse);assert.deepEqual(await f.service.reverse(f.user,f.customer.id,receipt.voucherId,reverse),r);
 await assert.rejects(f.service.reverse(f.user,f.customer.id,receipt.voucherId,{...reverse,idempotencyKey:randomUUID()}),/ACC_INVALID_VOUCHER_REVERSAL/);
 assert.equal((await f.service.parties(f.user,{kind:"CUSTOMER"})).items[0]!.balance,"1000.00");
 const pay=await f.service.payment(f.user,{...command({amount:"300"}),partyId:f.supplier.id,treasuryAccountCode:"1000"});await f.service.reverse(f.user,f.supplier.id,pay.voucherId,{...reverse,idempotencyKey:randomUUID()});assert.equal((await f.service.parties(f.user,{kind:"SUPPLIER"})).items[0]!.balance,"1000.00");
 for(const table of ["accounting_parties","accounting_treasury","accounting_vouchers","accounting_voucher_commands"])await assert.rejects(f.db.exec(`DELETE FROM ${table}`),/ACC_IMMUTABLE/);
});
test("Phase 2 routes/services enforce company, per-operation and AR/AP permissions on every new contract",options,async t=>{
 const f=await fixture(t);await opened(f);const other=subledgerUser("isolation-sentinel","sentinel-admin");assert.equal((await f.service.parties(other,{kind:"CUSTOMER"})).items.length,0);assert.equal((await f.service.treasury(other,{})).items.length,0);
 await assert.rejects(f.service.statement(other,f.customer.id,{}),NotFoundException);await assert.rejects(f.service.receipt(other,{...command({amount:"1"}),partyId:f.customer.id,treasuryAccountCode:"1000"}),NotFoundException);
 const reader={...f.user,permissions:["sfa.access","accounting.read","accounting.ar.read","accounting.ap.read","accounting.treasury.read"]};
 await assert.rejects(f.service.receipt(reader,{...command(),partyId:f.customer.id,treasuryAccountCode:"1000"}),ForbiddenException);await assert.rejects(f.service.payment(reader,{...command(),partyId:f.supplier.id,treasuryAccountCode:"1000"}),ForbiddenException);
 await assert.rejects(f.service.opening(reader,{...command(),partyId:f.customer.id,equityAccountCode:"3000"}),ForbiddenException);await assert.rejects(f.service.createParty(reader,{kind:"CUSTOMER",code:"NO",name:"No grant",accountCode:"1010"}),ForbiddenException);await assert.rejects(f.service.registerTreasury(reader,{accountCode:"1010",kind:"BANK"}),ForbiddenException);
 await assert.rejects(f.service.parties({...reader,permissions:reader.permissions.filter(p=>p!=="accounting.ap.read")},{kind:"SUPPLIER"}),ForbiddenException);
 await assert.rejects(f.service.statement({...reader,permissions:reader.permissions.filter(p=>p!=="accounting.ar.read")},f.customer.id,{}),ForbiddenException);
 await assert.rejects(f.service.receipt(f.user,{...command(),partyId:f.customer.id,treasuryAccountCode:"1000",companyId:"isolation-sentinel"}),BadRequestException);
 await f.db.exec(`UPDATE company_operating_settings SET operating_mode='ANALYSIS_ONLY' WHERE company_id='demo'`);await assert.rejects(f.service.parties(f.user,{kind:"CUSTOMER"}),ForbiddenException);
});
test("Phase 2 opening/registry audit rollback, closed period and deferred voucher-source enforcement",options,async t=>{
 const f=await fixture(t);const failing=subledgerAdapter(f.db,true).service;
 await assert.rejects(failing.opening(f.user,{...command(),partyId:f.customer.id,equityAccountCode:"3000"}),/synthetic accounting audit failure/);assert.equal((await f.service.partySummary(f.user,f.customer.id)).balance,"0.00");
 await f.core.createAccount(f.user,{code:"1100",name:"Unused asset",type:"ASSET"});
 await assert.rejects(failing.registerTreasury(f.user,{accountCode:"1100",kind:"BANK"}),/synthetic accounting audit failure/);
 await assert.rejects(failing.createParty(f.user,{kind:"CUSTOMER",code:"ROLLBACK",name:"Rollback party",accountCode:"1100"}),/synthetic accounting audit failure/);
 assert.equal((await f.service.treasury(f.user,{})).items.length,2);assert.equal((await f.service.parties(f.user,{kind:"CUSTOMER"})).items.length,1);
 const forgedLines=JSON.stringify([{accountCode:"1200",debit:100,credit:0},{accountCode:"3000",debit:0,credit:100}]);
 await assert.rejects(f.db.transaction(async(tx:any)=>{await tx.query(`SELECT set_config('murshidak.voucher_journal','forged',true)`);await tx.query(`SELECT accounting_write_journal('demo','demo-admin','forged','2026-10-21','V:FORGED','Forged source check','MANUAL',NULL,$1::jsonb)`,[forgedLines]);}),/ACC_VOUCHER_SOURCE_REQUIRED/);
 await assert.rejects(f.db.transaction(async(tx:any)=>{await tx.query(`SELECT set_config('murshidak.voucher_journal','forged',true)`);await tx.query(`SELECT accounting_write_journal('demo','demo-admin','forged','2026-10-21','V:FORGED','Forged source check','MANUAL',NULL,$1::jsonb)`,[forgedLines]);await tx.query(`INSERT INTO accounting_vouchers(id,company_id,party_id,kind,entry_date,reference,amount,counter_account_code,journal_id,origin,reason,actor_id) VALUES('forged-v','demo',$1,'OPENING','2026-10-21','FORGED',200,'3000','forged','EXPLICIT_OPENING','Forged source check','demo-admin')`,[f.customer.id]);}),/ACC_VOUCHER_JOURNAL_MISMATCH/);
 await f.core.closePeriod(f.user,{through:"2026-10-21",reason:"Closed Demo period"});await assert.rejects(f.service.opening(f.user,{...command(),partyId:f.customer.id,equityAccountCode:"3000"}),/ACC_PERIOD_CLOSED/);
});
