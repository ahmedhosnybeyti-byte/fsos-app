import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {ForbiddenException,NotFoundException} from "@nestjs/common";
import {WMS_OPERATION_PERMISSIONS,warehouseManagerPermissions} from "@field-sales-os/schemas";
import {wmsFixture,wmsPersistence,wmsUser} from "./wms-test-fixture";
import {WmsService} from "./wms.service";
import {WmsOperationsService} from "./wms-operations.service";
import {AuditLogService} from "../audit-log/audit-log.service";

const options={skip:process.env.RIE_TEST_PGLITE_MODULE?false:"Isolated PostgreSQL runtime required"};
async function fixture(t:any,stock="10",requested="7",productCount=1,Service= WmsOperationsService){
 const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!),db=new PGlite();t.after(()=>db.close());await wmsFixture(db);await db.exec(readFileSync("packages/database/sql/wms-complete-loading-functions.sql","utf8"));
 await db.exec(`ALTER TABLE companies ADD COLUMN feature_access jsonb DEFAULT '{"warehouse-core":"ENABLED"}';
 UPDATE company_operating_settings SET operating_mode='FULL_ERP';
 CREATE TABLE roles(id text PRIMARY KEY,code text);INSERT INTO roles VALUES('keeper','WAREHOUSE_KEEPER'),('rep','SALES_REP'),('manager','WAREHOUSE_MANAGER'),('setup','MANAGER');
 ALTER TABLE users ADD COLUMN role_id text;UPDATE users SET role_id=CASE WHEN id='clerk-a' THEN 'rep' ELSE 'keeper' END;
 UPDATE users SET email='rep@example.invalid' WHERE id='clerk-a';
 INSERT INTO users(id,company_id,full_name,email,role_id) VALUES('other-rep','a','Other','other@example.invalid','rep'),('rep-b','b','B','b@example.invalid','rep'),('manager-a','a','Review manager','manager@example.invalid','manager'),('setup-a','a','Fixture setup','setup@example.invalid','setup');
 INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('a','wa','actor-a'),('b','wb','actor-b'),('a','wa','manager-a'),('a','wa','setup-a');
 INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data) VALUES
 ('a','Branches','BR-05','{"BranchID":"BR-05","Status":"Active"}'),
 ('a','Employees','REP','{"Email":"rep@example.invalid","BranchID":"BR-05","Status":"Active"}'),
 ('a','Employees','OTHER','{"Email":"other@example.invalid","BranchID":"BR-05","Status":"Active"}');
 INSERT INTO wms_warehouse_branches(company_id,warehouse_id,branch_id) VALUES('a','wa','BR-05');`);
 const prisma=wmsPersistence(db),audit=new AuditLogService(prisma),core=new WmsService(prisma,audit),ops=new Service(prisma,core,audit);
 const keeper={...wmsUser("a","actor-a","WAREHOUSE_KEEPER"),permissions:[...new Set([...Object.values(WMS_OPERATION_PERMISSIONS),"sfa.access","wms.read","wms.products.manage","wms.opening.post"])]};
 const rep={...wmsUser("a","clerk-a","SALES_REP"),permissions:["sfa.access"]};
 const setup={...wmsUser("a","setup-a","MANAGER"),permissions:["sfa.access","wms.read","wms.products.manage","wms.opening.post"]};
 const manager={...wmsUser("a","manager-a","WAREHOUSE_MANAGER"),permissions:[...warehouseManagerPermissions]};
 const product=await core.saveProduct(setup,"wa",{code:"WATER",name:"Water",piecesPerCarton:12});
 await core.postOpening(setup,"wa",{productId:product.id,quantity:stock,unit:"CARTON",quarantined:false,reference:"SYNTHETIC",reason:"Isolated opening",idempotencyKey:randomUUID()});
 const lines=[{productCode:"WATER",quantity:requested,unit:"CARTON"}];
 for(let i=1;i<productCount;i++){
  const extra=await core.saveProduct(setup,"wa",{code:"WATER-"+i,name:"Water "+i,piecesPerCarton:12});
  await core.postOpening(setup,"wa",{productId:extra.id,quantity:stock,unit:"CARTON",quarantined:false,reference:"SYNTHETIC",reason:"Isolated opening",idempotencyKey:randomUUID()});
  lines.push({productCode:"WATER-"+i,quantity:requested,unit:"CARTON"});
 }
 const created=await ops.smartLoadingRequest(rep,"wa",{targetDate:"2098-01-01",lines,idempotencyKey:randomUUID(),proposalKey:randomUUID()});
 const doc=()=>ops.load(keeper,"wa",created.id);
 const step=async(operation:string,extra:any={})=>ops.command(["load.review","load.approve"].includes(operation)?manager:keeper,"wa",{operation,input:{id:created.id,version:(await doc()).version,note:"Isolated workflow action",idempotencyKey:randomUUID(),...extra}});
 const state=async()=>JSON.stringify((await db.query(`SELECT jsonb_build_object('stock',(SELECT jsonb_agg(to_jsonb(p)) FROM wms_positions p),'custody',(SELECT jsonb_agg(to_jsonb(c)) FROM wms_custody_positions c),'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM wms_movements m)) s`)).rows[0].s);
 const prepare=async(actualBase?:string)=>{await step("load.reserve");const d=await doc();await step("load.pick",{allocations:d.allocations.map(a=>({id:a.id,quantity:actualBase??a.reservedQuantity})),discrepancyReason:actualBase?"Prepared shortage reviewed":""});await step("load.review");await step("load.approve");};
 const decision=async(confirmed=true)=>ops.recipientDecision(rep,"wa",created.id,{version:(await doc()).version,confirmed,note:confirmed?"Reviewed actual quantities and consent":"Please prepare these quantities again",idempotencyKey:randomUUID()});
 return {db,prisma,audit,core,ops,keeper,rep,product,created,doc,step,state,prepare,decision};
}

test("handover: recipient reviews real shortage; dispatch and custody require consent and commit once together",options,async t=>{
 const f=await fixture(t);await f.prepare("48"); // 4 of 7 cartons, no physical deduction
 const detail=await f.ops.recipientLoad(f.rep,"wa",f.created.id);assert.equal(Number(detail.lines[0]!.requestedQuantity),84);assert.equal(Number(detail.lines[0]!.preparedQuantity),48);assert.equal(Number(detail.lines[0]!.shortageQuantity),36);
 assert.equal(detail.status,"APPROVED");assert.equal(detail.recipientConfirmed,false);
 const before=await f.state();await assert.rejects(f.step("load.dispatch"),/WMS_RECIPIENT_CONFIRMATION_REQUIRED/);assert.equal(await f.state(),before);
 const input={version:detail.version,confirmed:true,note:"Reviewed the four prepared cartons",idempotencyKey:randomUUID()};
 const consent=await f.ops.recipientDecision(f.rep,"wa",f.created.id,input);assert.equal(consent.recipientConfirmed,true);assert.equal(consent.status,"ACCEPTED");
 const posted=await f.state();assert.notEqual(posted,before);assert.deepEqual(await f.ops.recipientDecision(f.rep,"wa",f.created.id,input),consent);assert.equal(await f.state(),posted);
 const stock=(await f.db.query(`SELECT physical::text,reserved::text,in_transit::text FROM wms_positions`)).rows[0];assert.equal(Number(stock.physical),72);assert.equal(Number(stock.reserved),0);assert.equal(Number(stock.in_transit),0);
 assert.equal(Number((await f.db.query(`SELECT quantity::text FROM wms_custody_positions WHERE recipient_id='clerk-a'`)).rows[0].quantity),48);
 assert.equal((await f.db.query(`SELECT count(*)::int n FROM wms_movements WHERE kind='DISPATCH'`)).rows[0].n,1);
 assert.equal((await f.db.query(`SELECT actor_id FROM wms_operation_events WHERE operation='load.confirm'`)).rows[0].actor_id,"clerk-a");
});

test("handover: rejecting prepared quantities returns the same document to picking; old consent cannot dispatch",options,async t=>{
 const f=await fixture(t);await f.prepare();const beforeDecline=await f.state();
 const declined=await f.decision(false);assert.equal(declined.status,"RESERVED");assert.equal(await f.state(),beforeDecline);assert.equal((await f.doc()).status,"RESERVED");
 await f.step("load.pick",{allocations:(await f.doc()).allocations.map(a=>({id:a.id,quantity:a.reservedQuantity})),discrepancyReason:""});await f.step("load.review");await f.step("load.approve");
 const before=await f.state();await assert.rejects(f.step("load.dispatch"),/WMS_RECIPIENT_CONFIRMATION_REQUIRED/);assert.equal(await f.state(),before);
 assert.equal((await f.decision()).status,"ACCEPTED");
});

test("handover: ownership, company, role, state and version are checked; reps cannot dispatch and keepers cannot consent",options,async t=>{
 const f=await fixture(t);await f.prepare();
 const body={version:(await f.doc()).version,confirmed:true,note:"Actual reviewed handover",idempotencyKey:randomUUID()};
 await assert.rejects(f.ops.recipientLoads(f.keeper,{}),ForbiddenException);
 await assert.rejects(f.ops.recipientDecision(f.keeper,"wa",f.created.id,body),ForbiddenException);
 await assert.rejects(f.ops.recipientLoad({...f.rep,userId:"other-rep"},"wa",f.created.id),NotFoundException);
 await assert.rejects(f.ops.recipientDecision({...f.rep,userId:"other-rep"},"wa",f.created.id,body),/WMS_DOCUMENT_NOT_FOUND/);
 await assert.rejects(f.ops.recipientLoad({...f.rep,companyId:"b",userId:"rep-b"},"wa",f.created.id),NotFoundException);
 await assert.rejects(f.ops.recipientDecision(f.rep,"wa",f.created.id,{...body,version:1}),/WMS_DOCUMENT_STALE/);
 await assert.rejects(f.ops.recipientDecision(f.rep,"wa",f.created.id,{...body,recipientId:"actor-a"}));
 await assert.rejects(f.ops.command(f.rep,"wa",{operation:"load.dispatch",input:{id:f.created.id,version:body.version,note:"Rep cannot dispatch",idempotencyKey:randomUUID()}}),ForbiddenException);
 assert.equal((await f.ops.recipientLoads(f.rep,{})).items.length,1);
 for(const mode of ["SFA","ANALYSIS_ONLY"]){await f.db.query(`UPDATE company_operating_settings SET operating_mode=$1 WHERE company_id='a'`,[mode]);await assert.rejects(f.ops.recipientLoad(f.rep,"wa",f.created.id),ForbiddenException);}
});

test("handover: available partial stock can be prepared with a shortage reason; no empty shipment or silent shortage",options,async t=>{
 const f=await fixture(t,"5","7");await f.step("load.reserve");const d=await f.doc();assert.equal(Number(d.allocations[0]!.reservedQuantity),60);
 await assert.rejects(f.step("load.pick",{allocations:d.allocations.map(a=>({id:a.id,quantity:a.reservedQuantity})),discrepancyReason:""}),/WMS_DISCREPANCY_REASON_REQUIRED/);
 await f.step("load.pick",{allocations:d.allocations.map(a=>({id:a.id,quantity:a.reservedQuantity})),discrepancyReason:"Only five cartons available"});await f.step("load.review");await f.step("load.approve");
 assert.equal(Number((await f.ops.recipientLoad(f.rep,"wa",f.created.id)).lines[0]!.shortageQuantity),24);
 await f.decision();assert.equal(Number((await f.db.query(`SELECT quantity::text FROM wms_custody_positions`)).rows[0].quantity),60);
 const empty=await f.ops.smartLoadingRequest(f.rep,"wa",{targetDate:"2098-01-02",lines:[{productCode:"WATER",quantity:"1",unit:"CARTON"}],idempotencyKey:randomUUID(),proposalKey:randomUUID()});
 const before=await f.state();await assert.rejects(f.ops.command(f.keeper,"wa",{operation:"load.reserve",input:{id:empty.id,version:1,note:"No eligible stock left",idempotencyKey:randomUUID()}}),/WMS_INSUFFICIENT_STOCK/);assert.equal(await f.state(),before);
});

test("handover: acceptance audit failure rolls back dispatch, custody and command ledgers together",options,async t=>{
 const f=await fixture(t);await f.prepare();const before=await f.state();
 const ledger=async()=>JSON.stringify((await f.db.query(`SELECT (SELECT count(*) FROM wms_commands) commands,(SELECT count(*) FROM wms_operation_events) events,(SELECT count(*) FROM test_audit) audits`)).rows);
 const beforeLedger=await ledger();
 const record=f.audit.record.bind(f.audit);f.audit.record=async(input:any,tx:any)=>{if(input.action==="wms.load.accept")throw Error("Synthetic handover audit failure");return record(input,tx);};
 await assert.rejects(f.decision(),/Synthetic handover audit failure/);assert.equal(await f.state(),before);assert.equal((await f.doc()).status,"APPROVED");
 assert.equal(await ledger(),beforeLedger);
 f.audit.record=record;assert.equal((await f.decision()).status,"ACCEPTED");
});

for(const count of [20,1000])test("handover: rejecting all "+count+" products is replay-safe and leaves vehicle and warehouse balances unchanged",options,async t=>{
 const f=await fixture(t,"10","7",count);await f.prepare();const before=await f.state();
 const input={version:(await f.doc()).version,confirmed:false,note:"Reject all prepared products",idempotencyKey:randomUUID()};
 const result=await f.ops.recipientDecision(f.rep,"wa",f.created.id,input);
 assert.equal(result.status,"RESERVED");assert.deepEqual(await f.ops.recipientDecision(f.rep,"wa",f.created.id,input),result);
 assert.equal(await f.state(),before);assert.equal((await f.doc()).status,"RESERVED");
 assert.equal((await f.ops.recipientLoad(f.rep,"wa",f.created.id)).lines.length,count);
});

for(const productCount of [2,20,40,1000])test("handover: whole-load acceptance preserves all "+productCount+" products and posts once",options,async t=>{
 const f=await fixture(t,"10","7",productCount);await f.prepare();
 await f.db.exec(`INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data)
 SELECT 'a','Products',code,jsonb_build_object('Category',CASE WHEN code='WATER' THEN 'Water' ELSE 'Juice' END)
 FROM wms_products WHERE company_id='a'`);
 const detail=await f.ops.recipientLoad(f.rep,"wa",f.created.id);
 assert.equal(detail.lines.length,productCount);assert.equal(new Set(detail.lines.map(l=>l.productCode)).size,productCount);
 for(const line of detail.lines){assert.equal(Number(line.requestedQuantity),84);assert.equal(Number(line.preparedQuantity),84);assert.equal(line.category,line.productCode==='WATER'?'Water':'Juice');}
 const input={version:detail.version,confirmed:true,note:"Accept all prepared products",idempotencyKey:randomUUID()};
 const result=await f.ops.recipientDecision(f.rep,"wa",f.created.id,input);assert.equal(result.status,"ACCEPTED");
 assert.deepEqual(await f.ops.recipientDecision(f.rep,"wa",f.created.id,input),result);
 assert.equal((await f.doc()).status,"ACCEPTED");
 const custody=(await f.db.query("SELECT quantity::text FROM wms_custody_positions")).rows;
 assert.equal(custody.length,productCount);for(const row of custody)assert.equal(Number(row.quantity),84);
 await assert.rejects(f.ops.recipientDecision(f.rep,"wa",f.created.id,{...input,idempotencyKey:randomUUID()}),/WMS_INVALID_TRANSITION/);
 await assert.rejects(f.ops.recipientDecision(f.rep,"wa",f.created.id,{...input,lines:[]}));
});

function releaseService(){
 const Module=require('node:module'),path=require('node:path'),ts=require('typescript');
 function compile(relative:string,overrides:Record<string,unknown>={}){
  const filename=path.resolve(relative),loaded=new Module(filename,module);loaded.filename=filename;
  loaded.paths=Module._nodeModulePaths(path.dirname(filename));const original=loaded.require.bind(loaded);
  loaded.require=(name:string)=>name in overrides?overrides[name]:original(name);
  const source=readFileSync(path.resolve('recipient-decision-api-release-20261025',relative),'utf8');
  loaded._compile(ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,filename);
  return loaded.exports;
 }
 const core=compile('packages/schemas/src/wms-core.schemas.ts');
 const operations=compile('packages/schemas/src/wms-operations.schemas.ts',{'./wms-core.schemas':core});
 return compile('apps/api/src/modules/wms/wms-operations.service.ts',{'@field-sales-os/schemas':{...require('@field-sales-os/schemas'),...core,...operations}}).WmsOperationsService;
}

test('release package: all 83 fractional products reach warehouse; partial preparation, rejection and once-only custody preserve whole pieces',options,async t=>{
 const f=await fixture(t,'10','2.04',83,releaseService());
 const requested=await f.doc();assert.equal(requested.lines.length,83);
 for(const line of requested.lines){assert.equal(line.requestedBase,'25.000000');assert.equal(line.unit,'BASE');}
 assert.equal((await f.db.query('SELECT count(*)::int n FROM wms_allocations')).rows[0].n,0);
 assert.equal((await f.db.query('SELECT count(*)::int n FROM wms_custody_positions')).rows[0].n,0);
 await f.step('load.reserve');
 const reserved=await f.doc();
 const {loadingPickAllocations}=require(require('node:path').resolve('apps/web/src/components/wms/loading-pick-quantities.ts'));
 const drafts=Object.fromEntries(reserved.lines.map(line=>[line.productId,{cartons:'1',pieces:'8'}]));
 await f.step('load.pick',{allocations:loadingPickAllocations(reserved,drafts),discrepancyReason:'Twenty whole packs physically available'});
 await f.step('load.review');await f.step('load.approve');
 const detail=await f.ops.recipientLoad(f.rep,'wa',f.created.id);assert.equal(detail.lines.length,83);
 for(const line of detail.lines){assert.equal(Number(line.requestedQuantity),25);assert.equal(Number(line.preparedQuantity),20);assert.equal(Number(line.shortageQuantity),5);assert.equal(line.piecesPerCarton,12);}
 const beforeReject=await f.state();await f.decision(false);assert.equal(await f.state(),beforeReject);
 await f.step('load.pick',{allocations:(await f.doc()).allocations.map(a=>({id:a.id,quantity:'20'})),discrepancyReason:'Only twenty whole pieces prepared'});
 await f.step('load.review');await f.step('load.approve');
 const input={version:(await f.doc()).version,confirmed:true,note:'Accept every prepared whole piece',idempotencyKey:randomUUID()};
 const accepted=await f.ops.recipientDecision(f.rep,'wa',f.created.id,input);assert.equal(accepted.status,'ACCEPTED');
 const once=await f.state();assert.deepEqual(await f.ops.recipientDecision(f.rep,'wa',f.created.id,input),accepted);assert.equal(await f.state(),once);
 const custody=(await f.db.query('SELECT quantity::text FROM wms_custody_positions')).rows;
 assert.equal(custody.length,83);for(const row of custody)assert.equal(Number(row.quantity),20);
 const stocks=(await f.db.query('SELECT physical::text,reserved::text,in_transit::text FROM wms_positions')).rows;
 for(const row of stocks){assert.equal(Number(row.physical),100);assert.equal(Number(row.reserved),0);assert.equal(Number(row.in_transit),0);}
});
