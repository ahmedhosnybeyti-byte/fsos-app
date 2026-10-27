import assert from "node:assert/strict";
import test from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { Prisma } from "@field-sales-os/database";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { RieExecutionCoordinatorService } from "./rie-execution-coordinator.service";
import { RieRequestPlannerService } from "./rie-request-planner.service";
import { RieScalableQueryService } from "./scalable-query.service";
import { RieFacade } from "./rie-facade.service";
import { SmartLoadingService } from "../smart-loading/smart-loading.service";
import { LostOpportunityService } from "../lost-opportunity/lost-opportunity.service";
import { ENTITY_DATASET_TYPE_MAP } from "./excel-entity-provider.mapping";
import { demoCacheFixture } from "./demo-cache-test-fixture";

// Entire getSession path, including the real hierarchy fallback, planner,
// coordinator, facade, lost opportunities, SQL and persistent cache tables.
// Only Prisma transport is adapted to the existing isolated PostgreSQL runtime.
test("complete Demo cold session respects the unchanged PostgreSQL budget", async t => {
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-10-25T12:00:00Z")});
  const variant=process.env.RIE_REPLAY_VARIANT??"fixed";
  process.env.RIE_DEMO_CANONICAL_COMPANY_ID="demo";
  t.after(()=>delete process.env.RIE_DEMO_CANONICAL_COMPANY_ID);
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE);
  const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE company_operating_settings(company_id text PRIMARY KEY,operating_mode text);
    CREATE TABLE files(id text PRIMARY KEY,company_id text,dataset_type text,created_at timestamptz DEFAULT now());
    CREATE TABLE rie_dataset_versions(id text PRIMARY KEY,company_id text,entity_name text,source_file_id text,is_active boolean DEFAULT true,updated_at timestamptz DEFAULT '2026-10-25T00:00:00Z');
    CREATE TABLE rie_canonical_entity_rows(id text PRIMARY KEY,company_id text,entity_name text,entity_key text,source_file_id text,data jsonb,precedence bigint DEFAULT 1,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT '2026-10-25T00:00:00Z');
    CREATE INDEX ON rie_canonical_entity_rows(company_id,entity_name);
    CREATE TABLE wms_products(id text PRIMARY KEY,company_id text,code text,name text);
    INSERT INTO company_operating_settings VALUES('demo','FULL_ERP'),('real','FULL_ERP'),('analysis','ANALYSIS_ONLY');`);
  const cache=await demoCacheFixture(db);
  await db.exec("INSERT INTO companies(id) VALUES('analysis')");
  const entities=["Routes","Employees","Customers","Products","Van Inventory","Invoices","Invoice Items","Returns","Return Items"];
  let seq=0;
  for(const company of ["demo","real","analysis"]) for(const entity of entities){
    const id=`${company}-${entity}`;
    await db.query("INSERT INTO files(id,company_id,dataset_type) VALUES($1,$2,$3)",[id,company,ENTITY_DATASET_TYPE_MAP[entity]!.datasetType]);
    await db.query("INSERT INTO rie_dataset_versions(id,company_id,entity_name,source_file_id) VALUES($1,$2,$3,$1)",[id,company,entity]);
  }
  const insert=async(company:string,entity:string,data:object)=>{
    const id=String(++seq);await db.query("INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,source_file_id,data) VALUES($1,$2,$3,$1,$4,$5)",[id,company,entity,`${company}-${entity}`,JSON.stringify(data)]);
  };
  for(const company of ["demo","real","analysis"]){
    for(const [route,email,employee] of [["R1","rep@example.invalid","E1"],["SECRET","other@example.invalid","E2"]]){
      await insert(company,"Routes",{RouteID:route,SalesRepID:employee});
      await insert(company,"Employees",{EmployeeID:employee,Email:email,EmployeeName:employee,HireDate:"2025-01-01"});
      await insert(company,"Customers",{CustomerCode:route,CustomerName:route,RouteID:route,VisitDay:"Monday"});
      for(const product of ["P1","P2"]){
        await insert(company,"Van Inventory",{ReportDate:"2026-09-30",RouteID:route,ProductCode:product,Quantity:2,Unit:"CARTON"});
        await insert(company,"Van Inventory",{ReportDate:"2026-10-26",RouteID:route,ProductCode:product,Quantity:4,Unit:"CARTON"});
        await insert(company,"Van Inventory",{ReportDate:"2026-10-31",RouteID:route,ProductCode:product,Quantity:900,Unit:"CARTON"});
        const invoice=`${route}-${product}`;
        await insert(company,"Invoices",{InvoiceNo:invoice,InvoiceDate:product==="P1"?"2026-09-01":"2026-10-25",InvoiceStatus:"Confirmed",RouteID:route,CustomerCode:route});
        await insert(company,"Invoice Items",{InvoiceNo:invoice,RouteID:route,ProductCode:product,Quantity:30,LineTotal:300});
      }
      await insert(company,"Invoices",{InvoiceNo:`future-${route}`,InvoiceDate:"2026-10-26",InvoiceStatus:"Confirmed",RouteID:route,CustomerCode:route});
      await insert(company,"Invoice Items",{InvoiceNo:`future-${route}`,RouteID:route,ProductCode:"P2",Quantity:2000,LineTotal:20000});
    }
    for(const product of ["P1","P2"])await insert(company,"Products",{ProductCode:product,ProductName:product,Category:"synthetic"});
  }
  const boundary=new AsyncLocalStorage<string>();
  let trace:{operation:string;path:string;admitted:boolean}[]=[], sqlPaths:string[]=[];
  const engineQuery=db.query.bind(db);
  db.query=(sql:string,values:any[]=[])=>{
    sqlPaths.push(boundary.getStore()??"cache/metadata (outside RIE admission)");
    return engineQuery(sql,values);
  };
  class TracedCoordinator extends RieExecutionCoordinatorService {
    override execute<T>(operation:string,execute:()=>Promise<T>,options:any={}):Promise<T>{
      const row={operation,path:boundary.getStore()??operation,admitted:false};trace.push(row);
      return super.execute(operation,()=>{row.admitted=true;return boundary.run(row.path,execute);},options);
    }
  }
  const coordinator=new TracedCoordinator(), planner=new RieRequestPlannerService(coordinator);
  const run=async(sql:string,values:any[]=[])=> (await db.query(sql,values)).rows;
  const prisma:any={...cache.prisma,
    user:{findFirst:async({where}:any)=>(await run('SELECT $1::text AS id',[`${where.companyId}:${where.email}`]))[0]},
    userRouteAssignment:{findFirst:async()=>{await run('SELECT NULL WHERE FALSE');return null;}},
    file:{findMany:async({where}:any)=>run('SELECT id,dataset_type AS "datasetType" FROM files WHERE company_id=$1 ORDER BY created_at DESC',[where.companyId])},
    rieDatasetVersion:{findMany:async({where}:any)=>{
      const names=where.entityName?.in??(where.entityName?[where.entityName]:entities);
      return (await run('SELECT id,entity_name AS "entityName",source_file_id AS "sourceFileId",updated_at AS "updatedAt" FROM rie_dataset_versions WHERE company_id=$1 AND entity_name=ANY($2) AND is_active AND ($3::text[] IS NULL OR source_file_id=ANY($3)) ORDER BY entity_name,id',[where.companyId,names,where.sourceFileId?.in??null])).map((r:any)=>({...r,updatedAt:new Date(r.updatedAt)}));
    }},
    rieCanonicalEntityRow:{
      findFirst:async({where}:any)=>{const r=(await run('SELECT max(updated_at) AS "updatedAt" FROM rie_canonical_entity_rows WHERE company_id=$1 AND entity_name=ANY($2)',[where.companyId,where.entityName.in]))[0];return r?.updatedAt?{updatedAt:new Date(r.updatedAt)}:null;},
      findMany:async({where}:any)=>run('SELECT r.data FROM rie_canonical_entity_rows r JOIN files f ON f.id=r.source_file_id WHERE r.company_id=$1 AND r.entity_name=$2 AND r.source_file_id=ANY($3) ORDER BY f.created_at DESC,r.created_at,r.id',[where.companyId,where.entityName,where.sourceFileId.in]),
    },
    $queryRaw:async(sql:Prisma.Sql)=>run(sql.text,sql.values),
  };
  const hierarchy=new CanonicalHierarchyResolverService(prisma,planner,coordinator);
  const fetchEntity=(hierarchy as any).fetchRawEntityRows.bind(hierarchy);
  (hierarchy as any).fetchRawEntityRows=(entity:string,company:string)=>boundary.run(`hierarchy/${entity}`,()=>fetchEntity(entity,company));
  class TracedQuery extends RieScalableQueryService {
    override query(input:any){
      const dates=input.scope?.date;
      const path=`query.sql/${input.entityName}/${input.aggregates?.map((a:any)=>a.as).join(",")??"labels"}${dates?`/date:${dates.from??"*"}..${dates.to??"*"}`:""}`;
      return boundary.run(path,()=>super.query(input));
    }
  }
  const query=new TracedQuery(prisma,hierarchy,planner,coordinator);
  const facade=new RieFacade({} as never,{} as never,{} as never,{} as never,{} as never,prisma,
    {listConfirmedActiveForCompany:(companyId:string)=>prisma.file.findMany({where:{companyId}})} as never,hierarchy,query,undefined,planner,coordinator);
  const service=new SmartLoadingService(facade,new LostOpportunityService(facade),prisma,hierarchy,{} as never);
  const actor={companyId:"demo",roleCode:"SALES_REP",email:"rep@example.invalid",userId:"rep",orgUnitId:null,permissions:["smart_loading.view"]};
  const results:any[]=[];
  async function request(name:string,user=actor,targetDate="2026-10-26"){
    trace=[];sqlPaths=[];
    const start=performance.now();let response:any,error:any;
    try{response=await service.getSession(user as never,targetDate,4);}catch(e){error=e;}
    const row={name,admitted:trace.filter(x=>x.admitted).length,attempts:trace.length,sqlExecutions:sqlPaths.length,trace:[...trace],sqlPaths:[...sqlPaths],durationMs:performance.now()-start,error:error?.name??null,responseHash:response?createHash("sha256").update(JSON.stringify(response)).digest("hex"):null};
    results.push(row);return {response,error,row};
  }
  const first=await request("cold");
  if(variant==="before"){
    assert.equal(first.error?.name,"RiePostgresExecutionBudgetExceededError");
    assert.equal(first.row.admitted,24);assert.equal(first.row.attempts,25);
    assert.equal(first.row.trace.at(-1)?.path,"query.sql/Van Inventory/quantity");
  } else {
    assert.ifError(first.error);assert.equal(first.response.state,"ready");
    assert.ok(first.row.admitted<=24);
    if(variant==="fixed"){
      assert.equal(first.response.products.find((p:any)=>p.productCode==="P1").currentVehicleStock,2);
      assert.equal(first.response.lostOpportunities.length,1);
      assert.ok(first.response.products.every((p:any)=>p.lastSaleDate<="2026-10-25"));
      assert.equal(first.row.trace.filter(x=>x.operation==="hierarchy.files").length,1);
      assert.equal(first.row.admitted,24);assert.equal(first.row.attempts,24);
    }
  }
  const repeat=await request("repeated");assert.ifError(repeat.error);assert.equal(repeat.response.state,"ready");
  if(variant==="fixed"){
    assert.deepEqual(repeat.response,first.response);
    assert.ok(repeat.row.admitted<first.row.admitted);
    assert.equal(repeat.row.admitted,21);
    assert.equal(repeat.row.trace.filter(x=>x.operation==="hierarchy.files").length,1);
    assert.equal(repeat.row.trace.filter(x=>x.path.includes("lastSaleDate")).length,0);
    // Keep exactly the same still-valid target (next Monday) across midnight;
    // the day-bound cache context, rather than a changed target key, must miss.
    const future=await request("before-midnight-same-target",actor,"2026-11-02");assert.ifError(future.error);
    t.mock.timers.setTime(Date.parse("2026-10-25T21:00:00Z"));
    const midnight=await request("Saudi-midnight",actor,"2026-11-02");assert.ifError(midnight.error);assert.equal(midnight.response.state,"ready");
    assert.equal(midnight.response.products.find((p:any)=>p.productCode==="P1").currentVehicleStock,4);
    assert.equal(midnight.response.products.find((p:any)=>p.productCode==="P2").lastSaleDate,"2026-10-26");
    assert.ok(midnight.row.trace.some(x=>x.path.includes("lastSaleDate")));
    assert.equal(midnight.row.admitted,24);
    const nextRepeat=await request("Saudi-midnight-repeated",actor,"2026-11-02");assert.ifError(nextRepeat.error);assert.deepEqual(nextRepeat.response,midnight.response);
    t.mock.timers.setTime(Date.parse("2026-10-25T12:00:00Z"));
    const another=await request("other-rep",{...actor,email:"other@example.invalid",userId:"other"});assert.ifError(another.error);
    assert.ok(another.response.routeCustomers.every((c:any)=>c.customerCode==="SECRET"));
  }
  for(const company of ["real","analysis"]){
    const other=await request(company,{...actor,companyId:company});assert.ifError(other.error);
    assert.equal(other.response.products.find((p:any)=>p.productCode==="P1").currentVehicleStock,4);
    assert.equal(other.row.trace.filter(x=>x.operation==="demoDailyReadDay.sql").length,0);
  }
  if(variant==="fixed"){
    trace=[];await coordinator.runRequest("same-request-multiple-companies",async()=>{
      const scopes=await Promise.all(["demo","real","analysis"].map(company=>hierarchy.resolveAllowedRouteIds(company,actor)));
      assert.ok(scopes.every(scope=>scope?.size===1&&scope.has("r1")));
    });
    assert.equal(trace.filter(x=>x.operation==="hierarchy.files").length,3);
  }
  mkdirSync(".quality/demo-cold-session",{recursive:true});
  writeFileSync(`.quality/demo-cold-session/${variant}.json`,JSON.stringify({synthetic:true,rows:seq,concurrency:1,budget:24,variant,results},null,2));
});
