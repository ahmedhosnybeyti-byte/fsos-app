// New quarantine contracts only; no .env, opening/four-flow tests or services.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
assert.equal(process.cwd().toLowerCase(),'d:\\field sales os');
for(const k of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))delete process.env[k];
const psql=path.resolve('.tmp/erp-blockers-20261019/pgsql/bin/psql.exe');
const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test'];
const sql=(query,db='postgres')=>execFileSync(psql,[...args,'-d',db,'-c',query],{encoding:'utf8'}).trim();
assert.equal(path.resolve(sql('SHOW data_directory')).toLowerCase(),path.resolve('.quality/wms/pgdata').toLowerCase());
const database='wms_quarantine_'+randomUUID().replaceAll('-','');sql(`CREATE DATABASE ${database}`);
const url=`postgresql://wms_test@127.0.0.1:55561/${database}?connection_limit=2&sslmode=disable`;
process.env.NODE_ENV='test';process.env.DATABASE_URL=url;
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
require(require.resolve('reflect-metadata',{paths:[path.resolve('apps/api')]}));
const {PrismaClient}=require(require.resolve('@prisma/client',{paths:[path.resolve('packages/database')]}));
const {WmsService}=require(path.resolve('apps/api/src/modules/wms/wms.service.ts'));
const {WmsQuarantineService}=require(path.resolve('apps/api/src/modules/wms/wms-quarantine.service.ts'));
const {AuditLogService}=require(path.resolve('apps/api/src/modules/audit-log/audit-log.service.ts'));
const {wmsFixtureSql,wmsWarehouseSql,wmsUser}=require(path.resolve('apps/api/src/modules/wms/wms-test-fixture.ts'));
function persistence(client,fail=false){return new Proxy(client,{get(target,k){
 if(k==='$transaction')return work=>client.$transaction(tx=>work(persistence(tx,fail)),{timeout:15000});
 if(k==='auditLog')return {upsert:async({create:c})=>{if(fail)throw Error('synthetic quarantine audit failure');return target.$executeRawUnsafe('INSERT INTO test_audit VALUES($1,$2,$3) ON CONFLICT DO NOTHING',c.eventKey,c.action,c.entityId);}};
 const value=Reflect.get(target,k);return typeof value==='function'?value.bind(target):value;
}});}
const make=(client,fail=false)=>{const p=persistence(client,fail),audit=new AuditLogService(p);return new WmsQuarantineService(p,new WmsService(p,audit),audit);};
async function main(){
 sql(wmsFixtureSql,database);
 for(const name of ['20261019120000_sfa_warehouses','20261020100000_wms_phase01','20261020150000_wms_phase02','20261021100000_wms_core_closure','20261021200000_wms_physical_counts','20261021210000_wms_quarantine'])execFileSync(psql,[...args,'-d',database,'-f',path.resolve('packages/database/prisma/migrations',name,'migration.sql')],{stdio:'pipe'});
 sql(wmsWarehouseSql+"INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton) VALUES('p','a','DAMAGE','Damage fixture',12);INSERT INTO wms_batches(id,company_id,product_id,code) VALUES('lot','a','p','LOT');INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('a','wa','lot',2400);",database);
 const a=new PrismaClient({datasourceUrl:url}),b=new PrismaClient({datasourceUrl:url}),s=make(a),second=make(b),user={...wmsUser(),permissions:[...wmsUser().permissions,'wms.quarantine.hold','wms.quarantine.release','wms.quarantine.writeoff']};
 const hold=()=>({reference:randomUUID(),reason:'Observed damaged cartons',batchId:'lot',quantity:'10',unit:'CARTON',idempotencyKey:randomUUID()}),step=(quantity,version=1)=>({quantity,version,reason:'Inspected quantity and approved disposition',idempotencyKey:randomUUID()});
 const evidence={database,scope:'New quarantine-only native contracts; no completed workflow tests',checks:[]};
 try{
  const cmd=hold(),d=await Promise.all([s.command(user,'wa','HOLD',cmd),second.command(user,'wa','HOLD',cmd)]);assert.deepEqual(...d);
  assert.equal(sql("SELECT physical||'/'||quarantined FROM wms_positions WHERE batch_id='lot'",database),'2400.000000/120.000000');
  await s.command(user,'wa','RELEASE',step('6'),d[0].id);
  const off=step('4',2),posted=await Promise.all([s.command(user,'wa','WRITE_OFF',off,d[0].id),second.command(user,'wa','WRITE_OFF',off,d[0].id)]);assert.deepEqual(...posted);
  assert.equal(sql("SELECT physical||'/'||quarantined FROM wms_positions WHERE batch_id='lot'",database),'2352.000000/0.000000');
  assert.equal(sql("SELECT count(*) FROM wms_movements WHERE kind='WRITE_OFF'",database),'1');evidence.checks.push('Concurrent same-key HOLD and WRITE_OFF post once; 200→190/10→196/4→196/0');
  await assert.rejects(s.command(user,'wa','WRITE_OFF',step('4',2),d[0].id),/WMS_DOCUMENT_STALE/);
  const open=await s.command(user,'wa','HOLD',hold());
  const race=await Promise.allSettled([s.command(user,'wa','RELEASE',step('6'),open.id),second.command(user,'wa','WRITE_OFF',step('6'),open.id)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/WMS_DOCUMENT_STALE/);assert.equal((await s.detail(user,'wa',open.id)).remaining,'4.000000');evidence.checks.push('Competing release/disposal and fresh-key replay cannot spend held stock twice');
  const before=sql("SELECT physical||'/'||quarantined FROM wms_positions WHERE batch_id='lot'",database),events=sql('SELECT count(*) FROM wms_quarantine_events',database);
  await assert.rejects(make(a,true).command(user,'wa','WRITE_OFF',step('4',2),open.id),/synthetic quarantine audit failure/);
  assert.equal(sql("SELECT physical||'/'||quarantined FROM wms_positions WHERE batch_id='lot'",database),before);assert.equal(sql('SELECT count(*) FROM wms_quarantine_events',database),events);evidence.checks.push('Audit failure rolls back disposition, counters, stock, movement, event and command');
  evidence.status='PASS';fs.mkdirSync('.quality/wms-quarantine',{recursive:true});fs.writeFileSync('.quality/wms-quarantine/native.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await a.$disconnect();await b.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
