import assert from "node:assert/strict";
import test from "node:test";
import {mkdirSync,writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import type { Prisma } from "@field-sales-os/database";
import { demoDailyCacheTag, riyadhReadDay } from "./demo-daily-read-policy";
import { RieScalableQueryService } from "./scalable-query.service";
import { RieFacade } from "./rie-facade.service";
import { ExcelDatasetEntityProvider } from "./excel-entity-provider.service";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { RieErpHistoryQueryService } from "./erp-history-query.service";
import { RieExecutionCoordinatorService } from "./rie-execution-coordinator.service";
import { SmartLoadingService } from "../smart-loading/smart-loading.service";
import {SmartLoadingManagementCacheService} from "../smart-loading-management-cache/smart-loading-management-cache.service";
import {demoCacheFixture} from "./demo-cache-test-fixture";

test("central Demo day policy covers RIE CTE, direct, provider, history and cached reads",async t=>{
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE,"isolated PostgreSQL runtime required");
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-10-25T12:00:00Z")});
  t.beforeEach(()=>t.mock.timers.setTime(Date.parse("2026-10-25T12:00:00Z")));
  const old=process.env.RIE_DEMO_CANONICAL_COMPANY_ID;process.env.RIE_DEMO_CANONICAL_COMPANY_ID="demo";
  t.after(()=>{if(old===undefined)delete process.env.RIE_DEMO_CANONICAL_COMPANY_ID;else process.env.RIE_DEMO_CANONICAL_COMPANY_ID=old;});
  const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!),db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE company_operating_settings(company_id text PRIMARY KEY,operating_mode text);
    INSERT INTO company_operating_settings VALUES('demo','FULL_ERP'),('real','FULL_ERP');
    CREATE TABLE files(id text PRIMARY KEY,created_at timestamptz DEFAULT now());INSERT INTO files(id) VALUES('file');
    CREATE TABLE rie_canonical_entity_rows(id text PRIMARY KEY,company_id text,entity_name text,entity_key text,data jsonb,precedence bigint DEFAULT 1,source_file_id text DEFAULT 'file',created_at timestamptz DEFAULT now());
    CREATE INDEX ON rie_canonical_entity_rows(company_id,entity_name);
    CREATE TABLE sales_calendars(company_id text,calendar_date date,day text,week int,month int,quarter int,year int,working_day bool,holiday text,season text,ramadan bool,promotion_season text);
    INSERT INTO sales_calendars(company_id,calendar_date) VALUES('demo','2026-10-25'),('demo','2026-10-26'),('real','2026-10-26');
    CREATE TABLE erp_import_projects(id text,company_id text,state text,synthetic_demo bool,demo_as_of date);
    INSERT INTO erp_import_projects VALUES('project','demo','APPROVED',true,'2026-12-31');
    CREATE TABLE erp_import_rows(project_id text,entity text,state text,business_key text,event_date date,data jsonb);
    INSERT INTO erp_import_rows VALUES('project','Invoices','ACCEPTED','now','2026-10-25','{}'),('project','Invoices','ACCEPTED','future','2026-10-26','{}'),('project','Invoices','ACCEPTED','undated',NULL,'{}');`);
  let seq=0;const put=async(company:string,entity:string,data:object)=>{const id=String(++seq);await db.query("INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data) VALUES($1,$2,$3,$1,$4)",[id,company,entity,JSON.stringify(data)]);};
  for(const company of ["demo","real"])for(const day of ["2026-10-24","2026-10-25","2026-10-26"]) {
    const common={RouteID:"R1",ProductCode:"P1",Quantity:25,Unit:"CARTON"};
    for(const [entity,field] of Object.entries({Invoices:"InvoiceDate",Returns:"ReturnDate",Visits:"VisitDate",Collections:"CollectionDate","Van Loads":"LoadDate","Van Inventory":"ReportDate","Price List":"StartDate","Route Assignments":"StartDate",Employees:"HireDate"}))
      await put(company,entity,{...common,[field]:day,InvoiceNo:day,ReturnNo:day,EmployeeID:day,Email:`${day}@example.invalid`,InvoiceStatus:"Confirmed",CustomerCode:"C1"});
    await put(company,"Invoice Items",{...common,InvoiceNo:day,LineNo:1,LineTotal:25});
    await put(company,"Return Items",{...common,ReturnNo:day,LineNo:1});
  }
  await put("demo","Invoice Items",{InvoiceNo:"ORPHAN",ProductCode:"P1",Quantity:999});
  await put("demo","Invoices",{InvoiceNo:"INVALID",InvoiceDate:"2026-02-30"});
  await put("demo","Targets",{Year:2026,Month:10});await put("demo","Targets",{Year:2026,Month:11});
  await put("demo","Unknown Future Entity",{Date:"2099-01-01"});
  let calls=0;const queries:Prisma.Sql[]=[];
  const prisma:any={$queryRaw:async(sql:Prisma.Sql)=>{calls++;queries.push(sql);return(await db.query(sql.text,sql.values)).rows;},
    rieDatasetVersion:{findMany:async()=>[{id:"version",sourceFileId:"file"}]},rieCanonicalEntityRow:{findFirst:async()=>null},
    file:{findMany:async()=>[{id:"file",datasetType:"Employees"}]} };
  const hierarchy={resolveAllowedRouteIds:async()=>new Set(["r1"])};
  const service=new RieScalableQueryService(prisma,hierarchy as never);
  const base=(entityName:string,companyId="demo")=>({companyId,entityName,projection:[{field:"ProductCode",as:"code"}],pagination:{limit:20}});
  const all=(entity:string,company="demo")=>service.query(base(entity,company));

  await t.test("all business-event and effective-start entities cap before grouping; direct child reads require dated parents",async()=>{
    for(const entity of ["Invoices","Returns","Visits","Collections","Van Loads","Van Inventory","Invoice Items","Return Items","Price List","Route Assignments","Employees"]) {
      const before=calls;assert.equal((await all(entity)).records.length,2,entity);assert.equal(calls-before,1,entity);
    }
    assert.equal((await all("Targets")).records.length,1);
    const inventory=await service.query({...base("Van Inventory"),projection:[{field:"ReportDate",as:"day"}],latestPer:{partitionBy:{field:"RouteID"},orderBy:{field:"ReportDate"}}});
    assert.deepEqual(inventory.records,[{day:"2026-10-25"}]);
    const futureOnly=await service.query({...base("Invoices"),scope:{date:{field:"InvoiceDate",from:"2026-10-26",to:"2026-12-31"}}});
    assert.deepEqual(futureOnly.records,[]);
    assert.deepEqual((await all("Unknown Future Entity")).records,[]);
  });
  await t.test("Assistant direct dataset/count reads cannot bypass the ceiling, including item-only requests",async()=>{
    for(const entityName of ["Invoices","Invoice Items","Return Items","Van Inventory"]){
      const result=await service.queryAssistantDataset({companyId:"demo",entityName,filters:[],projection:null,hintFields:[],countOnly:false,pagination:{limit:60,offset:0}});
      assert.equal(result.totalMatchingRows,2,entityName);assert.equal(result.records.length,2);
    }
  });
  await t.test("entity provider/navigation and direct facade invoice-sales reuse the same SQL policy",async()=>{
    for(const entity of ["Invoices","Invoice Items","Van Inventory"]) {
      const provider=new ExcelDatasetEntityProvider({listConfirmedActiveForCompany:async()=>[{id:"file",datasetType:entity}]} as never,hierarchy as never,prisma);
      const result=await provider.getRecords(entity,{companyId:"demo",limit:20});assert.equal(result.available,true);assert.equal(result.records.length,2,entity);
    }
    const facade=new RieFacade({} as never,{} as never,{} as never,{} as never,{} as never,prisma,{} as never,hierarchy as never,service);
    const sales=await facade.getInvoiceSalesRows({companyId:"demo"});assert.equal(sales.length,2);
    assert.ok(sales.every(row=>row.time!==null && row.time<=Date.parse("2026-10-25T23:59:59Z")));
  });
  await t.test("calendar and privileged ERP history cannot expose later Demo rows",async()=>{
    const provider=new ExcelDatasetEntityProvider({} as never,hierarchy as never,prisma);
    const calendar=await provider.getRecords("Sales Calendar",{companyId:"demo"});assert.equal(calendar.available,true);assert.equal(calendar.records.length,1);
    const history=new RieErpHistoryQueryService(prisma,new RieExecutionCoordinatorService());
    const result=await history.query("demo","Invoices","2026-12-31",1);assert.equal(result.total,1);assert.equal(result.items[0].key,"now");
  });
  await t.test("existing persistent Demo cache hits safely, refreshes at midnight/data changes and isolates permissions",async()=>{
    const resolver=new CanonicalHierarchyResolverService(prisma);
    const read=()=> (resolver as any).fetchRawEntityRows("Employees","demo");
    assert.equal((await read()).rows.length,2);
    let computations=0;let routes=new Set(["r1"]);
    const facade={demoReadDay:service.demoReadDay.bind(service),queryManagementLoadingRisk:async(input:any)=>{computations++;return {people:(await service.queryManagementActiveVehicleRoutes({companyId:input.companyId,routeIds:[...routes],targetDate:"2099-01-01"})).map(row=>({employeeId:row.latestReportDate}))};}};
    const cache=await demoCacheFixture(db),cachePrisma=cache.prisma;
    const loading=new SmartLoadingService(facade as never,{} as never,cachePrisma,{resolveAllowedRouteIds:async()=>routes} as never,new SmartLoadingManagementCacheService(cachePrisma));
    const user={companyId:"demo",userId:"manager-1",permissions:["smart-loading.read"],orgUnitId:null,roleCode:"MANAGER",email:"synthetic@example.invalid"};
    // Hold the sales range/target fixed: only the read-day token can force the
    // midnight miss. A changed salesTo alone must not make this test pass.
    const risk=(actor=user)=>loading.getManagementLoadingRisk(actor as never,{targetDate:"2099-01-01",salesFrom:"2026-10-01",salesTo:"2026-10-24"});
    t.mock.timers.setTime(Date.parse("2026-10-25T20:59:59Z"));
    const key=demoDailyCacheTag("demo"),before=await risk();assert.equal(before.salesTo,"2026-10-24");assert.equal(before.people[0]?.employeeId,"2026-10-25");
    assert.deepEqual(await risk(),before);assert.equal(computations,1);
    const real=await (loading as any).lastSaleSnapshotVersion("real");
    assert.equal(riyadhReadDay(),"2026-10-25");
    t.mock.timers.setTime(Date.parse("2026-10-25T21:00:00Z"));
    assert.equal(riyadhReadDay(),"2026-10-26");assert.notEqual(demoDailyCacheTag("demo"),key);
    const after=await risk();assert.equal(after.salesTo,"2026-10-24");assert.equal(after.people[0]?.employeeId,"2026-10-26");assert.equal(computations,2);
    assert.equal(await (loading as any).lastSaleSnapshotVersion("real"),real);
    await risk();assert.equal(computations,2);
    cache.bump();await risk();assert.equal(computations,3);await risk();assert.equal(computations,3);
    await risk({...user,permissions:[...user.permissions,"changed-grant"]});assert.equal(computations,4);
    await risk({...user,userId:"manager-2"});assert.equal(computations,5);
    routes=new Set(["r2"]);assert.equal((await risk()).affectedPersonCount,0);assert.equal(computations,6);routes=new Set(["r1"]);
    await risk();assert.equal(computations,6);
    await risk({...user,companyId:"real"});assert.equal(computations,7);
    const concurrentUser={...user,userId:"manager-concurrent"};await Promise.all([risk(concurrentUser),risk(concurrentUser),risk(concurrentUser)]);assert.equal(computations,8);
    const persisted=await db.query("SELECT company_id,count(*)::int n FROM smart_loading_management_loading_risk_snapshots GROUP BY company_id");
    assert.ok(persisted.rows.some((r:any)=>r.company_id==="demo"&&r.n>1));assert.ok(persisted.rows.some((r:any)=>r.company_id==="real"));
    assert.equal((await read()).rows.length,3);
  });
  await t.test("other companies and ANALYSIS_ONLY/SFA/default keep exact pre-policy SQL/results",async()=>{
    const real=await all("Van Inventory","real");assert.equal(real.records.length,3);assert.doesNotMatch(queries.at(-1)!.text,/demo_daily_mode/);
    for(const mode of ["ANALYSIS_ONLY","SFA","UNKNOWN"]) {
      await db.query("UPDATE company_operating_settings SET operating_mode=$1 WHERE company_id='demo'",[mode]);
      assert.equal((await all("Van Inventory")).records.length,3);
      assert.equal((await all("Unknown Future Entity")).records.length,1);
    }
    await db.exec("DELETE FROM company_operating_settings WHERE company_id='demo'");assert.equal((await all("Van Inventory")).records.length,3);
    assert.equal(await service.demoReadDay("demo"),null);
    await db.exec("INSERT INTO company_operating_settings VALUES('demo','FULL_ERP')");
    delete process.env.RIE_DEMO_CANONICAL_COMPANY_ID;assert.equal((await all("Van Inventory")).records.length,3);
    assert.doesNotMatch(queries.at(-1)!.text,/demo_daily_mode/);process.env.RIE_DEMO_CANONICAL_COMPANY_ID="demo";
  });
  await t.test("parent date filtering is a single set-based read with bounded product results, not a per-line scan",async()=>{
    await db.exec(`INSERT INTO company_operating_settings VALUES('plan','FULL_ERP');
      INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data)
        SELECT 'header-'||i,'plan','Invoices','H'||i,jsonb_build_object('InvoiceNo','H'||i,'InvoiceDate',CASE WHEN i%2=0 THEN '2026-10-25' ELSE '2026-10-26' END)
        FROM generate_series(1,1000) i;
      INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data)
        SELECT 'line-'||i||'-'||j,'plan','Invoice Items','L'||i||'-'||j,jsonb_build_object('InvoiceNo','H'||i,'ProductCode','P'||(i%100),'Quantity',1)
        FROM generate_series(1,1000) i CROSS JOIN generate_series(1,10) j;
      ANALYZE rie_canonical_entity_rows;`);
    process.env.RIE_DEMO_CANONICAL_COMPANY_ID="plan";
    const observations:unknown[]=[];
    try {
      for(const size of [1,20,100]) {
        const run=()=>service.query({companyId:"plan",entityName:"Invoice Items",projection:[{field:"ProductCode",as:"code"}],groupBy:[{field:"ProductCode"}],aggregates:[{op:"sum",field:"Quantity",as:"quantity"}],scope:{product:{values:Array.from({length:size},(_,i)=>`P${i}`)}},pagination:{limit:100}});
        await run();const samples:number[]=[];
        for(let i=0;i<10;i++){const count=calls,start=performance.now();const result=await run();samples.push(performance.now()-start);assert.equal(calls-count,1);assert.equal(result.records.length,Math.ceil(size/2));assert.equal(result.page.hasMore,false);}
        const sql=queries.at(-1)!;
        const explained=(await db.query(`EXPLAIN (ANALYZE,FORMAT JSON) ${sql.text}`,sql.values)).rows[0]["QUERY PLAN"][0];
        const parents:any[]=[];const walk=(node:any)=>{if(node.Alias==="demo_daily_parent")parents.push(node);for(const child of node.Plans??[])walk(child);};walk(explained.Plan);
        assert.ok(parents.length>0);assert.ok(parents.every(p=>p["Actual Loops"]<=1),"parent fact must not rescan for every item");
        observations.push({requestedProducts:size,actualConcurrency:1,sqlPerRead:1,serviceSamplesMs:samples,serviceP95Ms:[...samples].sort((a,b)=>a-b)[9],parentScans:parents.map(p=>({loops:p["Actual Loops"],rows:p["Actual Rows"],removed:p["Rows Removed by Filter"]??0})),planRuntime:"PGlite",apiP95Ms:null,nativeWaits:null});
      }
    } finally {process.env.RIE_DEMO_CANONICAL_COMPANY_ID="demo";}
    mkdirSync(".quality/demo-daily-read-policy",{recursive:true});
    writeFileSync(".quality/demo-daily-read-policy/focused.json",JSON.stringify({synthetic:true,fixtureRows:11000,headerRows:1000,itemRows:10000,observations,capacityVerified:false},null,2));
    for(const statement of queries) assert.doesNotMatch(statement.text,/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/);
  });
});
