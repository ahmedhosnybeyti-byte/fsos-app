// Accounting-only native PostgreSQL/HTTP acceptance. Never loads .env, WMS or
// Canonical suites. Requires the existing local test binaries, no installation.
// Start an empty loopback test cluster in .quality/accounting/pgdata-native on 55571;
// run: node tools/quality/accounting-local.cjs [--serve]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=process.cwd();if(root.toLowerCase()!=='d:\\field sales os')throw Error('Official workspace required');
for(const k of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))delete process.env[k];
process.env.NODE_ENV='test';process.env.DATABASE_URL='postgresql://accounting_test@127.0.0.1:55571/postgres?sslmode=disable';
const psql=path.resolve('.tmp/erp-blockers-20261019/pgsql/bin/psql.exe');
const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55571','-U','accounting_test'];
function sql(query,database='postgres') {return execFileSync(psql,[...args,'-d',database,'-c',query],{encoding:'utf8'}).trim();}
const directory=sql('SHOW data_directory');if(path.resolve(directory).toLowerCase()!==path.resolve('.quality/accounting/pgdata-native').toLowerCase())throw Error('Refuse a non-accounting test cluster');
const database='accounting_demo_'+randomUUID().replaceAll('-','');sql(`CREATE DATABASE ${database}`);
const url=`postgresql://accounting_test@127.0.0.1:55571/${database}?connection_limit=2&sslmode=disable`;process.env.DATABASE_URL=url;
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
const local=n=>require(require.resolve(n,{paths:[path.resolve('apps/api')]}));local('reflect-metadata');
const {PrismaClient,Prisma}=require(require.resolve('@prisma/client',{paths:[path.resolve('packages/database')]}));
const {AccountingService}=require(path.resolve('apps/api/src/modules/accounting/accounting.service.ts'));
const {AccountingController}=require(path.resolve('apps/api/src/modules/accounting/accounting.controller.ts'));
const {AuditLogService}=require(path.resolve('apps/api/src/modules/audit-log/audit-log.service.ts'));
const {accountingFixtureSql,accountingMigration,accountingUser}=require(path.resolve('apps/api/src/modules/accounting/accounting-test-fixture.ts'));
function persistence(client,failAudit=false) {return new Proxy(client,{get(target,key){
 if(key==='$transaction')return work=>client.$transaction(tx=>work(persistence(tx,failAudit)),{timeout:15000});
 if(key==='auditLog')return {upsert:async({create:c})=>{if(failAudit)throw Error('synthetic accounting audit failure');await target.$executeRawUnsafe('INSERT INTO test_audit VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING',c.eventKey,c.companyId,c.userId,c.action,c.entityId,JSON.stringify(c.metadata??{}));}};
 const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
 }});}
async function main(){
 const a=new PrismaClient({datasourceUrl:url}),b=new PrismaClient({datasourceUrl:url});const p=persistence(a),p2=persistence(b);let app;
 const service=new AccountingService(p,new AuditLogService(p)),second=new AccountingService(p2,new AuditLogService(p2));const user=accountingUser();
 const evidence={database,scope:'Synthetic accounting Demo only; empty isolated native PostgreSQL cluster, no WMS/Canonical/imports',checks:[],http:[],queries:[]};
 try{
  // psql supports multi-statement migration and deferred constraints unchanged.
  sql(accountingFixtureSql,database);sql(fs.readFileSync(accountingMigration,'utf8'),database);
  sql(`ALTER TABLE companies ADD COLUMN feature_access jsonb DEFAULT '{"accounting-core":"ENABLED"}';`,database);
  for(const account of [{code:'1000',name:'نقدية Demo',type:'ASSET'},{code:'3000',name:'رأس مال Demo',type:'EQUITY'},{code:'5000',name:'مصروفات Demo',type:'EXPENSE'}])await service.createAccount(user,account);
  const entry=(extra={})=>({idempotencyKey:randomUUID(),date:'2026-10-01',reference:randomUUID(),reason:'Synthetic Demo journal',lines:[{accountCode:'1000',debit:'100.10'},{accountCode:'3000',credit:'100.10'}],...extra});
  const cmd=entry(),pair=await Promise.all([service.post(user,cmd),second.post(user,cmd)]);assert.deepEqual(pair[0],pair[1]);
  const results=await Promise.allSettled([service.post(user,entry({reference:'RACE-REF'})),second.post(user,entry({reference:'RACE-REF'}))]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);
  const rev={date:'2026-10-02',reason:'Independent connection reversal',idempotencyKey:randomUUID()};const revs=await Promise.all([service.reverse(user,pair[0].journalId,rev),second.reverse(user,pair[0].journalId,rev)]);assert.deepEqual(revs[0],revs[1]);
  const source=await service.post(user,entry());const races=await Promise.allSettled([service.correct(user,source.journalId,entry({date:'2026-10-03'})),second.reverse(user,source.journalId,{...rev,idempotencyKey:randomUUID()})]);assert.equal(races.filter(v=>v.status==='fulfilled').length,1);
  evidence.checks.push('Two native connections: same-command retry, fresh-key duplicate business reference, duplicate reversal, correction versus reversal: one financial effect');
  const bad=persistence(a,true),badService=new AccountingService(bad,new AuditLogService(bad));const before=sql('SELECT count(*) FROM accounting_journals',database);
  await assert.rejects(badService.post(user,entry()),/synthetic accounting audit failure/);assert.equal(sql('SELECT count(*) FROM accounting_journals',database),before);evidence.checks.push('Real PostgreSQL audit failure rolls the financial transaction back');
  // EXPLAIN the exact service query, after scope, without synthetic load claims.
  const captured=[];const traced=new Proxy(p,{get(target,key){if(key==='$queryRaw')return async(q,...values)=>{const s=Array.isArray(q)?Prisma.sql(q,...values):q;const start=performance.now(),rows=await target.$queryRaw(s);if(/WITH movement/.test(s.text))captured.push({q:s.text,values:s.values,ms:performance.now()-start,returned:rows[0].items.length});return rows;};return target[key];}});
  await new AccountingService(traced,new AuditLogService(traced)).trial(user,{asOf:'2026-10-21'});
  for(const q of captured){const plan=await a.$queryRawUnsafe('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q.q,...q.values);evidence.queries.push({ms:q.ms,returned:q.returned,plan});}
  const {Module,UnauthorizedException}=local('@nestjs/common'),{NestFactory,Reflector}=local('@nestjs/core');
  class LocalAccountingModule{};Module({controllers:[AccountingController],providers:[{provide:AccountingService,useValue:service}]})(LocalAccountingModule);
  app=await NestFactory.create(LocalAccountingModule,{logger:false});app.setGlobalPrefix('api/v1');
  const sessions={admin:user,reader:{...user,permissions:['sfa.access','accounting.read']},other:accountingUser('isolation-sentinel','sentinel-admin'),super:{...user,roleCode:'SUPER_ADMIN'},rep:{...user,roleCode:'SALES_REP'}};
  const tokens=new Map(Object.entries(sessions).map(([role,u])=>[randomUUID(),{role,u}]));
  const express=app.getHttpAdapter().getInstance();
  express.get('/local-session/:role',(req,res)=>{const item=[...tokens].find(([,s])=>s.role===req.params.role);if(!item)return res.sendStatus(404);res.cookie('accounting_fixture',item[0],{httpOnly:true,sameSite:'strict'});res.json({ok:true});});
  app.use((req,res,next)=>{const token=(req.headers.cookie??'').match(/(?:^|;\s*)accounting_fixture=([^;]+)/)?.[1];req.user=tokens.get(token)?.u;next();});
  express.get('/api/v1/auth/me',(req,res)=>req.user?res.json({...req.user,id:req.user.userId,fullName:'محاسب Demo',status:'ACTIVE',featureAccess:{'accounting-core':'ENABLED'},role:{code:req.user.roleCode,name:'Accounting Demo'},company:{id:req.user.companyId,name:'Demo Accounting — محلي'}}):res.sendStatus(401));
  express.get('/api/v1/companies/me/operating-settings',async(req,res)=>{if(!req.user)return res.sendStatus(401);res.json((await a.$queryRawUnsafe('SELECT operating_mode AS "operatingMode" FROM company_operating_settings WHERE company_id=$1',req.user.companyId))[0]);});
  const reflector=new Reflector();const activity={record:async()=>{}};
  const guard=(name)=>require(path.resolve(`apps/api/src/common/guards/${name}.guard.ts`));
  app.useGlobalGuards({canActivate:context=>{if(!context.switchToHttp().getRequest().user)throw new UnauthorizedException();return true;}},
   new (guard('roles').RolesGuard)(reflector,activity),new (guard('permissions').PermissionsGuard)(reflector,activity),new (guard('company-screen-access').CompanyScreenAccessGuard)(reflector,p),new (guard('sfa-access').SfaAccessGuard)(reflector,p));
  await app.listen(4369,'127.0.0.1');
  const cookies=Object.fromEntries([...tokens].map(([token,{role}])=>[role,`accounting_fixture=${token}`]));
  async function http(role,method,route,body,expected){const r=await fetch('http://127.0.0.1:4369/api/v1/sfa/accounting'+route,{method,headers:{...(cookies[role]?{Cookie:cookies[role]}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();assert.equal(r.status,expected,`${role} ${method} ${route}: ${text}`);evidence.http.push({role,method,route,status:r.status});return JSON.parse(text||'{}');}
  await http('none','GET','/accounts',null,401);await http('super','GET','/accounts',null,403);await http('rep','GET','/accounts',null,403);await http('reader','GET','/accounts',null,200);await http('reader','POST','/journals',entry(),403);
  await http('reader','POST','/accounts',{code:'DENIED',name:'Denied',type:'ASSET'},403);await http('reader','POST','/close-period',{through:'2026-10-01',reason:'Denied closure'},403);
  await http('reader','POST',`/journals/${source.journalId}/reverse`,rev,403);await http('reader','POST',`/journals/${source.journalId}/correct`,entry(),403);
  const hcmd=entry({reference:'HTTP-DEMO'}),h=await http('admin','POST','/journals',hcmd,201);assert.deepEqual(await http('admin','POST','/journals',hcmd,201),h);await http('admin','POST','/journals',{...hcmd,idempotencyKey:randomUUID()},409);
  await http('admin','POST','/journals',entry({companyId:'isolation-sentinel'}),400);await http('other','GET',`/journals/${h.journalId}`,null,404);await http('other','GET','/trial-balance?asOf=2026-10-21',null,200);
  for(const mode of ['ANALYSIS_ONLY','SFA']){sql(`UPDATE company_operating_settings SET operating_mode='${mode}' WHERE company_id='demo'`,database);await http('admin','GET','/accounts',null,403);}
  sql(`UPDATE company_operating_settings SET operating_mode='FULL_ERP' WHERE company_id='demo';UPDATE companies SET feature_access='{}' WHERE id='demo'`,database);await http('admin','GET','/accounts',null,403);
  sql(`UPDATE companies SET feature_access='{"accounting-core":"ENABLED"}' WHERE id='demo'`,database);
  const closing=await Promise.allSettled([service.closePeriod(user,{through:'2026-10-05',reason:'Concurrent Demo close'}),second.post(user,entry({date:'2026-10-05'}))]);assert.equal(closing[0].status,'fulfilled');assert.ok(['fulfilled','rejected'].includes(closing[1].status));
  await assert.rejects(second.post(user,entry({date:'2026-10-05'})),/ACC_PERIOD_CLOSED/);evidence.checks.push('Native close/post lock serializes the boundary; all later backdated posts denied');
  await http('admin','GET','/trial-balance?asOf=2026-10-21',null,200);
  evidence.status='PASS';fs.mkdirSync('.quality/accounting',{recursive:true});fs.writeFileSync('.quality/accounting/native.json',JSON.stringify(evidence,null,2));
  fs.writeFileSync('.quality/accounting/runtime.json',JSON.stringify({database,url,pid:process.pid,api:'http://127.0.0.1:4369',web:'http://localhost:4368/sfa/accounting'},null,2));
  console.log(`Accounting native PASS: ${evidence.checks.length} groups, ${evidence.http.length} HTTP assertions. .quality/accounting/native.json`);
  if(process.argv.includes('--serve')){console.log('ACCOUNTING_LOCAL_API_READY');await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});}
 }finally{if(app)await app.close();await a.$disconnect();await b.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
