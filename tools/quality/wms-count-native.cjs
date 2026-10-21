// New physical-count contracts only; no .env, opening/four-flow tests or services.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
assert.equal(process.cwd().toLowerCase(),'d:\\field sales os');
for(const k of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))delete process.env[k];
const psql=path.resolve('.tmp/erp-blockers-20261019/pgsql/bin/psql.exe');
const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test'];
const sql=(query,db='postgres')=>execFileSync(psql,[...args,'-d',db,'-c',query],{encoding:'utf8'}).trim();
assert.equal(path.resolve(sql('SHOW data_directory')).toLowerCase(),path.resolve('.quality/wms/pgdata').toLowerCase());
const database='wms_count_'+randomUUID().replaceAll('-','');sql(`CREATE DATABASE ${database}`);
const url=`postgresql://wms_test@127.0.0.1:55561/${database}?connection_limit=2&sslmode=disable`;
process.env.NODE_ENV='test';process.env.DATABASE_URL=url;
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
require(require.resolve('reflect-metadata',{paths:[path.resolve('apps/api')]}));
const {PrismaClient}=require(require.resolve('@prisma/client',{paths:[path.resolve('packages/database')]}));
const {WmsService}=require(path.resolve('apps/api/src/modules/wms/wms.service.ts'));
const {WmsCountService}=require(path.resolve('apps/api/src/modules/wms/wms-count.service.ts'));
const {AuditLogService}=require(path.resolve('apps/api/src/modules/audit-log/audit-log.service.ts'));
const {wmsFixtureSql,wmsWarehouseSql,wmsUser}=require(path.resolve('apps/api/src/modules/wms/wms-test-fixture.ts'));
const {countMigration,countSeed}=require(path.resolve('apps/api/src/modules/wms/wms-count-test-fixture.ts'));
function persistence(client,fail=false){return new Proxy(client,{get(target,k){
 if(k==='$transaction')return work=>client.$transaction(tx=>work(persistence(tx,fail)),{timeout:15000});
 if(k==='auditLog')return {upsert:async({create:c})=>{if(fail)throw Error('synthetic count audit failure');return target.$executeRawUnsafe('INSERT INTO test_audit VALUES($1,$2,$3) ON CONFLICT DO NOTHING',c.eventKey,c.action,c.entityId);}};
 const value=Reflect.get(target,k);return typeof value==='function'?value.bind(target):value;
}});}
const make=(client,fail=false)=>{const p=persistence(client,fail),audit=new AuditLogService(p);return new WmsCountService(p,new WmsService(p,audit),audit);};
async function main(){
 sql(wmsFixtureSql,database);
 for(const name of ['20261019120000_sfa_warehouses','20261020100000_wms_phase01','20261020150000_wms_phase02','20261021100000_wms_core_closure','20261021200000_wms_physical_counts'])
  execFileSync(psql,[...args,'-d',database,'-f',path.resolve('packages/database/prisma/migrations',name,'migration.sql')],{stdio:'pipe'});
 sql(wmsWarehouseSql+countSeed,database);
 const a=new PrismaClient({datasourceUrl:url}),b=new PrismaClient({datasourceUrl:url}),s=make(a),second=make(b);
 const user={...wmsUser(),permissions:[...wmsUser().permissions,'wms.count.create','wms.count.approve']};
 const evidence={database,scope:'New count contracts only; isolated native PostgreSQL; no historical data or previous workflow testing',checks:[]};
 try{
  async function draft(q='197'){const c=(await s.candidates(user,'wa',{})).items.find(c=>c.batchId==='lot');return {reference:randomUUID(),reason:'Native physical count',idempotencyKey:randomUUID(),lines:[{batchId:c.batchId,revision:c.revision,countedQuantity:q,unit:'CARTON'}]};}
  const step=()=>({version:1,reason:'Native approval of physical variance',idempotencyKey:randomUUID()});
  const body=await draft(),created=await Promise.all([s.command(user,'wa','CREATE',body),second.command(user,'wa','CREATE',body)]);assert.deepEqual(...created);
  assert.equal(sql("SELECT physical FROM wms_positions WHERE batch_id='lot'",database),'2400.000000');
  const cmd=step(),posted=await Promise.all([s.command(user,'wa','APPROVE',cmd,created[0].id),second.command(user,'wa','APPROVE',cmd,created[0].id)]);assert.deepEqual(...posted);
  assert.equal(sql('SELECT count(*) FROM wms_movements',database),'1');assert.equal(sql("SELECT physical FROM wms_positions WHERE batch_id='lot'",database),'2364.000000');
  evidence.checks.push('Independent connections: same-key create and approve each have exactly one effect; 200→197 cartons');
  const d=await s.command(user,'wa','CREATE',await draft('196'));
  const race=await Promise.allSettled([s.command(user,'wa','APPROVE',step(),d.id),second.command(user,'wa','APPROVE',step(),d.id)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);evidence.checks.push('Fresh request keys against same document cannot duplicate settlement');
  const d1=await s.command(user,'wa','CREATE',await draft('195')),d2=await s.command(user,'wa','CREATE',await draft('194'));
  const competing=await Promise.allSettled([s.command(user,'wa','APPROVE',step(),d1.id),second.command(user,'wa','APPROVE',step(),d2.id)]);
  assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.match(competing.find(r=>r.status==='rejected').reason.message,/WMS_COUNT_STALE/);
  evidence.checks.push('Competing documents lock the same product/position; one wins and the stale count fails');
  const fail=await s.command(user,'wa','CREATE',await draft('193')),before=sql("SELECT physical FROM wms_positions WHERE batch_id='lot'",database),movements=sql('SELECT count(*) FROM wms_movements',database);
  await assert.rejects(make(a,true).command(user,'wa','APPROVE',step(),fail.id),/synthetic count audit failure/);
  assert.equal(sql("SELECT physical FROM wms_positions WHERE batch_id='lot'",database),before);assert.equal(sql('SELECT count(*) FROM wms_movements',database),movements);
  assert.equal((await s.detail(user,'wa',fail.id)).status,'DRAFT');evidence.checks.push('Native audit failure atomically rolls stock, movement, approval, event and command back');
  assert.equal(sql('SELECT quantity FROM wms_custody_positions',database),'360.000000');
  evidence.plan=JSON.parse(sql(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT s.batch_id,p.code,b.code FROM wms_positions s JOIN wms_batches b ON b.company_id='a' AND b.id=s.batch_id JOIN wms_products p ON p.company_id='a' AND p.id=b.product_id WHERE s.company_id='a' AND s.warehouse_id='wa' AND p.is_active ORDER BY p.code,b.code,s.batch_id LIMIT 21`,database));
  evidence.status='PASS';fs.mkdirSync('.quality/wms-count',{recursive:true});fs.writeFileSync('.quality/wms-count/native.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,checks:evidence.checks}));
 }finally{await a.$disconnect();await b.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
