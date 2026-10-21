// Phase 2 only. Existing loopback PostgreSQL binaries/runtime; no .env, imports,
// old test suites, network providers or Production migrations.
// --demo: additive migration + idempotent explicit openings in existing Demo.
// default: isolated native concurrency/transaction evidence for new contracts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
if(process.cwd().toLowerCase()!=='d:\\field sales os')throw Error('Official workspace required');
for(const k of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))delete process.env[k];
const psql=path.resolve('.tmp/erp-blockers-20261019/pgsql/bin/psql.exe');const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55571','-U','accounting_test'];
function sql(query,db='postgres'){return execFileSync(psql,[...args,'-d',db,'-c',query],{encoding:'utf8'}).trim();}
if(path.resolve(sql('SHOW data_directory')).toLowerCase()!==path.resolve('.quality/accounting/pgdata-native').toLowerCase())throw Error('Refuse a non-accounting local test cluster');
const demo=process.argv.includes('--demo'),runtime=JSON.parse(fs.readFileSync('.quality/accounting/runtime.json','utf8'));
const database=demo?runtime.database:'accounting_phase2_'+randomUUID().replaceAll('-','');
if(demo&&!/^accounting_demo_[a-f0-9]+$/.test(database))throw Error('Refuse a non-Demo database');
if(!demo)sql(`CREATE DATABASE ${database}`);
const url=`postgresql://accounting_test@127.0.0.1:55571/${database}?connection_limit=2&sslmode=disable`;
process.env.NODE_ENV='test';process.env.DATABASE_URL=url;
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
require(require.resolve('reflect-metadata',{paths:[path.resolve('apps/api')]}));
const {PrismaClient}=require(require.resolve('@prisma/client',{paths:[path.resolve('packages/database')]}));
const {AccountingService}=require(path.resolve('apps/api/src/modules/accounting/accounting.service.ts'));
const {AccountingSubledgerService}=require(path.resolve('apps/api/src/modules/accounting/accounting-subledger.service.ts'));
const {AuditLogService}=require(path.resolve('apps/api/src/modules/audit-log/audit-log.service.ts'));
const {accountingFixtureSql,accountingMigration}=require(path.resolve('apps/api/src/modules/accounting/accounting-test-fixture.ts'));
const {subledgerMigration,subledgerUser}=require(path.resolve('apps/api/src/modules/accounting/accounting-subledger-test-fixture.ts'));
function persistence(client,failAudit=false){return new Proxy(client,{get(target,key){
 if(key==='$transaction')return work=>client.$transaction(tx=>work(persistence(tx,failAudit)),{timeout:15000});
 if(key==='auditLog')return {upsert:async({create:c})=>{if(failAudit)throw Error('synthetic Phase 2 audit failure');return target.$executeRawUnsafe('INSERT INTO test_audit VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING',c.eventKey,c.companyId,c.userId,c.action,c.entityId,JSON.stringify(c.metadata??{}));}};
 const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});}
function services(client,fail=false){const p=persistence(client,fail),audit=new AuditLogService(p),core=new AccountingService(p,audit);return {core,sub:new AccountingSubledgerService(p,core,audit)};}
async function main(){
 if(!demo){sql(accountingFixtureSql,database);sql(fs.readFileSync(accountingMigration,'utf8'),database);}
 if(!sql(`SELECT coalesce(to_regclass('accounting_parties')::text,'')`,database))execFileSync(psql,[...args,'-d',database,'--single-transaction','-f',path.resolve(subledgerMigration)],{stdio:'pipe'});
 const a=new PrismaClient({datasourceUrl:url}),b=new PrismaClient({datasourceUrl:url});const {core,sub}=services(a),second=services(b).sub,user=subledgerUser();
 const entry=(extra={})=>({idempotencyKey:randomUUID(),date:'2026-10-21',reference:randomUUID(),reason:'Explicit synthetic Demo opening',amount:'1000',...extra});
 const evidence={database,scope:demo?'Existing local Accounting Demo only':'Isolated native Phase 2 only; no previous test suites',checks:[]};
 try{
  for(const account of [{code:'1000',name:'نقدية Demo',type:'ASSET'},{code:'1010',name:'بنك Demo',type:'ASSET'},{code:'1200',name:'ذمم عميل Demo',type:'ASSET'},{code:'2100',name:'ذمم مورد Demo',type:'LIABILITY'},{code:'3000',name:'رأس مال Demo',type:'EQUITY'}]){
   const existing=await a.$queryRawUnsafe('SELECT type FROM accounting_accounts WHERE company_id=$1 AND code=$2','demo',account.code);
   if(!existing.length)await core.createAccount(user,account);else assert.equal(existing[0].type,account.type);
  }
  for(const [accountCode,kind] of [['1000','CASH'],['1010','BANK']])if(!sql(`SELECT 1 FROM accounting_treasury WHERE company_id='demo' AND account_code='${accountCode}'`,database))await sub.registerTreasury(user,{accountCode,kind});
  async function party(kind,code,name,accountCode){const rows=await a.$queryRawUnsafe('SELECT id FROM accounting_parties WHERE company_id=$1 AND kind=$2 AND code=$3','demo',kind,code);return rows[0]??await sub.createParty(user,{kind,code,name,accountCode});}
  const customer=await party('CUSTOMER','C-DEMO','عميل Demo — افتتاحي 1,000 ريال','1200');const supplier=await party('SUPPLIER','S-DEMO','مورد Demo — افتتاحي 1,000 ريال','2100');
  for(const p of [customer,supplier])if(!sql(`SELECT 1 FROM accounting_vouchers WHERE company_id='demo' AND party_id='${p.id}' AND kind='OPENING'`,database))await sub.opening(user,{...entry({reference:p===customer?'DEMO-AR-OPEN':'DEMO-AP-OPEN'}),partyId:p.id,equityAccountCode:'3000'});
  if(demo){
   evidence.customer=await sub.partySummary(user,customer.id);evidence.supplier=await sub.partySummary(user,supplier.id);evidence.status='PASS';evidence.checks.push('Existing chart/cash and Demo reused; explicit openings only; no historical invoice reads or posting');
   fs.writeFileSync('.quality/accounting/phase2-demo.json',JSON.stringify(evidence,null,2));console.log('PHASE2_DEMO_READY '+JSON.stringify({customer:evidence.customer.balance,supplier:evidence.supplier.balance}));return;
  }
  await core.post(user,{idempotencyKey:randomUUID(),date:'2026-10-21',reference:'NATIVE-FLOAT',reason:'Native test cash float',lines:[{accountCode:'1000',debit:'1000'},{accountCode:'3000',credit:'1000'}]});
  const cmd={...entry({amount:'300',reference:'NATIVE-RECEIPT'}),partyId:customer.id,treasuryAccountCode:'1000'};
  const same=await Promise.all([sub.receipt(user,cmd),second.receipt(user,cmd)]);assert.deepEqual(same[0],same[1]);assert.equal((await sub.partySummary(user,customer.id)).balance,'700.00');
  const duplicate=await Promise.allSettled([sub.receipt(user,{...cmd,idempotencyKey:randomUUID()}),second.receipt(user,{...cmd,idempotencyKey:randomUUID()})]);assert.ok(duplicate.every(v=>v.status==='rejected'));
  const ar=await Promise.allSettled([sub.receipt(user,{...cmd,idempotencyKey:randomUUID(),reference:'AR-RACE-A',amount:'400'}),second.receipt(user,{...cmd,idempotencyKey:randomUUID(),reference:'AR-RACE-B',amount:'400'})]);assert.equal(ar.filter(v=>v.status==='fulfilled').length,1);assert.equal((await sub.partySummary(user,customer.id)).balance,'300.00');
  const payment={...entry({amount:'700'}),partyId:supplier.id,treasuryAccountCode:'1000'};const ap=await Promise.allSettled([sub.payment(user,payment),second.payment(user,{...payment,idempotencyKey:randomUUID(),reference:'AP-RACE-B'})]);assert.equal(ap.filter(v=>v.status==='fulfilled').length,1);assert.equal((await sub.partySummary(user,supplier.id)).balance,'300.00');
  const rev={date:'2026-10-21',reason:'Native duplicate reversal',idempotencyKey:randomUUID()};const reversal=await Promise.all([sub.reverse(user,customer.id,same[0].voucherId,rev),second.reverse(user,customer.id,same[0].voucherId,rev)]);assert.deepEqual(reversal[0],reversal[1]);assert.equal((await sub.partySummary(user,customer.id)).balance,'600.00');
  evidence.checks.push('Independent connections: same-command receipt posts once; fresh-key duplicate business reference denied; competing AR/AP settlements cannot overpay; reversal has one effect');
  const before=sql(`SELECT count(*) FROM accounting_journals`,database);await assert.rejects(services(a,true).sub.receipt(user,{...cmd,idempotencyKey:randomUUID(),reference:'AUDIT-FAIL',amount:'1'}),/synthetic Phase 2 audit failure/);assert.equal(sql(`SELECT count(*) FROM accounting_journals`,database),before);evidence.checks.push('Native audit failure rolls voucher, GL, command and balance effect back');
  const query=sql(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT id,entry_date,reference FROM accounting_vouchers WHERE company_id='demo' AND party_id='${customer.id}' ORDER BY entry_date DESC,created_at DESC,id DESC LIMIT 21`,database);evidence.statementPlan=JSON.parse(query);evidence.status='PASS';
  fs.writeFileSync('.quality/accounting/phase2-native.json',JSON.stringify(evidence,null,2));console.log('PHASE2_NATIVE_PASS');
 }finally{await a.$disconnect();await b.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
