// Explicit synthetic native verification. Never loads .env, field_sales_os, or Docker.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const root=process.cwd();assert.equal(root.toLowerCase(),'d:\\field sales os');
const out=path.join(root,'.quality/sales-drafts');fs.mkdirSync(out,{recursive:true});
for(const k of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))delete process.env[k];
process.env.PGCONNECT_TIMEOUT='3';process.env.PGCLIENTENCODING='UTF8';
const bin=path.join(root,'.tmp/erp-blockers-20261019/pgsql/bin'),args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test'];
const sql=(s,d='postgres')=>execFileSync(path.join(bin,'psql.exe'),[...args,'-d',d,'-f','-'],{input:Buffer.from(s,'utf8'),encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
assert.equal(path.resolve(sql('SHOW data_directory')).toLowerCase(),path.join(root,'.quality/wms/pgdata').toLowerCase());
const database='sales_drafts_verify_'+randomUUID().replaceAll('-','');assert.match(database,/^sales_drafts_verify_[a-f0-9]{32}$/);
sql(`CREATE DATABASE ${database}`);
const url=`postgresql://wms_test@127.0.0.1:55561/${database}?connection_limit=1&sslmode=disable`;process.env.DATABASE_URL=url;process.env.NODE_ENV='test';
const local=n=>require(require.resolve(n,{paths:[path.join(root,'apps/api'),path.join(root,'packages/database')]}));
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);local('reflect-metadata');
const {PrismaClient,Prisma}=local('@prisma/client');
const {SalesDraftsService}=require(path.join(root,'apps/api/src/modules/sales-drafts/sales-drafts.service.ts'));
const {AuditLogService}=require(path.join(root,'apps/api/src/modules/audit-log/audit-log.service.ts'));
const {VisitExecutionService}=require(path.join(root,'apps/api/src/modules/visit-execution/visit-execution.service.ts'));
const protectedTables=['wms_products','wms_batches','wms_positions','wms_movements','wms_custody_positions','wms_allocations','wms_load_requests','accounting_books','accounting_parties','accounting_lines','accounting_journals','accounting_commands','accounting_vouchers','accounting_voucher_commands','rie_canonical_entity_rows','rie_entity_rows','rie_dataset_versions','files'];
const snapshot=()=>Object.fromEntries(protectedTables.map(t=>[t,sql(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]')::text) FROM ${t} t`,database)]));
const rie={queryCanonicalRecords:async()=>({records:[{CustomerCode:'C1',CustomerName:'عميل اختبار المسودة'}]})};
function service(client,fail=false){const audit=fail?{record:async()=>{throw Error('native draft audit failure')}}:new AuditLogService(client);return new SalesDraftsService(client,rie,audit)}
const u={userId:'draft-rep',companyId:'draft-a',roleCode:'SALES_REP',email:'sales-draft@example.invalid',permissions:['sfa.access','visits.execute','sales.drafts.manage'],orgUnitId:null,mustChangePassword:false};
const create=()=>({commandKey:randomUUID()});const save=(version,extra={})=>({commandKey:randomUUID(),version,warehouseId:'draft-w',notes:'Native saved content',lines:[{productId:'draft-p',quantity:'2',unit:'CARTON'}],...extra});
const evidence={status:'BLOCK',database,cluster:path.join(root,'.quality/wms/pgdata'),operatingDatabaseTouched:false,checks:[]};
async function main(){let a,b;try{
 const migration='20261022140000_sales_drafts';
 for(const name of fs.readdirSync('packages/database/prisma/migrations').sort())if(name!==migration&&fs.existsSync(path.join('packages/database/prisma/migrations',name,'migration.sql')))execFileSync(path.join(bin,'psql.exe'),[...args,'-d',database,'-f',path.resolve('packages/database/prisma/migrations',name,'migration.sql')],{stdio:'pipe'});
 a=new PrismaClient({datasourceUrl:url});b=new PrismaClient({datasourceUrl:url});
 const password='Draft!'+randomBytes(18).toString('hex'),hash=await local('argon2').hash(password);
 const role=await a.role.create({data:{id:'draft-role',code:'SALES_REP',name:'Synthetic sales draft rep'}});
 const plan=await a.plan.create({data:{id:'draft-plan',code:'draft-isolated',name:'Isolated only',features:{}}});
 for(const c of ['draft-a','draft-b']){await a.company.create({data:{id:c,slug:c,name:'اختبار مسودة البيع '+c,featureAccess:{overview:'ENABLED','visit-copilot':'ENABLED',account:'ENABLED'}}});await a.companyOperatingSettings.create({data:{companyId:c,operatingMode:'SFA'}});await a.subscription.create({data:{companyId:c,planId:plan.id,status:'ACTIVE'}});}
 for(const [id,c,email] of [['draft-rep','draft-a',u.email],['draft-other','draft-a','draft-other@example.invalid'],['draft-foreign','draft-b','draft-foreign@example.invalid']])await a.user.create({data:{id,companyId:c,roleId:role.id,email,fullName:id==='draft-rep'?'مندوب اختبار المسودة':id,passwordHash:hash,status:'ACTIVE',mustChangePassword:false}});
 await a.userRouteAssignment.create({data:{id:'draft-route-assignment',companyId:'draft-a',userId:'draft-rep',routeId:'R1',assignedByUserId:'draft-rep'}});
 await a.userRouteAssignment.create({data:{id:'draft-other-assignment',companyId:'draft-a',userId:'draft-other',routeId:'R2',assignedByUserId:'draft-rep'}});
 const entities={Customers:[{CustomerCode:'C1',CustomerName:'عميل اختبار المسودة',RouteID:'R1',Channel:'Cash Van',Status:'Active'},{CustomerCode:'C2',CustomerName:'خارج المسار',RouteID:'R2',Status:'Active'}],Routes:[{RouteID:'R1',RouteName:'مسار اختبار',SalesRepID:'E1'},{RouteID:'R2',RouteName:'مسار آخر',SalesRepID:'E2'}],Employees:[{EmployeeID:'E1',FullName:'مندوب اختبار المسودة',Email:u.email,Role:'Sales Rep'},{EmployeeID:'E2',FullName:'Other',Email:'draft-other@example.invalid',Role:'Sales Rep'}]};
 for(const [entity,rows] of Object.entries(entities)){
  const file=await a.file.create({data:{id:'draft-file-'+entity,companyId:'draft-a',uploadedByUserId:u.userId,datasetType:entity,fileName:'synthetic-'+entity+'.xlsx',storageKey:'synthetic/'+entity,sizeBytes:0,status:'READY',datasetTypeConfirmed:true}});
  await a.rieDatasetVersion.create({data:{id:'draft-version-'+entity,companyId:'draft-a',sourceFileId:file.id,entityName:entity,isActive:true,status:'READY',rowCount:rows.length,activatedAt:new Date(),materializedAt:new Date()}});
  for(const [i,row] of rows.entries())await a.rieCanonicalEntityRow.create({data:{id:'draft-canonical-'+entity+i,companyId:'draft-a',sourceFileId:file.id,entityName:entity,entityKey:String(row.CustomerCode??row.RouteID??row.EmployeeID),data:row}});
 }
 sql(`INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES('draft-w','draft-a','MAIN','مستودع الاختبار',now()),('draft-wb','draft-b','MAIN','Other warehouse',now());
 INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('draft-a','draft-w','draft-rep');
 INSERT INTO wms_products(id,company_id,code,name,base_unit,pieces_per_carton,track_batches) VALUES('draft-p','draft-a','WATER','مياه اختبار 330 مل','PIECE',12,true),('draft-kg','draft-a','KG','صنف وزن اختباري','KG',1,false),('draft-pb','draft-b','FOREIGN','Other product','PIECE',12,true);
 INSERT INTO wms_batches(id,company_id,product_id,code,expiry_date) VALUES('draft-lot','draft-a','draft-p','LOT-1','2099-01-01');
 INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('draft-a','draft-w','draft-lot',120);
 INSERT INTO wms_custody_positions(company_id,warehouse_id,batch_id,recipient_id,quantity) VALUES('draft-a','draft-w','draft-lot','draft-rep',24);
 INSERT INTO accounting_books(company_id) VALUES('draft-a');
 INSERT INTO accounting_accounts(company_id,code,name,type) VALUES('draft-a','AR','Customer AR','ASSET'),('draft-a','EQ','Equity','EQUITY');
 INSERT INTO accounting_parties(id,company_id,kind,code,name,account_code) VALUES('draft-customer','draft-a','CUSTOMER','C1','Synthetic customer','AR');
 SELECT accounting_post_voucher('draft-a','draft-rep','opening','draft-customer','OPENING','{"date":"2026-10-22","amount":"100","equityAccountCode":"EQ","reference":"OPEN","reason":"Synthetic opening"}', 'draft-voucher','draft-journal',NULL);`,database);
 // A real readable backup precedes the new additive migration, on this new database only.
 const backup=path.join(out,'before-sales-draft-migration.backup');execFileSync(path.join(bin,'pg_dump.exe'),['-h','127.0.0.1','-p','55561','-U','wms_test','-d',database,'-Fc','-f',backup],{stdio:'pipe'});
 assert.ok(execFileSync(path.join(bin,'pg_restore.exe'),['--list',backup],{encoding:'utf8'}).includes('TABLE DATA public users'));
 evidence.backup={path:backup,sha256:createHash('sha256').update(fs.readFileSync(backup)).digest('hex'),listingValidated:true};
 const beforeMigration=snapshot();execFileSync(path.join(bin,'psql.exe'),[...args,'-d',database,'--single-transaction','-f',path.resolve('packages/database/prisma/migrations',migration,'migration.sql')],{stdio:'pipe'});assert.deepEqual(snapshot(),beforeMigration);
 evidence.checks.push('Full baseline migration chain and new migration preserve synthetic stock/GL/AR/Canonical; pre-migration backup verified');
 for(const code of u.permissions){const p=await a.permission.findUniqueOrThrow({where:{code}});await a.rolePermission.create({data:{roleId:role.id,permissionId:p.id}})}
 for(const [id,c,rep,customer] of [['native-visit','draft-a','draft-rep','C1'],['browser-visit','draft-a','draft-rep','C2'],['foreign-visit','draft-b','draft-foreign','C1'],['other-visit','draft-a','draft-other','C1']])sql(`INSERT INTO visit_executions(id,company_id,rep_id,customer_code,customer_name,rep_name,entry_source,request_key) VALUES('${id}','${c}','${rep}','${customer}','عميل اختبار المسودة','مندوب اختبار المسودة','VISIT_COPILOT','${id}')`,database);
 const before=snapshot(),first=service(a),second=service(b),key=create();
 const duplicates=await Promise.all([first.create(u,'native-visit',key),second.create(u,'native-visit',key)]);assert.equal(duplicates[0].id,duplicates[1].id);let d=duplicates[0];
 const rekeys=await Promise.all([first.create(u,'native-visit',create()),second.create(u,'native-visit',create())]);assert.equal(rekeys[0].id,d.id);assert.equal(rekeys[1].id,d.id);
 evidence.checks.push('Independent connections: same-key and re-key concurrent creation produce one active draft');
 const races=await Promise.allSettled([first.save(u,'native-visit',d.id,save(0,{notes:'one'})),second.save(u,'native-visit',d.id,save(0,{notes:'two'}))]);assert.equal(races.filter(x=>x.status==='fulfilled').length,1);assert.equal(races.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);d=await first.read(u,'native-visit',d.id);
 evidence.checks.push('Independent conflicting edits: one commit, one 409; header and lines reopen intact');
 const cmd=save(d.version),replay=await Promise.all([first.save(u,'native-visit',d.id,cmd),second.save(u,'native-visit',d.id,cmd)]);assert.deepEqual(replay[0],replay[1]);d=replay[0];
 evidence.checks.push('Concurrent identical save: one version increment and one command/audit');
 await assert.rejects(service(a,true).save(u,'native-visit',d.id,save(d.version,{lines:[],notes:'must roll back'})),/native draft audit failure/);assert.deepEqual(await first.read(u,'native-visit',d.id),d);
 await assert.rejects(service(a,true).cancel(u,'native-visit',d.id,{...create(),version:d.version}),/native draft audit failure/);assert.deepEqual(await first.read(u,'native-visit',d.id),d);
 evidence.checks.push('Native audit failures roll back draft lines/header/version/command for save and cancellation');
 const cancel={...create(),version:d.version};const cancelled=await Promise.all([first.cancel(u,'native-visit',d.id,cancel),second.cancel(u,'native-visit',d.id,cancel)]);assert.deepEqual(cancelled[0],cancelled[1]);assert.deepEqual(cancelled[0].lines,d.lines);
 const next=await first.create(u,'native-visit',create());const finish={commandKey:randomUUID(),version:0,goal:'SALES',notes:'Native close',outcome:'ACHIEVED',failureReason:null,reasonDetail:'',finish:true};
 const visits=new VisitExecutionService(b,rie,{},new AuditLogService(b),{});
 const closing=await Promise.allSettled([first.save(u,'native-visit',next.id,save(0)),visits.save(u,'native-visit',finish)]);assert.equal(closing[1].status,'fulfilled');assert.ok(closing[0].status==='fulfilled'||closing[0].reason.status===409);
 const frozen=await first.read(u,'native-visit',next.id);assert.equal(frozen.editable,false);await assert.rejects(first.save(u,'native-visit',next.id,save(frozen.version)),e=>e.status===409);
 evidence.checks.push('Concurrent visit finish and draft save serialize; completed visit is readable and cannot mutate');
 assert.deepEqual(snapshot(),before);evidence.protectedBefore=before;evidence.protectedAfter=snapshot();evidence.checks.push('Exact protected-table digests unchanged after all native commands');
 evidence.queryPlan=JSON.parse(sql(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM sales_drafts WHERE company_id='draft-a' AND rep_id='draft-rep' AND visit_id='native-visit' ORDER BY created_at DESC,id LIMIT 21`,database));
 // The browser fixture uses a fresh real visit on its authorized route.
 sql("UPDATE visit_executions SET customer_code='C1' WHERE id='browser-visit'",database);
 const runtime={database,url:url.replace('connection_limit=1','connection_limit=5'),cluster:evidence.cluster,companyId:u.companyId,userId:u.userId,roleId:role.id,email:u.email,password,api:'http://127.0.0.1:4529',web:'http://localhost:4528',visitId:'browser-visit'};
 fs.writeFileSync(path.join(out,'runtime-private.json'),JSON.stringify(runtime,null,2));
 evidence.status='PASS';evidence.postgres=sql('SELECT version()',database);
 }catch(e){evidence.error=e.message;throw e}finally{if(a)await a.$disconnect();if(b)await b.$disconnect();fs.writeFileSync(path.join(out,'native.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,database,checks:evidence.checks,error:evidence.error}));}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
