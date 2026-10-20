// Isolated local demo rehearsal only. Never reads .env or opens a network socket.
// Run from the official root: node tools/quality/company-demo.cjs
const fs=require('fs'),path=require('path'),{createRequire}=require('module');
if(process.cwd()!=='D:\\Field Sales OS')throw Error('Official workspace required');
const runtime=createRequire(path.resolve('packages/quality-gates/package.json')).resolve('@electric-sql/pglite');
require('./test-register.cjs');
const {PGlite}=require(runtime);
const {DEMO_COMPANY,importDemoDistribution,prepareDemoDistribution}=require('../../packages/database/prisma/demo-distribution.ts');
(async()=>{
 const folder='.quality/company-modes';fs.mkdirSync(folder,{recursive:true});
 const db=new PGlite(path.resolve(folder,'demo-pg'));
 try {
  await db.exec('CREATE TABLE IF NOT EXISTS local_demo_migrations(name text PRIMARY KEY)');
  const migrations='packages/database/prisma/migrations';
  for(const name of fs.readdirSync(migrations).sort())if(name!=='migration_lock.toml') {
   if((await db.query('SELECT name FROM local_demo_migrations WHERE name=$1',[name])).rows.length)continue;
   await db.exec(fs.readFileSync(`${migrations}/${name}/migration.sql`,'utf8'));
   await db.query('INSERT INTO local_demo_migrations VALUES($1)',[name]);
  }
  // These are isolated synthetic compatibility fixtures, never copies of real tenants.
  await db.exec(`INSERT INTO companies(id,name,slug,updated_at) VALUES ('egypt-fixture','Egypt synthetic fixture','egypt-fixture',now()),('saudi-fixture','Saudi synthetic fixture','saudi-fixture',now()) ON CONFLICT(id) DO NOTHING`);
  const bundle=prepareDemoDistribution();
  const first=await importDemoDistribution(db,bundle),second=await importDemoDistribution(db,bundle);
  if(second.status!=='UNCHANGED')throw Error('Idempotency failed');
  const counts=(await db.query('SELECT entity_name,count(*)::int rows FROM rie_canonical_entity_rows WHERE company_id=$1 GROUP BY entity_name ORDER BY entity_name',[DEMO_COMPANY.id])).rows;
  fs.writeFileSync(`${folder}/demo-bundle.json`,JSON.stringify(bundle,null,2));
  const result={status:'PASS',scope:'Isolated persistent PGlite only; not Production or customer DB',company:DEMO_COMPANY,first,second,counts,operationalPostings:0,openingStock:'DEFERRED: no validated opening stock source',accounting:'DEFERRED: no implemented general ledger'};
  fs.writeFileSync(`${folder}/demo-rehearsal.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
