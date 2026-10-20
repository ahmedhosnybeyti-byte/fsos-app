// Explicit local-only native PostgreSQL race/query evidence. Not a generic CI
// suite: the offline quality runner deliberately forbids socket connections.
// Requires the existing PostgreSQL test binaries and an empty loopback cluster.
// Usage: node tools/quality/wms-native.cjs <absolute psql.exe path>
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const {randomUUID}=require('node:crypto');
const root=process.cwd();if(root.toLowerCase()!=='d:\\field sales os')throw Error('Official workspace required');
const psql=process.argv[2];if(!psql||!path.isAbsolute(psql)||!fs.existsSync(psql))throw Error('Existing local psql executable required');
// Never inherit .env, real endpoints or provider credentials.
for(const key of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(key))delete process.env[key];
const database='wms_phase01_'+randomUUID().replaceAll('-','');
const url=`postgresql://wms_test@127.0.0.1:55561/${database}?connection_limit=1&sslmode=disable`;
process.env.NODE_ENV='test';process.env.DATABASE_URL=url;
const args=['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test'];
const clusterPath=execFileSync(psql,[...args,'-d','postgres','-A','-t','-c','SHOW data_directory'],{encoding:'utf8'}).trim();
if(path.resolve(clusterPath).toLowerCase()!==path.resolve('.quality/wms/pgdata').toLowerCase())throw Error('Refuse any cluster outside the dedicated WMS fixture directory');
execFileSync(psql,[...args,'-d','postgres','-c',`CREATE DATABASE ${database}`],{stdio:'pipe'});
const migrations=fs.readdirSync('packages/database/prisma/migrations').filter(n=>fs.existsSync(`packages/database/prisma/migrations/${n}/migration.sql`)).sort();
for(const migration of migrations)execFileSync(psql,[...args,'-d',database,'-f',path.resolve(`packages/database/prisma/migrations/${migration}/migration.sql`)],{stdio:'pipe'});
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
require(require.resolve('reflect-metadata',{paths:[path.resolve('apps/api')]}));
const {PrismaClient}=require(require.resolve('@prisma/client',{paths:[path.resolve('packages/database')]}));
const {WmsService}=require(path.resolve('apps/api/src/modules/wms/wms.service.ts'));
const {AuditLogService}=require(path.resolve('apps/api/src/modules/audit-log/audit-log.service.ts'));
const {wmsUser}=require(path.resolve('apps/api/src/modules/wms/wms-test-fixture.ts'));
async function main(){
  const a=new PrismaClient({datasourceUrl:url}),b=new PrismaClient({datasourceUrl:url});
  const evidence={database,migrations:migrations.length,postgres:null,checks:[],queries:[]};
  try {
    evidence.postgres=(await a.$queryRawUnsafe('SELECT version() AS version'))[0].version;
    assert.equal(await a.company.count(),0);assert.equal(await a.companyOperatingSettings.count(),0);assert.equal(await a.rolePermission.count(),0);
    const role=await a.role.create({data:{code:'COMPANY_ADMIN',name:'Isolated test administrator'}});
    const clerk=await a.role.create({data:{code:'SALES_REP',name:'Isolated test clerk'}});
    const plan=await a.plan.create({data:{code:'wms-isolated',name:'Isolated WMS',features:{}}});
    for(const c of ['a','b']){
      await a.company.create({data:{id:c,slug:'wms-synthetic-'+c,name:c==='a'?'مختبر WMS — بيانات اختبار معزولة':'شركة اختبار العزل',featureAccess:{'warehouse-core':'ENABLED','sfa-setup':'ENABLED'}}});
      await a.user.create({data:{id:'actor-'+c,companyId:c,roleId:role.id,email:`wms-${c}@example.invalid`,fullName:'مسؤول مختبر المستودع '+c,passwordHash:'local-fixture-no-password'}});
      await a.subscription.create({data:{companyId:c,planId:plan.id,status:'ACTIVE'}});
      await a.companyOperatingSettings.create({data:{companyId:c,operatingMode:'SFA'}});
    }
    await a.user.create({data:{id:'clerk-a',companyId:'a',roleId:clerk.id,email:'clerk@example.invalid',fullName:'أمين المستودع — اختبار',passwordHash:'local-fixture-no-password'}});
    for(const r of [role,clerk])for(const code of ['sfa.access','wms.read','wms.products.manage','wms.opening.post','wms.access.manage','company.manage']){
      const permission=await a.permission.upsert({where:{code},create:{code},update:{}});
      if(r===role||['sfa.access','wms.read','wms.opening.post'].includes(code))await a.rolePermission.create({data:{roleId:r.id,permissionId:permission.id}});
    }
    await a.warehouse.createMany({data:[{id:'wa',companyId:'a',code:'MAIN',name:'المستودع الرئيسي — مختبر'},{id:'wa2',companyId:'a',code:'EMPTY',name:'مستودع فارغ — مختبر'},{id:'wb',companyId:'b',code:'OTHER',name:'مستودع الشركة الأخرى'}]});
    const sa=new WmsService(a,new AuditLogService(a)),sb=new WmsService(b,new AuditLogService(b)),user=wmsUser();
    const p=await sa.saveProduct(user,'wa',{code:'RACE',name:'اختبار تزامن الحركات',piecesPerCarton:24,trackBatches:true,trackExpiry:true});
    const batch=await sa.createBatch(user,'wa',{productId:p.id,code:'RACE-LOT',productionDate:'2026-01-01',expiryDate:'2099-01-01'});
    const cmd={productId:p.id,batchId:batch.id,quantity:'2',unit:'CARTON',reference:'NATIVE-RACE',reason:'Independent connection count',idempotencyKey:randomUUID()};
    const duplicate=await Promise.all([sa.postOpening(user,'wa',cmd),sb.postOpening(user,'wa',cmd)]);
    assert.equal(duplicate[0].id,duplicate[1].id);assert.equal(await a.wmsMovement.count(),1);
    assert.equal(await a.auditLog.count({where:{action:'wms.opening.posted'}}),1);evidence.checks.push('two independent connections: duplicate retry = one movement + one audit');
    const reversal={reason:'Native concurrent reversal',idempotencyKey:randomUUID()};
    const reverse=await Promise.all([sa.reverseOpening(user,'wa',duplicate[0].id,reversal),sb.reverseOpening(user,'wa',duplicate[0].id,reversal)]);
    assert.equal(reverse[0].id,reverse[1].id);assert.equal(await a.wmsMovement.count(),2);evidence.checks.push('concurrent identical reversal = one reversal');
    const distinct=await Promise.allSettled([sa.postOpening(user,'wa',{...cmd,reference:'RACE-ONE',idempotencyKey:randomUUID()}),sb.postOpening(user,'wa',{...cmd,reference:'RACE-TWO',idempotencyKey:randomUUID()})]);
    assert.equal(distinct.filter(x=>x.status==='fulfilled').length,1);assert.equal(distinct.filter(x=>x.status==='rejected').length,1);
    assert.equal((await a.wmsPosition.findFirst()).physical.toString(),'48');evidence.checks.push('different concurrent opening keys cannot double-post a position');
    const failing=new WmsService(a,{record:async()=>{throw Error('native audit failure')}});
    const px=await sa.saveProduct(user,'wa',{code:'ROLLBACK',name:'Atomic failure fixture'});
    const before=await a.wmsMovement.count();await assert.rejects(failing.postOpening(user,'wa',{...cmd,productId:px.id,batchId:null,unit:'BASE',reference:'FAIL',idempotencyKey:randomUUID()}),/native audit failure/);
    assert.equal(await a.wmsMovement.count(),before);assert.equal(await a.wmsBatch.count({where:{productId:px.id}}),0);evidence.checks.push('native audit failure rolls back lot, position and movement');
    await sa.setAccess(user,'wa',{userId:'clerk-a',granted:true});
    // Synthetic representative operational positions, plus other-tenant noise.
    await a.$executeRawUnsafe(`INSERT INTO wms_products(id,company_id,code,name) SELECT 'perf-'||c||'-'||g,c,'PERF-'||g,'Synthetic product '||g FROM (VALUES('a'),('b')) x(c) CROSS JOIN generate_series(1,2000) g`);
    await a.$executeRawUnsafe(`INSERT INTO wms_batches(id,company_id,product_id,code,production_date,expiry_date) SELECT 'lot-'||p.id,p.company_id,p.id,'LOT-'||n,DATE '2026-01-01',(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+(n%60) FROM wms_products p CROSS JOIN generate_series(1,1) n WHERE p.id LIKE 'perf-%'`);
    await a.$executeRawUnsafe(`INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) SELECT company_id,CASE WHEN company_id='a' THEN 'wa' ELSE 'wb' END,id,120 FROM wms_batches WHERE id LIKE 'lot-perf-%'`);
    await a.$executeRawUnsafe('ANALYZE');
    // Capture actual service SQL (not a hand-written approximation).
    let capture=false;const traced=new PrismaClient({datasourceUrl:url,log:[{emit:'event',level:'query'}]});
    traced.$on('query',event=>{if(capture)evidence.queries.push({sql:event.query,params:JSON.parse(event.params),durationMs:event.duration});});
    const tracedService=new WmsService(traced,new AuditLogService(traced));
    const timings=[];let result;
    for(let i=0;i<20;i++){const start=performance.now();capture=i===0;result=await tracedService.summary(user,'wa',{horizon:30});capture=false;timings.push(performance.now()-start);}
    for(const operation of [()=>tracedService.products(user,'wa',{}),()=>tracedService.batches(user,'wa',{nearExpiry:'true'}),()=>tracedService.movements(user,'wa',{})]){capture=true;await operation();capture=false;}
    await traced.$disconnect();
    for(const q of evidence.queries)q.plan=await a.$queryRawUnsafe('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+q.sql,...q.params);
    timings.sort((x,y)=>x-y);evidence.performance={positionsPerTenant:2001,otherTenantPositions:2000,summaryQueries:2,summaryReturnedBytes:Buffer.byteLength(JSON.stringify(result)),p50Ms:timings[10],p95Ms:timings[19],rssMB:process.memoryUsage().rss/1024/1024};
    evidence.checks.push('scoped summary/products/lots/ledger plans captured; pages bounded at 21 rows');
    fs.writeFileSync('.quality/wms/native.json',JSON.stringify(evidence,null,2));fs.writeFileSync('.quality/wms/runtime.json',JSON.stringify({database,url,warehouse:'wa',userId:'actor-a',clerkId:'clerk-a'},null,2));
    console.log(JSON.stringify({status:'PASS',checks:evidence.checks,performance:evidence.performance,database}));
  } finally {await a.$disconnect();await b.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
