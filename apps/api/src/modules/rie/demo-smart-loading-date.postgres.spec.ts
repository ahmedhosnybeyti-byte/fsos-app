import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { Prisma } from "@field-sales-os/database";
import { RieScalableQueryService } from "./scalable-query.service";
import { SmartLoadingService, parseAsOfDate, weekdayForDate } from "../smart-loading/smart-loading.service";
import {demoCacheFixture} from "./demo-cache-test-fixture";

test("Demo daily policy uses canonical data through today's Riyadh day without treating loads as balances", async t => {
  t.mock.timers.enable({apis:["Date"],now:new Date("2026-10-25T12:00:00Z")});
  t.beforeEach(()=>t.mock.timers.setTime(Date.parse("2026-10-25T12:00:00Z")));
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE, "isolated PostgreSQL runtime required");
  const previous = process.env.RIE_DEMO_CANONICAL_COMPANY_ID;
  process.env.RIE_DEMO_CANONICAL_COMPANY_ID = "demo";
  t.after(() => { if(previous === undefined) delete process.env.RIE_DEMO_CANONICAL_COMPANY_ID; else process.env.RIE_DEMO_CANONICAL_COMPANY_ID = previous; });
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  // No files/workbooks, import/version tables or WMS tables exist here.
  await db.exec(`CREATE TABLE company_operating_settings(company_id text PRIMARY KEY,operating_mode text);
    CREATE TABLE rie_canonical_entity_rows(id text PRIMARY KEY,company_id text,entity_name text,entity_key text,data jsonb,precedence bigint DEFAULT 1,created_at timestamptz DEFAULT now());
    CREATE INDEX ON rie_canonical_entity_rows(company_id,entity_name);
    INSERT INTO company_operating_settings VALUES('demo','FULL_ERP'),('real','FULL_ERP');`);
  const cache=await demoCacheFixture(db);
  let n=0;
  const insert = async(company:string,entity:string,data:object) => {
    const id=String(++n); await db.query("INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data) VALUES($1,$2,$3,$1,$4)",[id,company,entity,JSON.stringify(data)]);
  };
  for(const company of ["demo","real"]) {
    for(const [date,quantity] of [["2026-10-25",10],["2026-10-30",20],["2026-10-31",30],["2026-11-01",900],["2026-12-31",999]] as const)
      await insert(company,"Van Inventory",{ReportDate:date,RouteID:"R1",ProductCode:"P1",Unit:"CARTON",Quantity:quantity});
    await insert(company,"Van Inventory",{ReportDate:"2026-10-31",RouteID:"SECRET",ProductCode:"P1",Quantity:5000});
    await insert(company,"Customers",{CustomerCode:"C1",RouteID:"R1",VisitDay:"Saturday"});
    await insert(company,"Products",{ProductCode:"P1",ProductName:"Synthetic product"});
    for(const [date,quantity] of [["2026-10-25",14],["2026-10-31",70],["2026-11-01",1000000]] as const) {
      await insert(company,"Invoices",{InvoiceNo:date,InvoiceDate:date,InvoiceStatus:"Confirmed",RouteID:"R1",CustomerCode:"C1"});
      await insert(company,"Invoice Items",{InvoiceNo:date,RouteID:"R1",ProductCode:"P1",Quantity:quantity});
    }
    await insert(company,"Van Loads",{LoadNo:"LOAD",LoadDate:"2026-10-31",RouteID:"R1",ProductCode:"P1",Unit:"CARTON",Quantity:777});
  }
  await insert("demo","Van Inventory",{ReportDate:"2026-10-24",RouteID:"R2",ProductCode:"P1",Unit:"CARTON",Quantity:5});
  await insert("demo","Van Inventory",{ReportDate:"2026-10-31",RouteID:"R2",ProductCode:"P1",Unit:"CARTON",Quantity:1000});
  let calls=0;const statements:Prisma.Sql[]=[];const visibleRoutes=new Set(["r1"]);
  const query = new RieScalableQueryService({$queryRaw:async(sql:Prisma.Sql)=>{calls++;statements.push(sql);return (await db.query(sql.text,sql.values)).rows;}} as never,
    {resolveAllowedRouteIds:async()=>visibleRoutes} as never);
  const ctx=(companyId="demo")=>({companyId,requestingUser:{roleCode:"SALES_REP",email:"synthetic@example.invalid"}});
  const stock=(_day:string,companyId="demo")=>query.query({...ctx(companyId),entityName:"Van Inventory",
    projection:[{field:"ProductCode",as:"productCode"}],latestPer:{partitionBy:{field:"RouteID"},orderBy:{field:"ReportDate"}},
    groupBy:[{field:"ProductCode"}],aggregates:[{op:"sum",field:"Quantity",as:"quantity"}],pagination:{limit:20}});
  const snapshot=async()=>JSON.stringify((await db.query("SELECT jsonb_agg(to_jsonb(r) ORDER BY id) rows FROM rie_canonical_entity_rows r")).rows[0].rows);
  const before=await snapshot();

  await t.test("the ceiling advances with the clock, including Saudi midnight, without importing or editing settings",async()=>{
    assert.equal(parseAsOfDate(undefined).toISOString().slice(0,10),"2026-10-25");
    assert.equal(weekdayForDate(parseAsOfDate("2026-10-31")),"saturday");
    for(const [date,expected] of [["2026-10-25",10],["2026-10-30",20],["2026-10-31",30],["2026-11-01",900],["2026-12-31",999]] as const) {
      t.mock.timers.setTime(Date.parse(`${date}T12:00:00Z`));
      assert.equal((await stock(date)).records[0]?.quantity,expected);
    }
    t.mock.timers.setTime(Date.parse("2026-10-30T20:59:59Z"));
    assert.equal((await stock("2099-01-01")).records[0]?.quantity,20);
    t.mock.timers.setTime(Date.parse("2026-10-30T21:00:00Z"));
    assert.equal((await stock("2099-01-01")).records[0]?.quantity,30);
    t.mock.timers.setTime(Date.parse("2026-01-01T12:00:00Z"));
    assert.deepEqual((await stock("2026-01-01")).records,[]);
  });
  await t.test("existing initial-session and management reads already cap inventory at the selected target",async()=>{
    const initial=await query.query({...ctx(),entityName:"Van Inventory",projection:[{field:"ProductCode",as:"productCode"}],
      latestPer:{partitionBy:{field:"RouteID"},orderBy:{field:"ReportDate"}},groupBy:[{field:"ProductCode"}],aggregates:[{op:"sum",field:"Quantity",as:"quantity"}],
      scope:{date:{field:"ReportDate",to:"2026-10-31"}}});
    assert.equal(initial.records[0]?.quantity,10);
    assert.deepEqual(await query.queryManagementActiveVehicleRoutes({...ctx(),targetDate:"2026-10-31"}),[{routeId:"r1",latestReportDate:"2026-10-25"}]);
  });
  await t.test("actual recalculate path no longer substitutes December inventory for October 31",async()=>{
    const facade={demoReadDay:query.demoReadDay.bind(query),queryCanonicalRecords:query.query.bind(query),querySmartLoadingNetQuantities:query.querySmartLoadingNetQuantities.bind(query),hasCanonicalEntitySources:async()=>true};
    const service=new SmartLoadingService(facade as never,{} as never,{} as never,{} as never,{} as never);
    const result=await service.recalculate({companyId:"demo",roleCode:"SALES_REP",email:"synthetic@example.invalid"} as never,
      {targetDate:"2026-10-31",fromDate:"2026-10-25",toDate:"2026-10-31",visitsPerWeek:1,staleDaysThreshold:4,customerCodes:["C1"],confirmedOrders:[]});
    assert.equal(result.products[0]?.vehicleStock,10);
    assert.equal(result.toDate,"2026-10-25");
    assert.equal(result.products[0]?.estimatedCustomerDemand,98);
    assert.equal(result.products[0]?.suggestedQuantity,88);
    visibleRoutes.add("r2");
    try {
      const multi=await service.recalculate({companyId:"demo",roleCode:"SALES_REP",email:"synthetic@example.invalid"} as never,
        {targetDate:"2026-10-31",fromDate:"2026-10-25",toDate:"2026-10-31",visitsPerWeek:1,staleDaysThreshold:4,customerCodes:["C1"],confirmedOrders:[]});
      assert.equal(multi.products[0]?.vehicleStock,15); // latest eligible snapshot of each route, not one global day.
    } finally {visibleRoutes.delete("r2");}
    await assert.rejects(service.recalculate({companyId:"demo",roleCode:"SALES_REP",email:"synthetic@example.invalid"} as never,
      {targetDate:"2026-11-02",fromDate:"2026-11-01",toDate:"2026-12-31",visitsPerWeek:1,staleDaysThreshold:4,customerCodes:["C1"],confirmedOrders:[]}),/toDate must be on or after fromDate/);
  });
  await t.test("session lost-opportunity stock uses the same Demo date cutoff",async()=>{
    let lastSaleReads=0;
    const facade={
      demoReadDay:query.demoReadDay.bind(query),
      runPlannedRequest:<T>(_options:unknown,execute:()=>Promise<T>)=>execute(),
      queryCanonicalRecords:async(input:any)=>{if(input.aggregates?.some((a:any)=>a.as==="lastSaleDate"))lastSaleReads++;return query.query(input);},
      queryStalePurchases:query.queryStalePurchases.bind(query),
      queryManagementActiveVehicleRoutes:query.queryManagementActiveVehicleRoutes.bind(query),
      queryManagementSmartLoadingBundle:async()=>({routeProductStaleness:[{productCode:"p1",quantity:30,lastSaleDate:null,isStale:false,staleRouteProductCount:0,staleRouteProducts:[]}],stockAlignment:{alignmentPercent:100,categoryAlignments:[]},vehicleProducts:[]}),
      querySmartLoadingProductMetadata:async()=>({records:[{productCode:"P1",productName:"Synthetic product"}],page:{hasMore:false}}),
    };
    const opportunity={customerCode:"C1",customerName:"Synthetic customer",productCode:"P1",productName:"Synthetic product",category:null,baselineNetQuantity:50,recentNetQuantity:0,suggestedQuantity:50,suggestedQuantityAvailable:true,expectedSales:0};
    const service=new SmartLoadingService(facade as never,{detect:async()=>({status:"available",opportunities:[opportunity]})} as never,cache.prisma,{} as never,{} as never);
    const session=await service.getSession({companyId:"demo",roleCode:"COMPANY_ADMIN",email:"synthetic@example.invalid"} as never,"2026-10-31");
    assert.equal(session.state,"ready");
    if(session.state==="ready") assert.equal(session.lostOpportunities.length,1); // 50 > Oct stock 30, but not Dec stock 999.
    const actor={companyId:"demo",userId:"rep-1",permissions:["sfa.access"],orgUnitId:null,roleCode:"SALES_REP",email:"synthetic@example.invalid"};
    const repSession=await service.getSession(actor as never,"2026-10-31");
    assert.equal(repSession.state,"ready");
    if(repSession.state==="ready") assert.equal(repSession.products[0]?.currentVehicleStock,10);
    const saved=await db.query("SELECT last_sale_date FROM smart_loading_last_sale_snapshots WHERE company_id='demo'");
    assert.ok(saved.rows.length>0);assert.ok(saved.rows.every((r:any)=>r.last_sale_date<="2026-10-25"));
    assert.equal(lastSaleReads,1);await service.getSession(actor as never,"2026-10-31");assert.equal(lastSaleReads,1);
    t.mock.timers.setTime(Date.parse("2026-10-25T21:00:00Z"));
    await service.getSession(actor as never,"2026-10-31");assert.equal(lastSaleReads,2);
    cache.bump();await service.getSession(actor as never,"2026-10-31");assert.equal(lastSaleReads,3);
    await service.getSession({...actor,permissions:[...actor.permissions,"changed-grant"]} as never,"2026-10-31");assert.equal(lastSaleReads,4);
  });
  await t.test("flag off, other tenants, SFA, ANALYSIS_ONLY and missing mode keep legacy results",async()=>{
    assert.equal((await stock("2026-10-31","real")).records[0]?.quantity,999);
    for(const mode of ["ANALYSIS_ONLY","SFA"]) {
      await db.query("UPDATE company_operating_settings SET operating_mode=$1 WHERE company_id='demo'",[mode]);
      assert.equal((await stock("2026-10-31")).records[0]?.quantity,999);
    }
    await db.exec("DELETE FROM company_operating_settings WHERE company_id='demo'");
    assert.equal((await stock("2026-10-31")).records[0]?.quantity,999);
    await db.exec("INSERT INTO company_operating_settings VALUES('demo','FULL_ERP')");
    delete process.env.RIE_DEMO_CANONICAL_COMPANY_ID;
    assert.equal((await stock("2026-10-31")).records[0]?.quantity,999);
    assert.doesNotMatch(statements.at(-1)!.text,/company_operating_settings/);
    process.env.RIE_DEMO_CANONICAL_COMPANY_ID="demo";
  });
  await t.test("loads never fill a missing inventory snapshot and all reads preserve the canonical rows",async()=>{
    await db.exec("UPDATE rie_canonical_entity_rows SET entity_name='Van Loads' WHERE company_id='demo' AND entity_name='Van Inventory'");
    assert.deepEqual((await stock("2026-10-31")).records,[]);
    await db.exec("UPDATE rie_canonical_entity_rows SET entity_name='Van Inventory' WHERE company_id='demo' AND data ? 'ReportDate'");
    assert.equal(await snapshot(),before);
    for(const statement of statements) assert.doesNotMatch(statement.text,/INSERT|UPDATE|DELETE|wms_|FROM files|rie_dataset_versions/);
  });
  await t.test("bounded product reads use one SQL execution, including the mode guard",async()=>{
    const samples:number[]=[];await stock("2026-10-31");
    for(let i=0;i<10;i++){const count=calls,start=performance.now();const result=await stock("2026-10-31");samples.push(performance.now()-start);assert.equal(calls-count,1);assert.equal(result.records.length,1);}
    const sorted=[...samples].sort((a,b)=>a-b);mkdirSync(".quality/demo-smart-loading-date",{recursive:true});
    writeFileSync(".quality/demo-smart-loading-date/focused.json",JSON.stringify({synthetic:true,rows:n,companies:2,concurrency:1,sqlPerStockRead:1,serviceSamplesMs:samples,serviceP95Ms:sorted[Math.ceil(sorted.length*.95)-1],apiP95Ms:null,nativeWaits:null,capacityVerified:false},null,2));
  });
});
