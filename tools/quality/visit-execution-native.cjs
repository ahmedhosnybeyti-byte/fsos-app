// Explicit local-only native race evidence. Not run by the offline gate.
// Reuses the existing disposable test cluster; never loads .env or application DBs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
assert.equal(process.cwd().toLowerCase(),'d:\\field sales os');
for(const k of Object.keys(process.env))if(!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k))delete process.env[k];
process.env.PGCONNECT_TIMEOUT='3';
const psql=path.resolve('.tmp/erp-blockers-20261019/pgsql/bin/psql.exe');
const args=['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test'];
const sql=(query,db='postgres')=>execFileSync(psql,[...args,'-d',db,'-c',query],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
assert.equal(path.resolve(sql('SHOW data_directory')).toLowerCase(),path.resolve('.quality/wms/pgdata').toLowerCase());
const database='visit_execution_'+randomUUID().replaceAll('-','');
const url=`postgresql://wms_test@127.0.0.1:55561/${database}?connection_limit=1&sslmode=disable`;
process.env.NODE_ENV='test';process.env.DATABASE_URL=url;
const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
require(require.resolve('reflect-metadata',{paths:[path.resolve('apps/api')]}));
const {PrismaClient,Prisma}=require(require.resolve('@prisma/client',{paths:[path.resolve('packages/database')]}));
const {VisitExecutionService}=require(path.resolve('apps/api/src/modules/visit-execution/visit-execution.service.ts'));
const {AuditLogService}=require(path.resolve('apps/api/src/modules/audit-log/audit-log.service.ts'));
const objects=new Map();
const storage={upload:async({key,body})=>objects.set(key,body),delete:async key=>objects.delete(key)};
const rie={queryCanonicalRecords:async q=>({records:[{CustomerCode:q.scope.customer.values[0],CustomerName:'Native synthetic customer'}]})};
function wrap(client,fail=false){return new Proxy(client,{get(target,key){
  if(key==='$transaction')return work=>client.$transaction(tx=>work(wrap(tx,fail)),{timeout:15000});
  if(key==='user')return {findFirst:async({where:w})=>(await client.$queryRaw(Prisma.sql`SELECT full_name AS "fullName" FROM users WHERE id=${w.id} AND company_id=${w.companyId} AND status=${w.status}`))[0]};
  if(key==='auditLog')return {upsert:async({create:c})=>{if(fail)throw Error('native visit audit failure');return client.$executeRaw(Prisma.sql`INSERT INTO test_audit(event_key,action,entity_id) VALUES(${c.eventKey},${c.action},${c.entityId}) ON CONFLICT DO NOTHING`);}};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
}});}
const make=(client,fail=false)=>{const p=wrap(client,fail);return new VisitExecutionService(p,rie,{},new AuditLogService(p),storage);};
const actor={userId:'rep',companyId:'a',email:'native-visit@example.invalid',roleCode:'SALES_REP',permissions:['sfa.access','visits.execute'],orgUnitId:null,mustChangePassword:false};
const start=()=>({customerCode:'C-1',entrySource:'VISIT_COPILOT',requestKey:randomUUID()});
const command=(version,extra={})=>({commandKey:randomUUID(),version,goal:'COLLECTION',notes:'Native visit fixture',outcome:null,failureReason:null,reasonDetail:'',finish:false,...extra});
async function main(){
  let a,b,created=false;
  const evidence={status:'BLOCK',scope:'Dedicated disposable native PostgreSQL database; independent single-connection Prisma clients; storage is a test double',checks:[]};
  try{
    sql(`CREATE DATABASE ${database}`);created=true;
    sql(`CREATE TABLE companies(id text PRIMARY KEY);CREATE TABLE users(id text PRIMARY KEY,company_id text NOT NULL,full_name text,status text,UNIQUE(company_id,id));
      CREATE TABLE permissions(id text PRIMARY KEY,code text UNIQUE,description text);CREATE TABLE test_audit(event_key text PRIMARY KEY,action text,entity_id text);
      INSERT INTO companies VALUES('a');INSERT INTO users VALUES('rep','a','Native synthetic rep','ACTIVE');`,database);
    execFileSync(psql,[...args,'-d',database,'-f',path.resolve('packages/database/prisma/migrations/20261022120000_visit_execution/migration.sql')],{stdio:'pipe'});
    a=new PrismaClient({datasourceUrl:url});b=new PrismaClient({datasourceUrl:url});
    const first=make(a),second=make(b);
    evidence.postgres=(await a.$queryRaw`SELECT version() AS version`)[0].version;
    const request=start(),alias=start();
    const visits=await Promise.all([first.start(actor,request),second.start(actor,alias)]);
    assert.equal(visits[0].id,visits[1].id);
    assert.equal(sql('SELECT count(*) FROM visit_executions',database),'1');
    assert.equal(sql("SELECT count(*) FROM test_audit WHERE action='visit.started'",database),'1');
    evidence.checks.push('Independent connections: different start keys resume one open visit and one start audit');
    const visit=visits[0];
    const race=await Promise.allSettled([first.save(actor,visit.id,command(0,{notes:'one'})),second.save(actor,visit.id,command(0,{notes:'two'}))]);
    assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
    evidence.checks.push('Independent stale-version saves: exactly one winner, one conflict');
    const image={buffer:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(20)])};
    const photoRequest={kind:'SHELF',requestKey:randomUUID()};
    const photos=await Promise.all([first.upload(actor,visit.id,photoRequest,image),second.upload(actor,visit.id,photoRequest,image)]);
    assert.equal(photos[0].id,photos[1].id);assert.equal(objects.size,1);
    assert.equal(sql('SELECT count(*) FROM visit_execution_photos',database),'1');
    evidence.checks.push('Independent duplicate image uploads: one attached record/object; losing object compensated');
    const before=sql('SELECT version FROM visit_executions',database);
    await assert.rejects(make(a,true).save(actor,visit.id,command(1)),/native visit audit failure/);
    assert.equal(sql('SELECT version FROM visit_executions',database),before);
    evidence.checks.push('Native audit failure rolls notes/version/command back atomically');
    const finish=command(1,{finish:true,outcome:'ACHIEVED'});
    const ended=await Promise.all([first.save(actor,visit.id,finish),second.save(actor,visit.id,finish)]);
    assert.deepEqual(ended[0],ended[1]);
    assert.equal(sql("SELECT count(*) FROM test_audit WHERE action='visit.completed'",database),'1');
    assert.equal((await first.start(actor,request)).id,visit.id);assert.equal((await second.start(actor,alias)).id,visit.id);
    evidence.checks.push('Concurrent finish retry: one completion audit; both start identities remain attached after completion');
    const next=await first.start(actor,start());
    assert.notEqual(next.id,visit.id);
    await a.$executeRaw(Prisma.sql`INSERT INTO visit_execution_photos(id,company_id,visit_id,request_key,kind,object_key,content_hash,content_type,size_bytes)
      SELECT 'limit-'||n,'a',${next.id},'limit-'||n,'SHELF','limit-object-'||n,'synthetic','image/jpeg',10 FROM generate_series(1,29) n`);
    const capped=await Promise.allSettled([first.upload(actor,next.id,{kind:'COOLER',requestKey:randomUUID()},image),second.upload(actor,next.id,{kind:'PLANOGRAM',requestKey:randomUUID()},image)]);
    assert.equal(capped.filter(r=>r.status==='fulfilled').length,1);assert.equal(capped.filter(r=>r.status==='rejected'&&r.reason.status===400).length,1);
    assert.equal((await a.$queryRaw(Prisma.sql`SELECT count(*)::integer AS n FROM visit_execution_photos WHERE visit_id=${next.id}`))[0].n,30);
    assert.equal(objects.size,2);
    evidence.checks.push('Independent image-cap race at 29 images: exactly one accepted, one denied; never over 30');
    const plan=await a.$queryRawUnsafe(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM visit_executions WHERE company_id='a' AND rep_id='rep' AND lower(btrim(customer_code))='c-1' AND status='OPEN' LIMIT 1`);
    evidence.queryPlan=plan;
    evidence.status='PASS';
  }catch(error){evidence.error=error.message;throw error;}
  finally{
    if(a)await a.$disconnect();if(b)await b.$disconnect();
    if(created){assert.match(database,/^visit_execution_[a-f0-9]{32}$/);sql(`DROP DATABASE ${database}`);evidence.disposableDatabaseRemoved=true;}
    fs.mkdirSync('.quality/visit-execution',{recursive:true});fs.writeFileSync('.quality/visit-execution/native.json',JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({status:evidence.status,checks:evidence.checks,error:evidence.error}));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
