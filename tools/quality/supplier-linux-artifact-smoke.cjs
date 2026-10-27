// Verification-only runner. No application migration, tenant data, or external service.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const root=process.cwd(),out=path.join(root,'.quality/linux-node22');fs.mkdirSync(out,{recursive:true});
assert.equal(process.platform,'linux');assert.equal(Number(process.versions.node.split('.')[0]),22);
const children=[],logs=[];let pgBin,pgData,startedPg=false;
function command(bin,args,options={}){const r=spawnSync(bin,args,{encoding:'utf8',timeout:30000,...options});if(r.status!==0)throw Error(path.basename(bin)+' failed (see local evidence)');return r.stdout?.trim();}
function start(file,args,options){const log=fs.openSync(path.join(out,file),'w');logs.push(log);const c=spawn(process.execPath,args,{...options,stdio:['ignore',log,log]});children.push(c);return c;}
async function ready(url,c,validate){for(let i=0;i<120;i++){if(c.exitCode!==null)throw Error('Artifact exited before readiness: '+url);try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.status===200){await validate(r);return 200;}}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Artifact readiness timeout: '+url);}
async function stop(c){if(c.exitCode!==null)return;c.kill('SIGTERM');await Promise.race([new Promise(r=>c.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);if(c.exitCode===null)c.kill('SIGKILL');}
(async()=>{
 try{
  const config=spawnSync('pg_config',['--bindir'],{encoding:'utf8'});const candidates=[config.stdout?.trim(),...fs.readdirSync('/usr/lib/postgresql').sort().reverse().map(v=>'/usr/lib/postgresql/'+v+'/bin')].filter(Boolean);
  pgBin=candidates.find(p=>fs.existsSync(path.join(p,'initdb'))&&fs.existsSync(path.join(p,'pg_ctl')));assert.ok(pgBin,'Existing runner PostgreSQL binaries required; no install fallback');
  pgData=fs.mkdtempSync(path.join(os.tmpdir(),'supplier-build-pg-'));
  command(path.join(pgBin,'initdb'),['-D',pgData,'--auth=trust','--username=ci','--no-locale']);
  command(path.join(pgBin,'pg_ctl'),['-D',pgData,'-l',path.join(out,'postgres.log'),'-o','-h 127.0.0.1 -p 54321 -k '+pgData,'-w','start']);startedPg=true;
  const preload=path.join(out,'startup-only.cjs');
  fs.writeFileSync(preload,`require(require.resolve('reflect-metadata',{paths:[process.cwd()]}));\nconst path=require('node:path');const base=path.join(process.cwd(),'dist/modules');\nfor(const [file,name,methods]of [['refresh-platform/refresh-worker.service.js','RefreshWorkerService',['onApplicationBootstrap','processNextQueuedRun']],['files/workbook-ingestion-worker.service.js','WorkbookIngestionWorkerService',['onApplicationBootstrap','processNextQueuedRun']],['erp-import/erp-import.worker.js','ErpImportWorker',['tick']]]){const type=require(path.join(base,file))[name];for(const method of methods)type.prototype[method]=async function(){};}\n`);
  const env={...process.env,NODE_ENV:'production',PORT:'54322',DATABASE_URL:'postgresql://ci@127.0.0.1:54321/postgres',API_URL:'http://127.0.0.1:54322',WEB_URL:'http://127.0.0.1:54323',CORS_ORIGINS:'http://127.0.0.1:54323',JWT_ACCESS_SECRET:'synthetic-ci-access-secret-only',JWT_REFRESH_SECRET:'synthetic-ci-refresh-secret-only',STORAGE_ENDPOINT:'http://127.0.0.1:1',STORAGE_REGION:'test',STORAGE_BUCKET:'test',STORAGE_ACCESS_KEY_ID:'synthetic',STORAGE_SECRET_ACCESS_KEY:'synthetic'};
  const api=start('api.log',['--require',preload,'dist/main.js'],{cwd:path.join(root,'apps/api'),env});
  const apiHealth=await ready('http://127.0.0.1:54322/health',api,async r=>assert.equal((await r.json()).status,'ok'));
  const apiReady=await ready('http://127.0.0.1:54322/health/ready',api,async r=>assert.equal((await r.json()).status,'ready'));
  // Verify the Linux Prisma engine actually queried the isolated empty PostgreSQL.
  const tables=command(path.join(pgBin,'psql'),['-X','-A','-t','-h','127.0.0.1','-p','54321','-U','ci','-d','postgres','-c',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]);
  assert.equal(Number(tables),0,'No application schema or migrations allowed');
  const standalone=path.join(root,'apps/web/.next/standalone'),webRoot=path.join(standalone,'apps/web');
  fs.cpSync(path.join(root,'apps/web/.next/static'),path.join(webRoot,'.next/static'),{recursive:true});
  fs.cpSync(path.join(root,'apps/web/public'),path.join(webRoot,'public'),{recursive:true});
  const web=start('web.log',[path.join(webRoot,'server.js')],{cwd:standalone,env:{...env,PORT:'54323',HOSTNAME:'127.0.0.1'}});
  let html='';const webPage=await ready('http://127.0.0.1:54323/sfa/warehouse',web,async r=>{html=await r.text();assert.ok(html.length>1000)});
  const suppliersPage=await ready('http://127.0.0.1:54323/sfa/warehouse/suppliers',web,async r=>assert.ok((await r.text()).length>1000));
  const bundle=html.match(/src="([^"]*\/_next\/static\/[^"]*\.js)"/);assert.ok(bundle,'Built static JS reference required');
  const staticResponse=await fetch(new URL(bundle[1],'http://127.0.0.1:54323'));assert.equal(staticResponse.status,200);assert.ok((await staticResponse.text()).length>50);
  const reply={status:'PASS',sha:process.env.GITHUB_SHA,candidate:'2f64b92cc92e9f4ffbe988c79d24274b4f5bbbc8',node:process.version,platform:process.platform,apiHealth,apiReady,webPage,suppliersPage,staticBundle:staticResponse.status,postgresVersion:command(path.join(pgBin,'postgres'),['--version']),applicationTables:0,migrations:false,productionAccess:false,capacityTests:false,scope:'Real compiled entrypoint, Linux Prisma engine/SELECT 1, standalone server/static JS. Queue bootstrap/interval workers disabled by CI-only preload; no business/authentication acceptance or exact Railway image claim.'};
  fs.writeFileSync(path.join(out,'smoke.json'),JSON.stringify(reply,null,2)+'\n');console.log(JSON.stringify(reply));
 }finally{for(const c of children.reverse())await stop(c);if(startedPg)command(path.join(pgBin,'pg_ctl'),['-D',pgData,'-m','fast','-w','stop']);for(const fd of logs)fs.closeSync(fd);}
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.message+'\n');console.error(e.message);process.exitCode=1});
