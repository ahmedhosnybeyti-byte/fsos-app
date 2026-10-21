import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BadRequestException,ForbiddenException,NotFoundException } from "@nestjs/common";
import { accountingAdapter,accountingFixture,accountingUser } from "./accounting-test-fixture";

const options={skip:process.env.RIE_TEST_PGLITE_MODULE?false:"Isolated PostgreSQL runtime required"};
const entry=(extra={})=>({idempotencyKey:randomUUID(),date:"2026-10-01",reference:randomUUID(),reason:"Synthetic Demo capital",lines:[{accountCode:"1000",debit:"0.30",credit:"0"},{accountCode:"3000",debit:"0",credit:"0.30"}],...extra});
async function fixture(t:any) {
 const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());const service=await accountingFixture(db);const user=accountingUser();
 await service.createAccount(user,{code:"1000",name:"Demo cash",type:"ASSET"});await service.createAccount(user,{code:"3000",name:"Demo capital",type:"EQUITY"});return {db,service,user};
}
test("Accounting Demo: exact money, equivalent retry, unique business reference and as-of trial parity",options,async t=>{
 const {db,service,user}=await fixture(t);const command=entry({lines:[{accountCode:"1000",debit:"0.10"},{accountCode:"1000",debit:"0.20"},{accountCode:"3000",credit:"0.30"}]});
 const posted=await service.post(user,command);assert.deepEqual(await service.post(user,command),posted);
 await assert.rejects(service.post(user,{...command,reason:"Changed same command"}),/ACC_IDEMPOTENCY_CONFLICT/);
 await assert.rejects(service.post(user,{...command,idempotencyKey:randomUUID()}),/ACC_DUPLICATE_REFERENCE/);
 const trial=await service.trial(user,{asOf:"2026-10-01"});assert.deepEqual(trial.totals,{debit:"0.30",credit:"0.30",balanceDebit:"0.30",balanceCredit:"0.30"});
 assert.equal(trial.items.find(a=>a.code==="1000")!.balanceDebit,"0.30");
 assert.equal((await service.trial(user,{asOf:"2026-09-30"})).totals.debit,"0.00");
 assert.equal((await service.journal(user,posted.journalId)).items.length,3);
 const journals=await service.journals(user,{from:"2026-10-01",to:"2026-10-01"});assert.equal(journals.items.length,1);assert.equal(journals.items[0]!.debit,"0.30");
 assert.equal((await db.query(`SELECT count(*)::int n FROM test_audit WHERE action='accounting.journal.post'`)).rows[0].n,1);
 const equivalent=entry({lines:[{accountCode:"1000",debit:"1"},{accountCode:"3000",credit:"1"}]});const same=await service.post(user,equivalent);
 assert.deepEqual(await service.post(user,{...equivalent,lines:[{accountCode:"1000",debit:"1.00",credit:"0.00",memo:""},{accountCode:"3000",debit:"0.00",credit:"1.00",memo:""}]}),same);
});
test("Accounting rejects unbalanced, negative, sub-halala, zero, dual-sided, overflow, unknown account and invalid input atomically",options,async t=>{
 const {db,service,user}=await fixture(t);
 for(const value of ["-1","0.001","100000000000000","1e2","NaN",0.30]) await assert.rejects(service.post(user,entry({lines:[{accountCode:"1000",debit:value},{accountCode:"3000",credit:"0.30"}]})),BadRequestException);
 for(const lines of [[{accountCode:"1000",debit:"0.31"},{accountCode:"3000",credit:"0.30"}],[{accountCode:"1000",debit:"0"},{accountCode:"3000",credit:"0"}],[{accountCode:"1000",debit:"0.30",credit:"0.30"},{accountCode:"3000",credit:"0.30"}],[{accountCode:"FOREIGN",debit:"0.30"},{accountCode:"3000",credit:"0.30"}]]) await assert.rejects(service.post(user,entry({lines})));
 for(const extra of [{date:"2026-02-30"},{companyId:"isolation-sentinel"},{lines:[]},{reference:"REV:forged"},{reason:"x"}])await assert.rejects(service.post(user,entry(extra)),BadRequestException);
 assert.equal((await db.query(`SELECT count(*)::int n FROM accounting_journals`)).rows[0].n,0);assert.equal((await db.query(`SELECT count(*)::int n FROM accounting_commands`)).rows[0].n,0);
});
test("Accounting reversal/correction preserve immutable history, exact mirror, source and reason",options,async t=>{
 const {db,service,user}=await fixture(t);const original=await service.post(user,entry());const reverse={date:"2026-10-02",reason:"Correction after Demo review",idempotencyKey:randomUUID()};
 const reversal=await service.reverse(user,original.journalId,reverse);assert.deepEqual(await service.reverse(user,original.journalId,reverse),reversal);
 await assert.rejects(service.reverse(user,original.journalId,{...reverse,idempotencyKey:randomUUID()}),/ACC_ALREADY_REVERSED/);
 await assert.rejects(service.reverse(user,reversal.journalId,{...reverse,idempotencyKey:randomUUID()}),/ACC_INVALID_SOURCE/);
 assert.equal((await service.trial(user,{asOf:"2026-10-02"})).totals.balanceDebit,"0.00");
 const source=await service.post(user,entry());const correction=entry({date:"2026-10-03",reason:"Correct capital amount",lines:[{accountCode:"1000",debit:"7.77"},{accountCode:"3000",credit:"7.77"}]});
 const fixed=await service.correct(user,source.journalId,correction);assert.ok(fixed.reversalId);assert.deepEqual(await service.correct(user,source.journalId,correction),fixed);
 assert.equal((await service.trial(user,{asOf:"2026-10-03"})).totals.balanceDebit,"7.77");
 const rows=(await service.journals(user,{})).items;assert.equal(rows.find(j=>j.id===source.journalId)!.reversed,true);assert.equal(rows.find(j=>j.id===fixed.journalId)!.correctionOf,source.journalId);
 for(const sql of [`UPDATE accounting_journals SET reason='tampered'`,`DELETE FROM accounting_journals`,`UPDATE accounting_lines SET debit=10`,`DELETE FROM accounting_lines`,`UPDATE accounting_commands SET result='{}'`,`DELETE FROM accounting_accounts`])await assert.rejects(db.exec(sql),/ACC_IMMUTABLE/);
 const audit=(await db.query(`SELECT metadata FROM test_audit WHERE entity_id=$1`,[fixed.journalId])).rows[0].metadata;assert.equal(audit.reason,"Correct capital amount");assert.equal(audit.sourceJournalId,source.journalId);
});
test("Accounting audit failure rolls back account, posting, reversal, correction pair and close",options,async t=>{
 const {db,service,user}=await fixture(t);const failing=accountingAdapter(db,true);const count=async()=>(await db.query(`SELECT count(*)::int n FROM accounting_journals`)).rows[0].n;
 await assert.rejects(failing.createAccount(user,{code:"9999",name:"Rolled back",type:"ASSET"}),/synthetic accounting audit failure/);
 await assert.rejects(failing.post(user,entry()),/synthetic accounting audit failure/);assert.equal(await count(),0);
 const original=await service.post(user,entry());const correction=entry({date:"2026-10-02"});
 await assert.rejects(failing.correct(user,original.journalId,correction),/synthetic accounting audit failure/);assert.equal(await count(),1);
 await assert.rejects(failing.reverse(user,original.journalId,{date:"2026-10-02",reason:"Reverse demo error",idempotencyKey:randomUUID()}),/synthetic accounting audit failure/);assert.equal(await count(),1);
 await assert.rejects(failing.closePeriod(user,{through:"2026-10-01",reason:"Demo close"}),/synthetic accounting audit failure/);assert.equal((await service.book(user)).closedThrough,null);
 // Partial correction failure cannot leave the original reversed.
 await assert.rejects(service.correct(user,original.journalId,entry({date:"2026-10-02",lines:[{accountCode:"1000",debit:"0.31"},{accountCode:"3000",credit:"0.30"}]})),/ACC_UNBALANCED/);assert.equal(await count(),1);
 assert.equal((await service.journals(user,{})).items[0]!.reversed,false);
});
test("Accounting closed-through cutoff is inclusive; correction can only affect open dates",options,async t=>{
 const {db,service,user}=await fixture(t);const original=await service.post(user,entry());await service.closePeriod(user,{through:"2026-10-01",reason:"Demo month closed"});
 await assert.rejects(service.post(user,entry()),/ACC_PERIOD_CLOSED/);
 await assert.rejects(service.reverse(user,original.journalId,{date:"2026-10-01",reason:"Old date rejected",idempotencyKey:randomUUID()}),/ACC_PERIOD_CLOSED/);
 await assert.rejects(service.closePeriod(user,{through:"2026-09-30",reason:"Do not reopen"}),/ACC_PERIOD_ALREADY_CLOSED/);
 await assert.rejects(db.exec(`UPDATE accounting_books SET closed_through=NULL`),/ACC_BOOK_IMMUTABLE/);
 await service.correct(user,original.journalId,entry({date:"2026-10-02"}));
 assert.equal((await service.trial(user,{asOf:"2026-10-01"})).totals.balanceDebit,"0.30");assert.equal((await service.trial(user,{asOf:"2026-10-02"})).totals.balanceDebit,"0.30");
});
test("Accounting default deny: company/mode/user/role and operation permissions; no cross-company records",options,async t=>{
 const {db,service,user}=await fixture(t);const posted=await service.post(user,entry());const other=accountingUser("isolation-sentinel","sentinel-admin");
 assert.equal((await service.accounts(other,{})).items.length,0);assert.equal((await service.journals(other,{})).items.length,0);assert.equal((await service.trial(other,{asOf:"2026-10-01"})).totals.debit,"0.00");
 await assert.rejects(service.journal(other,posted.journalId),NotFoundException);
 // Even with same chart codes a foreign journal cannot be reversed/corrected.
 await service.createAccount(other,{code:"1000",name:"Sentinel",type:"ASSET"});await assert.rejects(service.reverse(other,posted.journalId,{date:"2026-10-02",reason:"Foreign source denied",idempotencyKey:randomUUID()}),/ACC_INVALID_SOURCE/);
 for(const denied of [{...user,companyId:null},{...user,roleCode:"SUPER_ADMIN" as const},{...user,roleCode:"SALES_REP" as const},{...user,permissions:[]},{...user,permissions:["sfa.access"]},{...user,userId:"sentinel-admin"}]) {
  for(const read of [()=>service.book(denied),()=>service.accounts(denied,{}),()=>service.journals(denied,{}),()=>service.trial(denied,{asOf:"2026-10-01"}),()=>service.journal(denied,posted.journalId)])await assert.rejects(read(),ForbiddenException);
  await assert.rejects(service.post(denied,entry()),ForbiddenException);
 }
 const reader={...user,permissions:["sfa.access","accounting.read"]};
 await assert.rejects(service.createAccount(reader,{code:"2000",name:"No grant",type:"LIABILITY"}),ForbiddenException);await assert.rejects(service.post(reader,entry()),ForbiddenException);
 await assert.rejects(service.reverse(reader,posted.journalId,{date:"2026-10-02",reason:"No permission",idempotencyKey:randomUUID()}),ForbiddenException);await assert.rejects(service.closePeriod(reader,{through:"2026-10-01",reason:"No permission"}),ForbiddenException);
 await assert.rejects(service.correct({...user,permissions:user.permissions.filter(p=>p!=="accounting.journal.post")},posted.journalId,entry()),ForbiddenException);
 for(const mode of ["ANALYSIS_ONLY","SFA"]) {await db.query(`UPDATE company_operating_settings SET operating_mode=$1 WHERE company_id='demo'`,[mode]);await assert.rejects(service.book(user),ForbiddenException);await assert.rejects(service.post(user,entry()),ForbiddenException);}
 await db.exec(`DELETE FROM company_operating_settings WHERE company_id='demo'`);await assert.rejects(service.accounts(user,{}),ForbiddenException);
});
test("Accounting SQL deferred balance and fractional safeguards apply to alternative writers",options,async t=>{
 const {db}=await fixture(t);
 const header=`INSERT INTO accounting_journals(id,company_id,entry_date,reference,reason,kind,actor_id) VALUES('forged','demo','2026-10-01','FORGED','Synthetic direct SQL','MANUAL','demo-admin')`;
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec(header);}),/ACC_UNBALANCED/);
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec(header);await tx.exec(`INSERT INTO accounting_lines VALUES('demo','forged',1,'1000',0.001,0,'')`);}),/check constraint/);
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec(header);await tx.exec(`INSERT INTO accounting_lines VALUES('demo','forged',1,'1000',1,0,''),('demo','forged',2,'3000',0,2,'');UPDATE accounting_journals SET status='POSTED' WHERE id='forged'`);}),/ACC_UNBALANCED/);
 assert.equal((await db.query(`SELECT count(*)::int n FROM accounting_journals`)).rows[0].n,0);
});
test("Accounting chart and trial pagination are bounded while company totals include every page",options,async t=>{
 const {db,service,user}=await fixture(t);await db.exec(`INSERT INTO accounting_accounts SELECT 'demo','A'||lpad(n::text,3,'0'),'Demo account '||n,'ASSET' FROM generate_series(1,23) n`);
 await service.post(user,entry());const first=await service.accounts(user,{});assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.equal((await service.accounts(user,{page:2})).items.length,5);
 const trial=await service.trial(user,{asOf:"2026-10-01",page:2});assert.equal(trial.items.length,5);assert.equal(trial.hasMore,false);assert.equal(trial.totals.debit,"0.30");
 const search=await service.trial(user,{asOf:"2026-10-01",search:"A023"});assert.equal(search.items.length,1);assert.equal(search.totals.balanceDebit,"0.30");
});
