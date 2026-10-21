// New physical-count contracts only; no .env, opening/four-flow tests or services.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
assert.equal(process.cwd().toLowerCase(),'d:\\field sales os');
for(const k of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))delete process.env[k];
const psql=path.resolve('.tmp/erp-blockers-20261019/pgsql/bin/psql.exe');
const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test'];
const sql=(query,db='postgres')=>execFileSync(psql,[...args,'-d',db,'-c',query],{encoding:'utf8'}).trim();
assert.equal(path.resolve(sql('SHOW data_directory')).toLowerCase(),path.resolve('.quality/wms/pgdata').toLowerCase());
const database='procurement_'+randomUUID().replaceAll('-','');sql(`CREATE DATABASE ${database}`);
const url=`postgresql://wms_test@127.0.0.1:55561/${database}?connection_limit=2&sslmode=disable`;
process.env.NODE_ENV='test';process.env.DATABASE_URL=url;
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
require(require.resolve('reflect-metadata',{paths:[path.resolve('apps/api')]}));
const {PrismaClient}=require(require.resolve('@prisma/client',{paths:[path.resolve('packages/database')]}));
const {WmsService}=require(path.resolve('apps/api/src/modules/wms/wms.service.ts'));
const {ProcurementService}=require(path.resolve('apps/api/src/modules/wms/procurement.service.ts'));
const {AuditLogService}=require(path.resolve('apps/api/src/modules/audit-log/audit-log.service.ts'));
const {wmsFixtureSql,wmsWarehouseSql,wmsUser}=require(path.resolve('apps/api/src/modules/wms/wms-test-fixture.ts'));
function persistence(client,fail=false){return new Proxy(client,{get(target,k){
 if(k==='$transaction')return work=>client.$transaction(tx=>work(persistence(tx,fail)),{timeout:15000});
 if(k==='auditLog')return {upsert:async({create:c})=>{if(fail)throw Error('synthetic count audit failure');return target.$executeRawUnsafe('INSERT INTO test_audit VALUES($1,$2,$3) ON CONFLICT DO NOTHING',c.eventKey,c.action,c.entityId);}};
 const value=Reflect.get(target,k);return typeof value==='function'?value.bind(target):value;
}});}
const make=(client,fail=false)=>{const p=persistence(client,fail),audit=new AuditLogService(p);return new ProcurementService(p,new WmsService(p,audit),audit);};

const {procurementMigration,procurementSeed,procurementUser}=require(path.resolve('apps/api/src/modules/wms/procurement-test-fixture.ts'));
const {WmsOperationsService}=require(path.resolve('apps/api/src/modules/wms/wms-operations.service.ts'));
async function main(){
 sql(wmsFixtureSql,database);for(const name of ['20261019120000_sfa_warehouses','20261020100000_wms_phase01','20261020150000_wms_phase02','20261021100000_wms_core_closure'])execFileSync(psql,[...args,'-d',database,'-f',path.resolve('packages/database/prisma/migrations',name,'migration.sql')],{stdio:'pipe'});
 sql(wmsWarehouseSql+procurementSeed,database);execFileSync(psql,[...args,'-d',database,'-f',path.resolve(procurementMigration)],{stdio:'pipe'});
 const a=new PrismaClient({datasourceUrl:url}),b=new PrismaClient({datasourceUrl:url}),s=make(a),second=make(b),u=procurementUser(),approver=procurementUser('clerk-a');
 const wms=(client,fail=false)=>{const p=persistence(client,fail),audit=new AuditLogService(p);return new WmsOperationsService(p,new WmsService(p,audit),audit);};
 const cmd=(operation,id,version,extra={})=>({operation,id,version,reason:'Native procurement test',idempotencyKey:randomUUID(),...extra});
 const draft=()=>cmd('CREATE',undefined,undefined,{draft:{reference:randomUUID(),lines:[{productId:'p',unit:'CARTON',quantity:'40'}]}});
 const receipt=q=>({reference:randomUUID(),lines:[{productId:'p',batchId:'lot',unit:'CARTON',expectedQuantity:q,acceptedQuantity:q,quarantinedQuantity:'0',rejectedQuantity:'0'}]});
 const step=async(service,operation,id,version)=>service.command(approver,'wa',{operation,input:{id,version,note:'Native delivery approval',idempotencyKey:randomUUID()}});
 const stock=()=>sql("SELECT sum(physical) FROM wms_positions WHERE company_id='a' AND warehouse_id='wa'",database);
 const evidence={checks:[]};try{
 const body=draft(),created=await Promise.all([s.command(u,'wa',body),second.command(u,'wa',body)]);assert.deepEqual(...created);const id=created[0].id;
 await s.command(u,'wa',cmd('SUBMIT',id,1));await s.command(approver,'wa',cmd('APPROVE',id,2));
 const convert=cmd('ORDER',id,3,{supplierId:'supplier'});assert.deepEqual(...await Promise.all([s.command(approver,'wa',convert),second.command(approver,'wa',convert)]));assert.equal(stock(),'2352.000000');evidence.checks.push('Concurrent identical create/conversion each produces one document and zero stock change');
 const r1=await s.command(u,'wa',cmd('RECEIVE',id,1,{receipt:receipt('25')})),r2=await s.command(u,'wa',cmd('RECEIVE',id,1,{receipt:receipt('25')}));
 for(const r of [r1,r2]){await step(wms(a),'receipt.submit',r.id,1);await step(wms(a),'receipt.review',r.id,2);}
 const race=await Promise.allSettled([step(wms(a),'receipt.approve',r1.id,3),step(wms(b),'receipt.approve',r2.id,3)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.match(race.find(x=>x.status==='rejected').reason.message,/EXCEEDS_REMAINING/);assert.equal(stock(),'2652.000000');evidence.checks.push('Independent simultaneous WMS posting: one 25-carton delivery wins, over-receipt atomically rejected');
 const last=await s.command(u,'wa',cmd('RECEIVE',id,1,{receipt:receipt('15')}));await step(wms(a),'receipt.submit',last.id,1);await step(wms(a),'receipt.review',last.id,2);
 await assert.rejects(step(wms(a,true),'receipt.approve',last.id,3),/synthetic count audit failure/);assert.equal(stock(),'2652.000000');assert.equal((await wms(a).receipt(u,'wa',last.id)).status,'REVIEWED');
 const post={operation:'receipt.approve',input:{id:last.id,version:3,note:'Native final receipt',idempotencyKey:randomUUID()}};assert.deepEqual(...await Promise.all([wms(a).command(approver,'wa',post),wms(b).command(approver,'wa',post)]));
 assert.equal(stock(),'2832.000000');assert.equal((await s.detail(u,'wa',id)).status,'COMPLETED');assert.equal(sql('SELECT count(*) FROM wms_movements',database),'2');evidence.checks.push('Failed WMS audit rolls back stock/posting; duplicate final posting leaves exactly +40 cartons and two movements');
 await assert.rejects(make(a,true).command(u,'wa',draft()),/synthetic count audit failure/);evidence.checks.push('Procurement audit failure rolls back request, lines, event and command');
 evidence.queryPlan=JSON.parse(sql("EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT id,document_status FROM procurement_documents WHERE company_id='a' AND warehouse_id='wa' ORDER BY created_at DESC,id DESC LIMIT 21",database));evidence.status='PASS';fs.mkdirSync('.quality/procurement',{recursive:true});fs.writeFileSync('.quality/procurement/native.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,checks:evidence.checks}));
 }finally{await a.$disconnect();await b.$disconnect();}
}main().catch(e=>{console.error(e);process.exitCode=1});
