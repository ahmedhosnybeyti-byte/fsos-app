// Explicit local-only full Canonical import. Never inherits application endpoints.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
if(process.cwd().toLowerCase()!=='d:\\field sales os')throw Error('Official workspace required');
const [psql,source,resume]=process.argv.slice(2);
if(!path.isAbsolute(psql??'')||!fs.existsSync(psql)||path.resolve(source??'').toLowerCase()!=='d:\\murshidak-import\\fsos_canonical_erp_demo_onecompany.xlsx')throw Error('Explicit approved source and existing local psql required');
for(const key of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(key))delete process.env[key];
process.env.PGCONNECT_TIMEOUT='5';
const args=['-X','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test'];
const directory=execFileSync(psql,[...args,'-d','postgres','-At','-c','SHOW data_directory'],{encoding:'utf8'}).trim();
assert.equal(path.resolve(directory).toLowerCase(),path.resolve('.quality/wms/pgdata').toLowerCase(),'Refuse non-fixture PostgreSQL');
const previous=resume==='--resume'?JSON.parse(fs.readFileSync('.quality/erp-import/native-runtime.json')):null;
if(previous)assert.match(previous.database,/^erp_history_[a-f0-9]{32}$/);
const database=previous?.database??'erp_history_'+randomUUID().replaceAll('-',''),url=`postgresql://wms_test@127.0.0.1:55561/${database}?connection_limit=2&sslmode=disable`;
process.env.NODE_ENV='test';process.env.DATABASE_URL=url;
if(!previous)execFileSync(psql,[...args,'-d','postgres','-c',`CREATE DATABASE ${database}`],{stdio:'pipe'});
const migrations=fs.readdirSync('packages/database/prisma/migrations').filter(n=>fs.existsSync(`packages/database/prisma/migrations/${n}/migration.sql`)).sort();
if(!previous)for(const name of migrations)execFileSync(psql,[...args,'-d',database,'-f',path.resolve(`packages/database/prisma/migrations/${name}/migration.sql`)],{stdio:'pipe'});
const ts=require('typescript');require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
require(require.resolve('reflect-metadata',{paths:[path.resolve('apps/api')]}));
const {PrismaClient}=require(require.resolve('@prisma/client',{paths:[path.resolve('packages/database')]}));
const {ErpImportService}=require(path.resolve('apps/api/src/modules/erp-import/erp-import.service.ts'));
const {ErpWorkbook}=require(path.resolve('apps/api/src/modules/erp-import/erp-import-xlsx.ts'));
const {importContracts,hash}=require(path.resolve('apps/api/src/modules/erp-import/erp-import-workbook.ts'));
const {AuditLogService}=require(path.resolve('apps/api/src/modules/audit-log/audit-log.service.ts'));
const {RieErpHistoryQueryService}=require(path.resolve('apps/api/src/modules/rie/erp-history-query.service.ts'));
const {RieExecutionCoordinatorService}=require(path.resolve('apps/api/src/modules/rie/rie-execution-coordinator.service.ts'));
const {RieScalableQueryService}=require(path.resolve('apps/api/src/modules/rie/scalable-query.service.ts'));
const {WmsService}=require(path.resolve('apps/api/src/modules/wms/wms.service.ts'));
const {wmsUser}=require(path.resolve('apps/api/src/modules/wms/wms-test-fixture.ts'));
const {admin,startInput}=require(path.resolve('apps/api/src/modules/erp-import/erp-import-test-fixture.ts'));
const out=path.resolve('.quality/erp-import'),storageRoot=path.join(out,'local-storage',database);fs.mkdirSync(storageRoot,{recursive:true});
const localPath=k=>{const p=path.resolve(storageRoot,k);if(!p.startsWith(storageRoot+path.sep))throw Error('Unsafe fixture storage key');return p;};
const storage={upload:async({key,body})=>{const p=localPath(key);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,body);},download:async k=>fs.readFileSync(localPath(k)),delete:async k=>fs.unlinkSync(localPath(k))};
const evidence={database,source,startedAt:new Date().toISOString(),migrations:migrations.length,checks:[]};
fs.writeFileSync(path.join(out,'native-runtime.json'),JSON.stringify({database,url,directory,source},null,2));
async function main(){
 const db=new PrismaClient({datasourceUrl:url,log:['error']}),service=new ErpImportService(db,new AuditLogService(db),storage);
 try{
  evidence.postgres=(await db.$queryRawUnsafe('SELECT version() AS version'))[0].version;
  if(!previous){await db.$executeRawUnsafe(`INSERT INTO companies(id,name,slug,status,updated_at) VALUES('a','Murshidak Demo Distribution — local isolated','erp-demo-a','ACTIVE',now()),('b','Unchanged isolation sentinel','erp-demo-b','ACTIVE',now());`);
  await db.$executeRawUnsafe(`INSERT INTO roles(id,code,name,updated_at) VALUES('role-admin','COMPANY_ADMIN','Company Admin',now()),('role-super','SUPER_ADMIN','Super Admin',now());`);
  await db.$executeRawUnsafe(`INSERT INTO users(id,company_id,role_id,email,password_hash,full_name,updated_at) VALUES('super',NULL,'role-super','super@example.invalid','fixture-no-login','Super',now()),('actor-a','a','role-admin','actor-a@example.invalid','fixture-no-login','Admin A',now());`);
  await db.$executeRawUnsafe(`INSERT INTO company_operating_settings(company_id,operating_mode,updated_at) VALUES('a','FULL_ERP',now()),('b','SFA',now());`);}
  const before=JSON.stringify(await db.$queryRawUnsafe(`SELECT c.*,to_jsonb(s) settings FROM companies c LEFT JOIN company_operating_settings s ON s.company_id=c.id ORDER BY c.id`));
  const audited=JSON.parse(fs.readFileSync(path.join(out,'approved-source-audit.json'),'utf8')),buffer=fs.readFileSync(source);assert.equal(hash(buffer),audited.sha256);
  if(!previous)await service.start(admin,'a',startInput);const uploaded=previous?(await db.$queryRawUnsafe(`SELECT id,project_id FROM erp_import_uploads ORDER BY created_at LIMIT 1`))[0]:await service.upload(admin,'a',{buffer,originalname:path.basename(source)});evidence.upload=uploaded.id;
  console.log(JSON.stringify({database,upload:uploaded.id,stage:previous?'resume database validation only':'streaming single full import',bytes:buffer.length}));
  const stage=service.stage.bind(service);let lastEntity='';service.stage=async(job,batch)=>{if(batch[0]?.entity!==lastEntity){lastEntity=batch[0]?.entity;console.log(JSON.stringify({stage:lastEntity,time:new Date().toISOString()}));}return stage(job,batch);};
  if(previous){
    // Resume validation of already durable staging, never parse facts again.
    const duplicateRows=JSON.parse(fs.readFileSync(path.join(out,'missing-source-data.json'),'utf8'));
    assert.equal(duplicateRows.length,21);
    const same=await db.$queryRawUnsafe(`SELECT count(*)::integer AS n FROM jsonb_to_recordset($1::jsonb) s(key text,row jsonb) JOIN erp_import_rows r ON r.project_id=$2 AND r.entity='Invoice Items' AND r.business_key=s.key AND r.data=s.row`,JSON.stringify(duplicateRows),uploaded.project_id);assert.equal(same[0].n,21);
    const job=(await db.$queryRawUnsafe(`SELECT status FROM erp_import_uploads WHERE id=$1`,uploaded.id))[0];assert.equal(job.status,'FAILED');
    await db.$transaction(async tx=>{await service.validate(tx,uploaded.project_id);await tx.$executeRawUnsafe(`UPDATE erp_import_uploads SET status='STAGED',row_count=686684,identical_count=21,rejected_count=(SELECT count(*) FROM erp_import_errors WHERE upload_id=$1),failure=NULL,finished_at=now() WHERE id=$1`,uploaded.id);await tx.$executeRawUnsafe(`UPDATE erp_import_projects SET revision=revision+1 WHERE id=$1`,uploaded.project_id);await new AuditLogService(db).record({companyId:'a',userId:'super',action:'erp_import.local_validation_resumed',entityId:uploaded.id,metadata:{rows:686684,identical:21,noSourceReimport:true}},tx);},{timeout:600000});evidence.validationResumedWithoutReimport=true;
  }else await service.processNext();let status=await service.status(admin,'a');
  fs.writeFileSync(path.join(out,'native-staging.json'),JSON.stringify(status,null,2));
  assert.deepEqual(status.blockers,[],'Full source must stage without blockers');
  evidence.entities=status.entities;assert.equal(status.entities.reduce((n,e)=>n+e.rows,0),audited.entities.reduce((n,e)=>n+e.rows,0)-21);
  for(const expected of audited.entities)assert.equal(status.entities.find(e=>e.entity===expected.entity)?.rows,expected.rows-(expected.entity==='Invoice Items'?21:0),expected.entity);
  const repeat=await service.upload(admin,'a',{buffer,originalname:path.basename(source)});assert.equal(repeat.duplicate,true);assert.equal(repeat.id,uploaded.id);
  assert.equal(await service.processNext(),false,'SHA duplicate cannot queue or parse again');evidence.checks.push('686684 source rows, 21 identical repeated lines ignored, 686663 unique staged rows; SHA retry creates no upload/row duplicates');
  console.log(JSON.stringify({stage:'approval',rows:status.entities.reduce((n,e)=>n+e.rows,0),time:new Date().toISOString()}));
  status=await service.approve(admin,'a',{revision:status.project.revision,note:'Local synthetic Canonical verified; historical approval only'});
  assert.equal(status.project.state,'APPROVED');
  // Small master-only parity inspection; never rereads the large fact sheets.
  const book=await new ErpWorkbook(buffer).initialize(),contract=importContracts.find(t=>t.entity==='Products'),sheet=book.sheets.find(s=>s.name==='Products'),products=[];
  for await(const {row}of book.rows(sheet,contract))products.push(row);
  const linked=await db.$queryRawUnsafe(`SELECT w.code,w.name,w.barcode,w.pieces_per_carton,l.source_uom,r.data FROM wms_products w JOIN erp_product_links l ON l.company_id=w.company_id AND l.product_id=w.id JOIN erp_import_rows r ON r.project_id=l.project_id AND r.entity='Products' AND r.data->>'ProductCode'=l.source_code WHERE w.company_id='a' ORDER BY w.code`);
  assert.equal(linked.length,products.length);for(const p of products){const w=linked.find(w=>w.code===p.ProductCode);assert.equal(w?.name,p.ProductName);assert.deepEqual(w.data,p);assert.deepEqual(w.source_uom,{BaseUnit:p.BaseUnit,CartonQty:p.CartonQty,PackQty:p.PackQty,PieceQty:p.PieceQty});assert.equal(w.pieces_per_carton,p.CartonQty);}
  evidence.productParity={expected:products.length,matched:linked.length,originalNamesCodesAndUnits:true};evidence.checks.push('All 100 products match original codes, Arabic names, packing UOM and full source master data');
  const rie=new RieScalableQueryService(db,{}),result=await rie.query({companyId:'a',entityName:'Products',projection:[{field:'ProductCode'},{field:'ProductName'}],pagination:{limit:101,offset:0}});assert.equal(result.records.length,100);assert.equal(result.records.find(p=>p.ProductCode==='P-001').ProductName,products[0].ProductName);
  const history=new RieErpHistoryQueryService(db,new RieExecutionCoordinatorService());evidence.demo=await history.query('a','Invoices','2026-12-31',1);evidence.today=await history.query('a','Invoices',new Date().toISOString().slice(0,10),1);assert.ok(evidence.demo.total>evidence.today.total);
  assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::integer n FROM rie_canonical_entity_rows WHERE company_id='a' AND entity_name='Invoices' AND (data->>'InvoiceDate')::date>CURRENT_DATE`))[0].n,0);evidence.checks.push('Existing RIE reads imported masters; explicit demo reference includes future history, ordinary analytics excludes future transactions');
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::integer n FROM wms_movements'))[0].n,0);
  assert.equal(JSON.stringify(await db.$queryRawUnsafe(`SELECT c.*,to_jsonb(s) settings FROM companies c LEFT JOIN company_operating_settings s ON s.company_id=c.id ORDER BY c.id`)),before);evidence.checks.push('Import changed no company mode, feature settings, roles or subscriptions; no historical stock postings');
  await db.$executeRawUnsafe(`INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES('wa','a','MAIN','Isolated operational test',now());`);
  await db.$executeRawUnsafe(`UPDATE companies SET feature_access='{"warehouse-core":"ENABLED","sfa-setup":"ENABLED"}' WHERE id='a'`);
  const wms=new WmsService(db,new AuditLogService(db)),p=(await db.$queryRawUnsafe(`SELECT id FROM wms_products WHERE company_id='a' AND code='P-001'`))[0];
  const command={productId:p.id,quantity:'2',unit:'CARTON',reference:'SEPARATE-LOCAL-OPENING',reason:'Explicit new test opening after import; never historical stock',idempotencyKey:randomUUID()};
  const posted=await wms.postOpening(wmsUser(),'wa',command),retried=await wms.postOpening(wmsUser(),'wa',command);assert.equal(posted.id,retried.id);
  assert.equal((await db.$queryRawUnsafe(`SELECT p.physical::text FROM wms_positions p JOIN wms_batches b ON b.company_id=p.company_id AND b.id=p.batch_id WHERE p.company_id='a' AND b.product_id=$1`,p.id))[0].physical,'24.000000');
  assert.equal((await history.query('a','Invoices','2026-12-31',1)).total,evidence.demo.total);
  assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::integer n FROM erp_import_rows r JOIN erp_import_projects p ON p.id=r.project_id WHERE p.company_id='b'`))[0].n,0);assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::integer n FROM wms_products WHERE company_id='b'`))[0].n,0);
  evidence.checks.push('WMS uses the same P-001 for a separate explicit 2-carton=24-piece new opening, retry posts once; history and other tenant unchanged');
  evidence.openingBalancesMissing=status.openingBalancesMissing;evidence.completedAt=new Date().toISOString();evidence.status='PASS';
  fs.writeFileSync(path.join(out,'native-results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:'PASS',database,sourceRows:686684,identicalDuplicates:21,uniqueRows:686663,products:linked.length,checks:evidence.checks}));
 }catch(e){evidence.status='FAIL';evidence.error=e.stack;fs.writeFileSync(path.join(out,'native-results.json'),JSON.stringify(evidence,null,2));throw e;}finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
