// Explicit opt-in native PostgreSQL evidence. No inherited endpoint/credentials.
// Usage: node tools/quality/wms-phase02-native.cjs <psql.exe> <test-database> <test-data-directory> [--upgrade]
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFile}=require('node:child_process'),{randomUUID}=require('node:crypto');
const [psql,database,dataDirectory,upgrade]=process.argv.slice(2);
if(process.cwd()!=='D:\\Field Sales OS'||!/^wms_phase0[12]_[a-f0-9]{32}$/.test(database??''))throw Error('Explicit isolated WMS fixture required');
const expected=path.resolve('.quality/wms/pgdata');if(path.resolve(dataDirectory??'').toLowerCase()!==expected.toLowerCase())throw Error('Unexpected test cluster');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PATHEXT)$/i.test(k)));
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
async function sql(query){return new Promise((resolve,reject)=>{const child=execFile(psql,['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55561','-U','wms_test','-d',database],{env,maxBuffer:8*1024*1024},(error,out,err)=>error?reject(Error(err||error.message)):resolve(out.trim()));child.stdin.end(query);});}
async function json(query){return JSON.parse(await sql(query));}
const checks=[],prefix='NATIVE-'+randomUUID().replaceAll('-','').slice(0,20).toUpperCase(),company='a',warehouse='wa',actor='actor-a',recipient='clerk-a';
async function execute(op,input,{key=randomUUID(),user=actor,fail=false}={}){
  const event=randomUUID(),id=randomUUID();
  const out=await sql(`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s';
    CREATE TEMP TABLE result ON COMMIT DROP AS SELECT wms_execute(${quote(company)},${quote(warehouse)},${quote(op)},${quote(JSON.stringify(input))}::jsonb,${quote(user)},${quote(key)},${quote(id)}) AS r;
    INSERT INTO audit_logs(id,company_id,user_id,action,entity_type,entity_id,event_key) SELECT ${quote(event)},${quote(company)},${quote(user)},${quote('wms.'+op)},'WmsNativeTest',r->>'id','wms:a:'||(r->>'eventId') FROM result ON CONFLICT(event_key) DO NOTHING;
    SELECT r FROM result; SELECT pg_sleep(0.15); ${fail?'SELECT 1/0;':''} COMMIT;`);
  return JSON.parse(out.split('\n').find(l=>l.startsWith('{')));
}
async function detail(id){return json(`SELECT row_to_json(d) FROM wms_load_requests d WHERE company_id='a' AND id=${quote(id)}`);}
async function step(op,id,extra={},opts={}){const d=await detail(id);return execute(op,{id,version:d.version,note:'Verified native transaction',...extra},opts);}
async function create(p,q='10'){return execute('load.create',{reference:prefix+randomUUID(),source:'SMART_LOADING',recipientId:recipient,customerCode:null,targetDate:new Date().toISOString().slice(0,10),lines:[{productId:p,quantity:q,unit:'BASE'}],note:'Native isolated fixture'});}
async function main(){
  assert.equal(path.resolve(await sql('SHOW data_directory')).toLowerCase(),expected.toLowerCase());
  assert.equal(await sql("SELECT count(*) FROM companies WHERE id IN ('a','b')"),'2');
  assert.equal(await sql("SELECT count(*) FROM users WHERE id IN ('actor-a','clerk-a') AND company_id='a'"),'2');
  const before=await sql("SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY company_id,warehouse_id,batch_id)::text,'')) FROM wms_positions p");
  const grants=await sql('SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY role_id,permission_id)::text,\'\')) FROM role_permissions r');
  if(await sql("SELECT to_regclass('wms_receipts') IS NULL")==='t'){
    if(upgrade!=='--upgrade')throw Error('Fixture requires explicit --upgrade');
    await sql(fs.readFileSync('packages/database/prisma/migrations/20261020150000_wms_phase02/migration.sql','utf8'));
    assert.equal(await sql("SELECT md5(coalesce(jsonb_agg(to_jsonb(p)-'in_transit' ORDER BY company_id,warehouse_id,batch_id)::text,'')) FROM wms_positions p"),before);
    assert.equal(await sql('SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY role_id,permission_id)::text,\'\')) FROM role_permissions r'),grants);
    checks.push('Additive upgrade preserves all existing positions and permission grants');
  }
  const p=randomUUID();await sql(`INSERT INTO wms_products(id,company_id,code,name,base_unit,pieces_per_carton,track_batches,track_expiry) VALUES(${quote(p)},'a',${quote(prefix)},'Native test product','PIECE',12,true,true)`);
  const r=await execute('receipt.create',{reference:prefix,supplierName:'Synthetic native supplier',supplierReference:prefix,lines:[{productId:p,batchCode:prefix,productionDate:'2026-01-01',expiryDate:'2099-01-01',unit:'CARTON',expectedQuantity:'1',acceptedQuantity:'1',quarantinedQuantity:'0',rejectedQuantity:'0',rejectionReason:''}],note:'Isolated receiving fixture'});
  let version=1;for(const op of ['receipt.submit','receipt.review'])await execute(op,{id:r.id,version:version++,note:'Review native receipt'});
  const approval={id:r.id,version,note:'Approve actual counts'},key=randomUUID();
  const approvals=await Promise.all([execute('receipt.approve',approval,{key}),execute('receipt.approve',approval,{key})]);assert.deepEqual(approvals[0],approvals[1]);
  assert.equal(await sql(`SELECT count(*) FROM wms_movements WHERE company_id='a' AND event_id=${quote(approvals[0].eventId)}`),'1');
  assert.equal(await sql(`SELECT count(*) FROM audit_logs WHERE event_key=${quote('wms:a:'+approvals[0].eventId)}`),'1');checks.push('Concurrent identical receiving approval posts exactly one movement and audit');
  const one=await create(p),two=await create(p);const raced=await Promise.allSettled([step('load.reserve',one.id),step('load.reserve',two.id)]);
  assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);assert.match(raced.find(x=>x.status==='rejected').reason.message,/WMS_INSUFFICIENT_STOCK/);
  assert.equal(await sql(`SELECT sum(reserved)::text FROM wms_positions s JOIN wms_batches b ON b.company_id=s.company_id AND b.id=s.batch_id WHERE b.product_id=${quote(p)}`),'10.000000');checks.push('Independent concurrent requests cannot reserve beyond available stock');
  const winner=raced[0].status==='fulfilled'?one.id:two.id;const allocations=await json(`SELECT jsonb_agg(jsonb_build_object('id',id,'quantity','8')) FROM wms_allocations WHERE company_id='a' AND load_id=${quote(winner)}`);
  await step('load.pick',winner,{allocations,discrepancyReason:'Two pieces not picked'});await step('load.review',winner);await step('load.approve',winner);
  const d=await detail(winner),dispatch={id:winner,version:d.version,note:'Physical native dispatch'};const dispatchKey=randomUUID();
  const posts=await Promise.all([execute('load.dispatch',dispatch,{key:dispatchKey}),execute('load.dispatch',dispatch,{key:dispatchKey})]);assert.deepEqual(posts[0],posts[1]);
  assert.equal(await sql(`SELECT count(*) FROM wms_custody_positions WHERE batch_id IN(SELECT id FROM wms_batches WHERE product_id=${quote(p)})`),'0');
  await assert.rejects(step('load.dispatch',winner),/WMS_INVALID_TRANSITION/);checks.push('Picking shortage releases surplus; concurrent dispatch posts once and creates no accepted custody');
  const transit=await detail(winner),accept={id:winner,version:transit.version,note:'Recipient physically accepts'},acceptKey=randomUUID();
  const accepts=await Promise.all([execute('load.accept',accept,{key:acceptKey,user:recipient}),execute('load.accept',accept,{key:acceptKey,user:recipient})]);assert.deepEqual(accepts[0],accepts[1]);
  assert.equal(await sql(`SELECT sum(quantity)::text FROM wms_custody_positions WHERE batch_id IN(SELECT id FROM wms_batches WHERE product_id=${quote(p)})`),'8.000000');checks.push('Concurrent recipient acceptance transfers custody exactly once');
  const rollback=await create(p,'2');await assert.rejects(step('load.reserve',rollback.id,{}, {fail:true}),/division by zero/);assert.equal((await detail(rollback.id)).status,'REQUESTED');assert.equal(await sql(`SELECT count(*) FROM wms_allocations WHERE load_id=${quote(rollback.id)}`),'0');checks.push('Failure after stock posting rolls back reservation, document, command, event and audit');
  await step('load.reserve',rollback.id);const cancelDoc=await detail(rollback.id),cancelInput={id:rollback.id,version:cancelDoc.version,note:'Cancel actual reservation'};
  const cancelRace=await Promise.allSettled([execute('load.cancel',cancelInput),execute('load.cancel',cancelInput)]);assert.equal(cancelRace.filter(x=>x.status==='fulfilled').length,1);assert.match(cancelRace.find(x=>x.status==='rejected').reason.message,/WMS_DOCUMENT_STALE/);checks.push('Competing cancellation keys release once with optimistic version conflict');
  const plan=await json(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM wms_fefo('a','wa',${quote(p)},1,CURRENT_DATE,0)`);
  const result={database,postgres:await sql('SELECT version()'),checks,fefoPlan:plan};fs.mkdirSync('.quality/wms-phase02',{recursive:true});fs.writeFileSync('.quality/wms-phase02/native-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({database,checks},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
