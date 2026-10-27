// Explicit local synthetic PostgreSQL/HTTP evidence. No .env, dumps or operating DBs.
// Run from the official root: node <this-file> [--source <final-maintained-source>]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks'),{AsyncLocalStorage}=require('node:async_hooks');
const root=process.cwd();assert.equal(root.toLowerCase(),'d:\\field sales os');
const argv=process.argv.slice(2);assert.ok(!argv.length||(argv.length===2&&argv[0]==='--source'));
const source=path.resolve(argv[1]??root);assert.ok(source===root||source.startsWith(root+path.sep));
const output=path.join(root,'.quality/supplier-readiness');fs.mkdirSync(output,{recursive:true});
for(const key of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(key))delete process.env[key];
process.env.PGCONNECT_TIMEOUT='3';process.env.PGCLIENTENCODING='UTF8';process.env.NODE_ENV='test';
const bin=path.join(root,'.tmp/erp-blockers-20261019/pgsql/bin');
const cluster=path.join(root,'.quality/wms/pgdata');
const pgArgs=['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test'];
const sql=(text,database='postgres')=>execFileSync(path.join(bin,'psql.exe'),[...pgArgs,'-d',database,'-f','-'],{input:Buffer.from(text,'utf8'),encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024}).trim();
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
assert.equal(path.resolve(sql('SHOW data_directory')).toLowerCase(),cluster.toLowerCase());
const database='supplier_verify_'+randomUUID().replaceAll('-','');assert.match(database,/^supplier_verify_[a-f0-9]{32}$/);
const local=name=>require(require.resolve(name,{paths:[path.join(root,'apps/api'),path.join(root,'packages/database'),root]}));
const ts=local('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
local('reflect-metadata');
const {PrismaClient,Prisma}=local('@prisma/client');
const {Module}=local('@nestjs/common'),{NestFactory,Reflector}=local('@nestjs/core');
const load=file=>require(path.join(source,file));
const {WmsService}=load('apps/api/src/modules/wms/wms.service.ts');
const {WmsOperationsService}=load('apps/api/src/modules/wms/wms-operations.service.ts');
const {WmsCoreService}=load('apps/api/src/modules/wms/wms-core.service.ts');
const {SupplierMasterService}=load('apps/api/src/modules/wms/supplier-master.service.ts');
const {WmsOperationsController}=load('apps/api/src/modules/wms/wms-operations.controller.ts');
const {WmsCoreController}=load('apps/api/src/modules/wms/wms-core.controller.ts');
const {SupplierMasterController}=load('apps/api/src/modules/wms/supplier-master.controller.ts');
const {AuditLogService}=load('apps/api/src/modules/audit-log/audit-log.service.ts');
const {RolesGuard}=load('apps/api/src/common/guards/roles.guard.ts');
const {SfaAccessGuard}=load('apps/api/src/common/guards/sfa-access.guard.ts');
const {CompanyScreenAccessGuard}=load('apps/api/src/common/guards/company-screen-access.guard.ts');
const {configureSupplierDocumentJson}=load('apps/api/src/common/http/supplier-document-json.ts');
const schemas=local('@field-sales-os/schemas');
const als=new AsyncLocalStorage();
const protectedTables=['wms_positions','wms_movements','wms_custody_positions','role_permissions','company_operating_settings','accounting_lines','accounting_journals'];
const evidence={schemaVersion:1,synthetic:true,status:'BLOCK',postgres:null,migrations:[],checks:[],scenarios:[],scope:{http:'real Nest controllers/parser and service, synthetic authenticated actors; JWT and subscription not exercised',network:'127.0.0.1 only',operatingDatabaseTouched:false,backupsCreated:false},limitations:['No approved comparable baseline or budget','No native pool/lock wait instrumentation','Prisma query events exclude statements internal to PostgreSQL functions','Five mixed-operation request samples per size, zero discarded warmups; observations only','Small controlled concurrency is not user capacity']};
let clients=[],app,created=false,requestSequence=0;
const queryCounts=[0,0],failOperation=[null,null];
const snapshots=async client=>Object.fromEntries(await Promise.all(protectedTables.map(async table=>[table,(await client.$queryRawUnsafe(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text) AS digest FROM ${table} t`))[0].digest])));
const commandSnapshot=async client=>({...await snapshots(client),...Object.fromEntries(await Promise.all(['wms_receipts','wms_receipt_lines','wms_receipt_supplier_metadata','wms_returns','wms_return_lines','wms_commands','wms_operation_events','audit_logs'].map(async table=>[table,(await client.$queryRawUnsafe(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text) AS digest FROM ${table} t`))[0].digest])))});
const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
async function main(){
  let baseUrl;
  try{
    sql(`CREATE DATABASE ${database}`);created=true;
    const url=`postgresql://wms_test@127.0.0.1:55561/${database}?connection_limit=1&sslmode=disable`;process.env.DATABASE_URL=url;
    const migrationRoot=path.join(source,'packages/database/prisma/migrations');
    const pending=['20261027150000_wms_suppliers','20261027160000_wms_complete_supplier_documents'];
    const folders=fs.readdirSync(migrationRoot).filter(name=>fs.existsSync(path.join(migrationRoot,name,'migration.sql'))).sort();
    // Preserve each migration's own transaction convention (some build indexes concurrently).
    for(const name of folders.filter(name=>!pending.includes(name))){execFileSync(path.join(bin,'psql.exe'),[...pgArgs,'-d',database,'-f',path.join(migrationRoot,name,'migration.sql')],{stdio:'pipe'});evidence.migrations.push(name);}
    clients=[0,1].map(slot=>{const client=new PrismaClient({datasourceUrl:url,log:[{emit:'event',level:'query'}]});client.$on('query',()=>queryCounts[slot]++);return client;});
    const a=clients[0];evidence.postgres=(await a.$queryRaw`SELECT version() AS version`)[0].version;
    await a.role.create({data:{id:'supplier-fixture-setup-role',code:'SUPPLIER_FIXTURE_SETUP',name:'Synthetic setup only'}});
    for(const id of ['supplier-a','supplier-b']){await a.company.create({data:{id,slug:id,name:'Synthetic '+id,featureAccess:{'warehouse-core':'ENABLED'}}});await a.companyOperatingSettings.create({data:{companyId:id,operatingMode:'SFA'}});}
    for(const [id,company,role] of [['supplier-keeper','supplier-a','role_warehouse_keeper_v1'],['supplier-manager','supplier-a','role_warehouse_manager_v1'],['supplier-foreign','supplier-b','role_warehouse_keeper_v1']])await a.user.create({data:{id,companyId:company,roleId:role,email:id+'@example.invalid',fullName:'Synthetic '+id,passwordHash:'synthetic-never-login',status:'ACTIVE',mustChangePassword:false}});
    sql(`INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES('supplier-wa','supplier-a','MAIN','Synthetic supplier warehouse',now()),('supplier-wb','supplier-b','MAIN','Foreign synthetic warehouse',now());
      INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('supplier-a','supplier-wa','supplier-keeper'),('supplier-a','supplier-wa','supplier-manager'),('supplier-b','supplier-wb','supplier-foreign');`,database);
    await a.$executeRawUnsafe(`INSERT INTO wms_products(id,company_id,code,name,pieces_per_carton,track_batches) SELECT 'supplier-p-'||n,'supplier-a','SUP-'||n,'Synthetic water '||n,CASE WHEN n%2=0 THEN 6 ELSE 12 END,true FROM generate_series(1,1000)n`);
    // An existing isolated balance/ledger is retained while additive migrations apply.
    sql(`INSERT INTO wms_batches(id,company_id,product_id,code) VALUES('supplier-baseline-lot','supplier-a','supplier-p-1','BASELINE');
      INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('supplier-a','supplier-wa','supplier-baseline-lot',120);`,database);
    const before=await snapshots(a);
    for(const name of pending){assert.ok(folders.includes(name),'Missing final supplier migration '+name);execFileSync(path.join(bin,'psql.exe'),[...pgArgs,'-d',database,'--single-transaction','-f',path.join(migrationRoot,name,'migration.sql')],{stdio:'pipe'});evidence.migrations.push(name);assert.deepEqual(await snapshots(a),before);}
    evidence.checks.push('Both supplier migrations apply over full native schema and preserve existing stock/custody/GL/grants/settings');
    const actors={keeper:{companyId:'supplier-a',userId:'supplier-keeper',roleCode:'WAREHOUSE_KEEPER',permissions:[...schemas.warehouseKeeperPermissions]},manager:{companyId:'supplier-a',userId:'supplier-manager',roleCode:'WAREHOUSE_MANAGER',permissions:[...schemas.warehouseManagerPermissions]},foreign:{companyId:'supplier-b',userId:'supplier-foreign',roleCode:'WAREHOUSE_KEEPER',permissions:[...schemas.warehouseKeeperPermissions]}};
    const services=clients.map((client,slot)=>{const baseAudit=new AuditLogService(client);const audit={record:async(input,tx)=>{if(failOperation[slot]===input.action)throw Error('Synthetic native audit failure');return baseAudit.record(input,tx)}};const access=new WmsService(client,audit);return {ops:new WmsOperationsService(client,access,audit),core:new WmsCoreService(client,access),master:new SupplierMasterService(client,access,audit)};});
    const dynamic=name=>new Proxy({}, {get:(_,key)=>{const value=services[0][name][key];return typeof value==='function'?(...args)=>{const slot=als.getStore()?.slot??0;return services[slot][name][key](...args)}:value}});
    class FixtureModule{}
    Module({controllers:[WmsOperationsController,WmsCoreController,SupplierMasterController],providers:[{provide:WmsOperationsService,useValue:dynamic('ops')},{provide:WmsCoreService,useValue:dynamic('core')},{provide:SupplierMasterService,useValue:dynamic('master')}]})(FixtureModule);
    app=await NestFactory.create(FixtureModule,{logger:false,abortOnError:false});configureSupplierDocumentJson(app);app.setGlobalPrefix('api/v1');
    app.use((req,res,next)=>{const actor=actors[req.headers['x-fixture-actor']??'keeper'];assert.ok(actor,'Unknown synthetic actor');req.user=actor;als.run({slot:req.headers['x-fixture-slot']==='1'?1:0},next)});
    const guardPrisma=new Proxy({}, {get:(_,key)=>clients[als.getStore()?.slot??0][key]});
    const reflector=new Reflector();app.useGlobalGuards(new RolesGuard(reflector,{record:async()=>{}}),new SfaAccessGuard(reflector,guardPrisma),new CompanyScreenAccessGuard(reflector,guardPrisma));
    await app.listen(0,'127.0.0.1');baseUrl=await app.getUrl();
    async function http(route,{body,actor='keeper',slot=0,status=200}={}){const start=performance.now(),count=queryCounts[slot],payload=body===undefined?null:JSON.stringify(body);const response=await fetch(baseUrl+'/api/v1/sfa/wms/warehouses/supplier-wa/'+route,{method:payload?'POST':'GET',headers:{'content-type':'application/json','x-fixture-actor':actor,'x-fixture-slot':String(slot)},body:payload});const text=await response.text();let data;try{data=JSON.parse(text)}catch{throw Error('Non-JSON synthetic HTTP response')};assert.equal(response.status,status,`Unexpected HTTP status for synthetic request ${++requestSequence}: ${JSON.stringify(data)}`);const end=performance.now();return {data,sample:{operation:body?.operation??(route==='suppliers'?'supplier-master':'read'),startedMs:start,endedMs:end,apiMs:end-start,sqlCount:queryCounts[slot]-count,requestBytes:payload?Buffer.byteLength(payload):0,responseBytes:Buffer.byteLength(text),processRssBytes:process.memoryUsage().rss}};}
    const unwrap=result=>result.data?.data??result.data;
    const command=async(operation,input,options={})=>http('commands',{body:{operation,input:{idempotencyKey:randomUUID(),...input}},status:201,...options});
    const supplierInput={code:'WATER-DEMO',name:'مورد مياه تجريبي',idempotencyKey:randomUUID()};
    const supplier=unwrap(await http('suppliers',{body:supplierInput,status:201}));
    const supplierReplay=unwrap(await http('suppliers',{body:supplierInput,status:201,slot:1}));assert.equal(supplierReplay.id,supplier.id);
    await http('suppliers',{body:{...supplierInput,name:'Changed same retry key'},status:409});
    await http('suppliers',{body:{...supplierInput,idempotencyKey:randomUUID()},status:409});
    await http('suppliers',{actor:'foreign',status:404});
    const foreignSupplier=await services[0].master.create(actors.foreign,'supplier-wb',{code:'WATER-DEMO',name:'Foreign synthetic supplier',idempotencyKey:randomUUID()});
    const legacy=unwrap(await command('receipt.create',{reference:'LEGACY-COMPATIBLE',supplierName:'Legacy synthetic supplier',supplierReference:'LEGACY-INV',lines:[{productId:'supplier-p-1',batchCode:'LEGACY-LOT',unit:'BASE',expectedQuantity:'12',acceptedQuantity:'12',quarantinedQuantity:'0',rejectedQuantity:'0',rejectionReason:''}],note:'Legacy API contract remains valid'}));
    assert.equal(unwrap(await http('receipts/'+legacy.id)).supplierName,'Legacy synthetic supplier');
    const beforeForeign=await commandSnapshot(a);
    await assert.rejects(a.$executeRaw(Prisma.sql`INSERT INTO wms_receipt_supplier_metadata(company_id,receipt_id,supplier_id,document_date) VALUES('supplier-a',${legacy.id},${foreignSupplier.id},'2026-10-27')`));
    assert.deepEqual(await commandSnapshot(a),beforeForeign);
    evidence.checks.push('Real HTTP supplier same-key replay, duplicate code, changed retry and tenant isolation; native composite supplier/company FK; legacy receipt contract');
    for(const size of [21,83,1000]){
      const lines=Array.from({length:size},(_,i)=>{const factor=(i+1)%2===0?6:12,expected=2*factor+5;return {productId:'supplier-p-'+(i+1),batchCode:`S${size}-LOT-${i+1}`,unit:'BASE',expectedQuantity:String(expected),acceptedQuantity:String(expected-3),quarantinedQuantity:'2',rejectedQuantity:'1',rejectionReason:'Synthetic inspection hold and rejection'};});
      const create={reference:`SYNTHETIC-${size}`,supplierId:supplier.id,supplierName:supplier.name,supplierReference:`INV-${size}`,documentDate:'2026-10-27',lines,note:'Synthetic complete supplier receipt',idempotencyKey:randomUUID()};
      const stockBefore=await snapshots(a),draftResponse=await command('receipt.create',create),draft=unwrap(draftResponse);
      assert.deepEqual(await snapshots(a),stockBefore);const doc=unwrap(await http('receipts/'+draft.id));assert.equal(doc.lines.length,size);assert.equal(doc.supplierId,supplier.id);
      const submit=unwrap(await command('receipt.submit',{id:draft.id,version:1,note:'Submit complete synthetic receipt'}));
      await command('receipt.review',{id:draft.id,version:2,note:'Keeper cannot approve'}, {status:403});
      await command('receipt.review',{id:draft.id,version:2,note:'Manager reviews all quantities'},{actor:'manager'});assert.deepEqual(await snapshots(a),stockBefore);
      const approval={id:draft.id,version:3,note:'Manager approves complete synthetic receipt',idempotencyKey:randomUUID()};
      const [approved,replayed]=await Promise.all([command('receipt.approve',approval,{actor:'manager',slot:0}),command('receipt.approve',approval,{actor:'manager',slot:1})]);assert.deepEqual(unwrap(approved),unwrap(replayed));
      assert.ok(Math.min(approved.sample.endedMs,replayed.sample.endedMs)>Math.max(approved.sample.startedMs,replayed.sample.startedMs),'Independent receipt clients must actually overlap');
      assert.equal((await a.$queryRaw(Prisma.sql`SELECT count(*)::int n FROM wms_movements m JOIN wms_operation_events e ON e.id=m.reference WHERE e.receipt_id=${draft.id} AND e.operation='receipt.approve'`))[0].n,size);
      const sourceDoc=unwrap(await http('return-sources/SUPPLIER/'+draft.id));assert.equal(sourceDoc.lines.length,size);
      const returnLines=sourceDoc.lines.map((line,i)=>({sourceLineId:line.sourceLineId,unit:'BASE',declaredQuantity:String(line.piecesPerCarton+1),actualQuantity:String(line.piecesPerCarton+1),quality:'GOOD',fromQuarantine:false,discrepancyReason:''}));
      const returned=unwrap(await command('supplier.create',{reference:`SYNTHETIC-RETURN-${size}`,sourceId:draft.id,note:'Complete original source-linked synthetic return',lines:returnLines}));
      assert.equal(unwrap(await http('return-documents/'+returned.id)).lines.length,size);
      await command('supplier.submit',{id:returned.id,version:1,note:'Submit complete return'});await command('supplier.review',{id:returned.id,version:2,note:'Manager reviews complete return'},{actor:'manager'});
      const returnInput={id:returned.id,version:3,note:'Manager posts complete return',idempotencyKey:randomUUID()};
      const beforeFailure=await commandSnapshot(a);failOperation[0]='wms.supplier.post';await command('supplier.post',returnInput,{actor:'manager',status:500});failOperation[0]=null;assert.deepEqual(await commandSnapshot(a),beforeFailure);
      const posted=await Promise.all([command('supplier.post',returnInput,{actor:'manager',slot:0}),command('supplier.post',returnInput,{actor:'manager',slot:1})]);assert.deepEqual(unwrap(posted[0]),unwrap(posted[1]));
      assert.ok(Math.min(...posted.map(r=>r.sample.endedMs))>Math.max(...posted.map(r=>r.sample.startedMs)),'Independent return clients must actually overlap');
      assert.equal((await a.$queryRaw(Prisma.sql`SELECT count(*)::int n FROM wms_movements m JOIN wms_operation_events e ON e.id=m.reference WHERE e.return_id=${returned.id} AND e.operation='supplier.post'`))[0].n,size);
      const parity=await a.$queryRaw(Prisma.sql`SELECT count(*)::int n FROM wms_receipt_lines l JOIN wms_return_lines r ON r.company_id=l.company_id AND r.receipt_line_id=l.id JOIN wms_positions p ON p.company_id=l.company_id AND p.batch_id=l.batch_id AND p.warehouse_id='supplier-wa' WHERE l.receipt_id=${draft.id} AND p.physical=l.accepted_base+l.quarantined_base-r.quantity_base AND p.quarantined=l.quarantined_base`);assert.equal(parity[0].n,size);
      const samples=[draftResponse.sample,approved.sample,replayed.sample,...posted.map(r=>r.sample)];
      const fixtureRows=Number((await a.$queryRawUnsafe(`SELECT (SELECT count(*) FROM wms_products)+(SELECT count(*) FROM wms_receipts)+(SELECT count(*) FROM wms_receipt_lines)+(SELECT count(*) FROM wms_returns)+(SELECT count(*) FROM wms_return_lines)+(SELECT count(*) FROM wms_batches)+(SELECT count(*) FROM wms_positions)+(SELECT count(*) FROM wms_movements)+(SELECT count(*) FROM companies)+(SELECT count(*) FROM warehouses)+(SELECT count(*) FROM users)+(SELECT count(*) FROM wms_suppliers) AS n`))[0].n);
      evidence.scenarios.push({id:'supplier-documents-'+size,dataset:{catalogueProducts:1000,companies:2,warehouses:2,documentLines:size,fixtureRows},actualConcurrentClients:2,measuredOverlap:true,warmupsDiscarded:0,requestSamples:samples,apiP95Ms:p95(samples.map(s=>s.apiMs)),maxDriverSql:Math.max(...samples.map(s=>s.sqlCount)),maxRequestBytes:Math.max(...samples.map(s=>s.requestBytes)),stockParity:true,replayOnce:true,auditRollback:true,completeRead:true});
      evidence.checks.push(`Native HTTP ${size} lines: complete receipt and source return; two independent same-key posting clients; exact stock and atomic audit rollback`);
      console.log(JSON.stringify({scenario:size,status:'PASS',apiP95Ms:evidence.scenarios.at(-1).apiP95Ms,maxDriverSql:evidence.scenarios.at(-1).maxDriverSql}));
    }
    evidence.status='PASS';
  }finally{
    if(app)await app.close();for(const client of clients)await client.$disconnect();
    if(created){assert.match(database,/^supplier_verify_[a-f0-9]{32}$/);sql(`DROP DATABASE ${database}`);evidence.disposableDatabaseRemoved=true;}
    evidence.migrationDigest=createHash('sha256').update(evidence.migrations.map(name=>fs.readFileSync(path.join(source,'packages/database/prisma/migrations',name,'migration.sql'))).map(buf=>buf.toString('utf8')).join('\n')).digest('hex');
    evidence.testedSourceSha256=Object.fromEntries(['apps/api/src/modules/wms/wms.service.ts','apps/api/src/modules/wms/wms-operations.service.ts','apps/api/src/modules/wms/wms-core.service.ts','apps/api/src/modules/wms/supplier-master.service.ts','apps/api/src/modules/wms/wms-operations.controller.ts','apps/api/src/modules/wms/wms-core.controller.ts','apps/api/src/modules/wms/supplier-master.controller.ts','apps/api/src/common/http/supplier-document-json.ts','packages/schemas/src/wms-operations.schemas.ts','packages/schemas/src/wms-core.schemas.ts'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')]));
    fs.writeFileSync(path.join(output,'native-http.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,artifact:'.quality/supplier-readiness/native-http.json'}));
    if(evidence.status==='PASS'){
      const {sourceDigest,validateEvidence}=await import(require('node:url').pathToFileURL(path.join(root,'tools/quality/scalability.mjs')).href);
      const normalized={schemaVersion:1,synthetic:true,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceDigest:sourceDigest(root),environment:'windows-native-pg18.6-prisma-two-single-connection-clients-v1',scenarios:evidence.scenarios.map(s=>({id:s.id,workload:'write',dataset:{fingerprint:createHash('sha256').update(JSON.stringify({version:1,scenario:s.id,rows:s.dataset.fixtureRows,migrations:evidence.migrationDigest})).digest('hex'),rows:s.dataset.fixtureRows,statistics:'unknown'},concurrency:2,warmup:0,durationMs:Math.max(...s.requestSamples.map(x=>x.endedMs))-Math.min(...s.requestSamples.map(x=>x.startedMs)),samples:s.requestSamples.map(x=>({apiMs:x.apiMs,sqlCount:x.sqlCount,sqlExecutionMs:null,lockWaitMs:null,poolWaitMs:null,rieQueueMs:null,transactionMs:null,rowsScanned:null,rowsReturned:null,responseBytes:x.responseBytes,rssBytes:x.processRssBytes,errors:0})),plans:[],checks:{boundedReads:true,noNPlusOne:null,stockContention:true,custodyContention:'not-applicable',analyticsIngestion:'not-applicable'}}))};
      validateEvidence(normalized);fs.mkdirSync(path.join(root,'.quality/scalability'),{recursive:true});fs.writeFileSync(path.join(root,'.quality/scalability/current.json'),JSON.stringify(normalized,null,2));
    }
  }
}
main().catch(error=>{console.error(String(error?.message??'Native verification failed').replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted-db]'));process.exitCode=1});
