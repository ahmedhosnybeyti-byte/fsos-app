import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {BadRequestException,ForbiddenException,NotFoundException} from "@nestjs/common";
import {WMS_OPERATION_PERMISSIONS} from "@field-sales-os/schemas";
import {wmsFixture,wmsPersistence,wmsUser} from "./wms-test-fixture";
import {WmsService} from "./wms.service";
import {WmsOperationsService} from "./wms-operations.service";
import {AuditLogService} from "../audit-log/audit-log.service";
import {SmartLoadingRequestsController} from "./smart-loading-requests.controller";
import {SFA_PERMISSIONS_KEY} from "../../common/decorators/requires-sfa.decorator";
import {COMPANY_SCREEN_KEY} from "../../common/decorators/company-screen.decorator";
import {SfaSetupService} from "../sfa-setup/sfa-setup.service";

const options={skip:process.env.RIE_TEST_PGLITE_MODULE?false:"Isolated PostgreSQL runtime required"};
const permissions=[...new Set([...Object.values(WMS_OPERATION_PERMISSIONS),"sfa.access","wms.read","wms.products.manage","wms.opening.post"])];
async function fixture(t:any){
 const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());await wmsFixture(db);
 await db.exec(`ALTER TABLE companies ADD COLUMN feature_access jsonb DEFAULT '{"warehouse-core":"ENABLED"}';
 UPDATE company_operating_settings SET operating_mode='FULL_ERP';
 CREATE TABLE roles(id text PRIMARY KEY,code text);INSERT INTO roles VALUES('keeper','WAREHOUSE_KEEPER'),('rep','SALES_REP'),('setup','MANAGER');
 ALTER TABLE users ADD COLUMN role_id text;UPDATE users SET role_id=CASE WHEN id='clerk-a' THEN 'rep' ELSE 'keeper' END;
 INSERT INTO users(id,company_id,full_name,role_id) VALUES('clerk-b','b','Rep B','rep'),('unassigned','a','Unassigned','rep'),('setup-a','a','Fixture setup A','setup'),('setup-b','b','Fixture setup B','setup');
 INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('a','wa','actor-a'),('a','wa','clerk-a'),('b','wb','actor-b'),('b','wb','clerk-b'),('a','wa','setup-a'),('b','wb','setup-b');`);
 const statements={count:0};
 const connection=(dbConnection:any)=>({query:(...args:any[])=>{statements.count++;return dbConnection.query(...args);}});
 const measuredDb={...connection(db),transaction:(work:any)=>db.transaction((tx:any)=>work(connection(tx)))};
 const prisma=wmsPersistence(measuredDb),audit=new AuditLogService(prisma),core=new WmsService(prisma,audit),ops=new WmsOperationsService(prisma,core,audit);
 const keeper=(company="a")=>({...wmsUser(company,`actor-${company}`,"WAREHOUSE_KEEPER"),permissions});
 const rep=(company="a")=>({...wmsUser(company,`clerk-${company}`,"SALES_REP"),permissions:["sfa.access"]});
 // Registry/opening setup is separate from the keeper and rep actors under test.
 const setup=(company="a")=>({...wmsUser(company,`setup-${company}`,"MANAGER"),permissions:["sfa.access","wms.read","wms.products.manage","wms.opening.post"]});
 const product=async(company="a",code="P-12")=>core.saveProduct(setup(company),`w${company}`,{code,name:code,piecesPerCarton:12,trackBatches:false,trackExpiry:false});
 const body=(quantity="2",code="P-12")=>({targetDate:"2098-01-01",lines:[{productCode:code,quantity,unit:"CARTON"}],idempotencyKey:randomUUID(),proposalKey:randomUUID()});
 const balances=async()=>((await db.query(`SELECT (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.company_id,p.warehouse_id,p.batch_id),'[]') FROM wms_positions p) positions,
 (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM wms_movements m) movements,
 (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM wms_allocations a) allocations,
 (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.company_id,c.warehouse_id,c.recipient_id,c.batch_id),'[]') FROM wms_custody_positions c) custody`)).rows);
 return {db,prisma,audit,core,ops,keeper,rep,setup,product,body,balances,statements};
}

test("Smart Loading request-only: assigned rep without warehouse permissions creates one real request, visible to keeper; stock/custody unchanged",options,async t=>{
 const f=await fixture(t),p=await f.product();
 await f.core.postOpening(f.setup(),"wa",{productId:p.id,quantity:"10",unit:"CARTON",quarantined:false,reference:"SYNTHETIC-OPEN",reason:"Synthetic opening stock",idempotencyKey:randomUUID()});
 const before=await f.balances(),body=f.body("2.5");
 const list=await f.core.loadingRequestWarehouses(f.rep(),{});assert.deepEqual(list.items.map(w=>w.id),["wa"]);assert.deepEqual(Object.keys(list.items[0]!).sort(),["code","id","name"]);
 const saved=await f.ops.smartLoadingRequest(f.rep(),"wa",body);assert.equal(saved.status,"REQUESTED");
 assert.deepEqual(await f.ops.smartLoadingRequest(f.rep(),"wa",body),saved);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",{...body,idempotencyKey:randomUUID(),proposalKey:randomUUID()}),/WMS_PROPOSAL_ALREADY_CONVERTED/);
 assert.ok((await f.ops.list(f.keeper(),"wa","load",{})).items.some(d=>d.id===saved.id&&d.source==="SMART_LOADING"&&d.status==="REQUESTED"));
 const document=await f.ops.load(f.keeper(),"wa",saved.id);assert.equal(document.lines[0]!.quantity,"30.000000");assert.equal(document.lines[0]!.requestedBase,"30.000000");assert.equal(document.recipientId,"clerk-a");
 assert.deepEqual((await f.db.query(`SELECT company_id,created_by,recipient_id FROM wms_load_requests WHERE id=$1`,[saved.id])).rows[0],{company_id:"a",created_by:"clerk-a",recipient_id:"clerk-a"});
 assert.deepEqual(await f.balances(),before);
 for(const read of [()=>f.core.products(f.rep(),"wa",{}),()=>f.core.summary(f.rep(),"wa",{}),()=>f.ops.list(f.rep(),"wa","load",{})])await assert.rejects(read(),ForbiddenException);
 for(const operation of ["load.reserve","load.review","load.approve","load.dispatch"]){
   await assert.rejects(f.ops.command(f.rep(),"wa",{operation,input:{id:saved.id,version:1,note:"Not authorized warehouse action",idempotencyKey:randomUUID()}}),ForbiddenException);
 }
});

test("Smart Loading request-only: same rule works for two FULL_ERP companies; tenant/user/warehouse assignments are enforced and revocation takes effect",options,async t=>{
 const f=await fixture(t);const body=f.body();const ids=[];
 for(const company of ["a","b"]){await f.product(company);ids.push((await f.ops.smartLoadingRequest(f.rep(company),`w${company}`,body)).id);}
 assert.notEqual(ids[0],ids[1]);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wb",f.body()),NotFoundException);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa2",f.body()),NotFoundException);
 const unassigned={...f.rep(),userId:"unassigned"};assert.equal((await f.core.loadingRequestWarehouses(unassigned,{})).items.length,0);
 await assert.rejects(f.ops.smartLoadingRequest(unassigned,"wa",f.body()),NotFoundException);
 await f.db.exec(`DELETE FROM wms_warehouse_access WHERE user_id='clerk-a'`);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body()),NotFoundException);
 assert.equal((await f.core.loadingRequestWarehouses(f.rep(),{})).items.length,0);
});

test("Smart Loading request-only: Analysis/SFA/default, disabled modules, missing SFA admission and non-reps cannot use the gateway",options,async t=>{
 const f=await fixture(t);await f.product();
 for(const mode of ["ANALYSIS_ONLY","SFA"]){
   await f.db.query(`UPDATE company_operating_settings SET operating_mode=$1 WHERE company_id='a'`,[mode]);
   await assert.rejects(f.core.loadingRequestWarehouses({...f.rep(),permissions},{}),ForbiddenException);
   await assert.rejects(f.ops.smartLoadingRequest({...f.rep(),permissions},"wa",f.body()),ForbiddenException);
   // The old authorized WMS path is unchanged by this new admission boundary.
   assert.equal((await f.core.products(f.keeper(),"wa",{})).items.length,1);
 }
 await f.db.exec(`DELETE FROM company_operating_settings WHERE company_id='a'`);await assert.rejects(f.core.loadingRequestWarehouses(f.rep(),{}),ForbiddenException);
 await f.db.exec(`INSERT INTO company_operating_settings VALUES('a','FULL_ERP')`);
 for(const feature of ["warehouse-core","smart-loading"]){
   await f.db.query(`UPDATE companies SET feature_access=jsonb_build_object('warehouse-core','ENABLED',$1::text,'HIDDEN') WHERE id='a'`,[feature]);
   await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body()),ForbiddenException);
 }
 await f.db.exec(`UPDATE companies SET feature_access='{"warehouse-core":"ENABLED"}' WHERE id='a'`);
 await assert.rejects(f.ops.smartLoadingRequest({...f.rep(),permissions:[]},"wa",f.body()),ForbiddenException);
 await assert.rejects(f.ops.smartLoadingRequest({...f.rep(),roleCode:"MANAGER",permissions},"wa",f.body()),ForbiddenException);
 assert.equal(Reflect.getMetadata(COMPANY_SCREEN_KEY,SmartLoadingRequestsController),"smart-loading");
 assert.deepEqual(Reflect.getMetadata(SFA_PERMISSIONS_KEY,SmartLoadingRequestsController),["sfa.access"]);
 assert.deepEqual(Reflect.getMetadata("roles",SmartLoadingRequestsController),["SALES_REP"]);
});

test("Smart Loading request-only: input cannot spoof operation/company/recipient; failed units/audit roll back both existing WMS documents",options,async t=>{
 const f=await fixture(t);await f.product();const before=await f.balances();
 for(const extra of [{recipientId:"actor-a"},{companyId:"b"},{operation:"load.dispatch"},{source:"MANUAL"}])await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",{...f.body(),...extra}),BadRequestException);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body("0")),BadRequestException);
 const fractional=await f.ops.smartLoadingRequest(f.rep(),"wa",f.body("2.04"));
 assert.equal((await f.ops.load(f.keeper(),"wa",fractional.id)).lines[0]!.requestedBase,"25.000000");
 const afterFraction=(await f.db.query(`SELECT (SELECT count(*) FROM wms_loading_proposals)::int proposals,(SELECT count(*) FROM wms_load_requests)::int loads,(SELECT count(*) FROM wms_commands)::int commands,(SELECT count(*) FROM test_audit)::int audits`)).rows[0];
 const record=f.audit.record.bind(f.audit);f.audit.record=async(input:any,tx:any)=>{if(input.action==="wms.load.create")throw Error("Synthetic request audit failure");return record(input,tx);};
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body()),/Synthetic request audit failure/);
 assert.deepEqual((await f.db.query(`SELECT (SELECT count(*) FROM wms_loading_proposals)::int proposals,(SELECT count(*) FROM wms_load_requests)::int loads,(SELECT count(*) FROM wms_commands)::int commands,(SELECT count(*) FROM test_audit)::int audits`)).rows[0],afterFraction);
 assert.deepEqual(await f.balances(),before);
});

test("Smart Loading request-only: warehouse results are bounded and SQL adapter calls stay constant at one versus twenty lines",options,async t=>{
 const f=await fixture(t);await f.product();
 for(let index=1;index<=21;index++)await f.db.query(`INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES($1,'a',$1,$1,now());`,[`extra-${String(index).padStart(2,'0')}`]);
 await f.db.exec(`INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) SELECT company_id,id,'clerk-a' FROM warehouses WHERE company_id='a' AND id LIKE 'extra-%'`);
 f.statements.count=0;const first=await f.core.loadingRequestWarehouses(f.rep(),{});assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.equal(f.statements.count,2);
 assert.equal((await f.core.loadingRequestWarehouses(f.rep(),{page:2})).items.length,2);
 f.statements.count=0;await f.ops.smartLoadingRequest(f.rep(),"wa",f.body());const one=f.statements.count;
 const lines=[];for(let index=0;index<20;index++){const code=`MAX-${index}`;await f.product("a",code);lines.push({productCode:code,quantity:"1",unit:"CARTON"});}
 f.statements.count=0;await f.ops.smartLoadingRequest(f.rep(),"wa",{...f.body(),lines});assert.equal(f.statements.count,one);assert.equal(one,9);
 // Counts are actual adapter SQL calls. PGlite's transaction boundaries and
 // internal PL/pgSQL statements are not adapter calls or end-to-end HTTP counts.
 t.diagnostic(`warehouse SQL adapter calls=2; request calls=${one} at 1 and 20 lines; internal WMS SQL and auth queries excluded`);
});

// Isolated fixtures only: the official BranchIDs match the read-only discovery
// of the existing demo company's data. No live warehouse/branch/stock is made.
async function branchFixture(t:any){
 const f=await fixture(t),setup=new SfaSetupService(f.prisma,f.audit);
 for(const company of ["a","b"]){
   for(const branch of ["BR-05","BR-06","BR-07","BR-01"])
     await f.db.query(`INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data) VALUES($1,'Branches',$2,$3)`,
       [company,branch,JSON.stringify({BranchID:branch,BranchName:`Fixture ${branch}`,Status:"Active"})]);
   await f.db.query(`UPDATE users SET email=$1 WHERE company_id=$2 AND id=$3`,[`rep-${company}@example.invalid`,company,`clerk-${company}`]);
   await f.db.query(`INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data) VALUES($1,'Employees','REP',$2)`,
     [company,JSON.stringify({EmployeeID:"REP",Email:`rep-${company}@example.invalid`,Role:"Sales Rep",BranchID:"BR-05",Status:"Active"})]);
 }
 await f.db.exec(`DELETE FROM wms_warehouse_access WHERE user_id IN ('clerk-a','clerk-b')`);
 const link=(company="a",branchIds=["BR-05","BR-06","BR-07"])=>setup.setBranches(company,`w${company}`,{branchIds},`actor-${company}`);
 await link();
 return {...f,setup,link};
}

test("branch routing: reps in all three served branches send to the same existing warehouse; keeper receives; no user grants or balance changes",options,async t=>{
 const f=await branchFixture(t);await f.product();
 const before=await f.balances();
 const grants=(await f.db.query(`SELECT * FROM wms_warehouse_access ORDER BY company_id,warehouse_id,user_id`)).rows;
 for(const [index,branch] of ["BR-05","BR-06","BR-07"].entries()){
   await f.db.query(`UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{BranchID}',to_jsonb($1::text)) WHERE company_id='a' AND entity_name='Employees'`,[branch]);
   const list=await f.core.loadingRequestWarehouses(f.rep(),{});assert.deepEqual(list.items.map(w=>w.id),["wa"]);
   const body=f.body(String(index+1)),saved=await f.ops.smartLoadingRequest(f.rep(),"wa",body);
   assert.equal(saved.status,"REQUESTED");assert.deepEqual(await f.ops.smartLoadingRequest(f.rep(),"wa",body),saved);
   assert.ok((await f.ops.list(f.keeper(),"wa","load",{})).items.some(row=>row.id===saved.id&&row.status==="REQUESTED"));
   assert.equal((await f.ops.load(f.keeper(),"wa",saved.id)).recipientId,"clerk-a");
   await assert.rejects(f.ops.command(f.rep(),"wa",{operation:"load.dispatch",input:{id:saved.id,version:1,note:"Rep cannot dispatch",idempotencyKey:randomUUID()}}),ForbiddenException);
 }
 assert.deepEqual((await f.db.query(`SELECT * FROM wms_warehouse_access ORDER BY company_id,warehouse_id,user_id`)).rows,grants);
 assert.deepEqual(await f.balances(),before);
 assert.equal((await f.db.query(`SELECT count(*)::int n FROM warehouses`)).rows[0].n,3); // pre-existing isolated fixture
 assert.equal((await f.db.query(`SELECT count(*)::int n FROM wms_load_requests`)).rows[0].n,3);
 for(const read of [()=>f.core.products(f.rep(),"wa",{}),()=>f.ops.list(f.rep(),"wa","load",{})])await assert.rejects(read(),ForbiddenException);
 // A later employee inherits only request routing, without any user grant.
 await f.db.exec(`INSERT INTO users(id,company_id,full_name,email,role_id) VALUES('new-rep','a','New rep','new@example.invalid','rep');
 INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data) VALUES('a','Employees','NEW','{"EmployeeID":"NEW","Email":" NEW@example.invalid ","Status":"Active","BranchID":"BR-06"}')`);
 assert.deepEqual((await f.core.loadingRequestWarehouses({...f.rep(),userId:"new-rep"},{})).items.map(w=>w.id),["wa"]);
 await f.link("a",[]);
 assert.equal((await f.core.loadingRequestWarehouses(f.rep(),{})).items.length,0);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body("4")),NotFoundException);
});

test("branch routing: generic tenant isolation, branch/employee revocation and ambiguous identity fail closed",options,async t=>{
 const f=await branchFixture(t);await f.product();await f.product("b");await f.link("b");
 assert.deepEqual((await f.core.loadingRequestWarehouses(f.rep("b"),{})).items.map(w=>w.id),["wb"]);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wb",f.body()),NotFoundException);
 await f.link("b",[]);assert.equal((await f.core.loadingRequestWarehouses(f.rep("b"),{})).items.length,0);
 await f.db.exec(`UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{BranchID}','"BR-01"') WHERE company_id='a' AND entity_name='Employees'`);
 assert.equal((await f.core.loadingRequestWarehouses(f.rep(),{})).items.length,0);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body()),NotFoundException);
 await f.db.exec(`UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{BranchID}','"BR-05"') WHERE company_id='a' AND entity_name='Employees';
 INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data) SELECT company_id,entity_name,'DUPLICATE',data FROM rie_canonical_entity_rows WHERE company_id='a' AND entity_name='Employees'`);
 assert.equal((await f.core.loadingRequestWarehouses(f.rep(),{})).items.length,0);
 await f.db.exec(`DELETE FROM rie_canonical_entity_rows WHERE entity_key='DUPLICATE';UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{Status}','"Inactive"') WHERE company_id='a' AND entity_name='Branches' AND entity_key='BR-05'`);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body()),NotFoundException);
 await f.db.exec(`UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{Status}','"Active"') WHERE company_id='a' AND entity_name='Branches';UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{Status}','"Inactive"') WHERE company_id='a' AND entity_name='Employees'`);
 await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body()),NotFoundException);
 await f.db.exec(`UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{Status}','"Active"') WHERE company_id='a' AND entity_name='Employees';
 DELETE FROM rie_canonical_entity_rows WHERE company_id='a' AND entity_name='Branches' AND entity_key='BR-05'`);
 assert.equal((await f.core.loadingRequestWarehouses(f.rep(),{})).items.length,0);
 await f.db.exec(`INSERT INTO rie_canonical_entity_rows(company_id,entity_name,entity_key,data) VALUES('a','Branches','NEW-STORAGE-KEY','{"BranchID":"BR-05","Status":"Active"}')`);
 assert.deepEqual((await f.core.loadingRequestWarehouses(f.rep(),{})).items.map(w=>w.id),["wa"]);
});

test("branch configuration: real current company IDs only, FULL_ERP only, atomic audit rollback and no arbitrary names/tenants",options,async t=>{
 const f=await branchFixture(t),before=await f.balances();
 await assert.rejects(f.link("a",["جدة"]),NotFoundException);
 await assert.rejects(f.setup.setBranches("b","wa",{branchIds:["BR-05"]},"actor-b"),NotFoundException);
 await assert.rejects(f.setup.setBranches("a","wa",{branchIds:["BR-05"],companyId:"b"},"actor-a"));
 await assert.rejects(f.link("a",["BR-05","BR-05"]));
 for(const mode of ["SFA","ANALYSIS_ONLY"]){
   await f.db.query(`UPDATE company_operating_settings SET operating_mode=$1 WHERE company_id='a'`,[mode]);
   await assert.rejects(f.link(),ForbiddenException);
   await assert.rejects(f.ops.smartLoadingRequest(f.rep(),"wa",f.body()),ForbiddenException);
 }
 await f.db.exec(`UPDATE company_operating_settings SET operating_mode='FULL_ERP' WHERE company_id='a'`);
 const links=()=>f.db.query(`SELECT * FROM wms_warehouse_branches ORDER BY company_id,warehouse_id,branch_id`);
 const original=(await links()).rows;
 f.audit.record=async()=>{throw Error("Synthetic configuration audit failure");};
 await assert.rejects(f.link("a",[]),/Synthetic configuration audit failure/);
 assert.deepEqual((await links()).rows,original);assert.deepEqual(await f.balances(),before);
});
