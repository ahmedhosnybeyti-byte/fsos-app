import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { Prisma } from "@field-sales-os/database";
import { RieScalableQueryService } from "./scalable-query.service";
import { RieFacade } from "./rie-facade.service";
import { SmartLoadingService } from "../smart-loading/smart-loading.service";

test("Smart Loading session product labels use existing operational identities without active import files", async t => {
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE, "isolated PostgreSQL runtime is required");
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TABLE company_operating_settings(company_id text PRIMARY KEY,operating_mode text NOT NULL);
    CREATE TABLE wms_products(id text PRIMARY KEY,company_id text NOT NULL,code text NOT NULL,name text NOT NULL,is_active boolean NOT NULL DEFAULT true,UNIQUE(company_id,code));
    CREATE TABLE rie_canonical_entity_rows(id text PRIMARY KEY,company_id text NOT NULL,entity_name text NOT NULL,entity_key text NOT NULL,data jsonb NOT NULL,precedence bigint DEFAULT 1,created_at timestamptz DEFAULT now());
    CREATE INDEX ON rie_canonical_entity_rows(company_id,entity_name,entity_key);
    INSERT INTO company_operating_settings VALUES('sfa','SFA'),('erp','FULL_ERP'),('analysis','ANALYSIS_ONLY'),('unknown','OTHER');
    INSERT INTO wms_products(id,company_id,code,name) SELECT c||'-P1',c,'P1',c||' operational' FROM unnest(ARRAY['sfa','erp','analysis','missing','unknown']) c;
    INSERT INTO wms_products(id,company_id,code,name,is_active) VALUES('erp-inactive','erp','INACTIVE','Historical identity',false),('erp-only','erp','NEW','New without Excel',true),('other-only','other','SECRET','Other company',true);
    INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data)
      SELECT c||'-P1',c,'Products','P1',jsonb_build_object('ProductCode','P1','ProductName',c||' imported','Category','Imported category')
      FROM unnest(ARRAY['sfa','erp','analysis','missing','unknown']) c;
    INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data) VALUES
      ('erp-old','erp','Products','OLD','{"ProductCode":"OLD","ProductName":"Imported only","Category":"History"}'),
      ('other-import','other','Products','OTHER','{"ProductCode":"OTHER","ProductName":"Other imported"}');
  `);
  let calls = 0;
  let statement: Prisma.Sql;
  const service = new RieScalableQueryService({ $queryRaw: async (sql: Prisma.Sql) => {
    calls++; statement = sql;
    return (await db.query(sql.text, sql.values)).rows;
  } } as never, { resolveAllowedRouteIds: async () => { throw Error("company-wide product labels require no route/fact load"); } } as never);
  const labels = (companyId: string, productCodes = [" p1 "]) => service.querySmartLoadingProductMetadata({ companyId, productCodes });
  const legacy = (companyId: string, productCodes: string[]) => service.query({ companyId, entityName: "Products",
    projection: [{ field: "ProductCode", as: "productCode" }, { field: "ProductName", as: "productName" }, { field: "Category", as: "category" }],
    scope: { product: { values: productCodes } }, pagination: { limit: 5000 } });

  await t.test("default, unknown and ANALYSIS_ONLY retain exact canonical results", async () => {
    for (const company of ["analysis","missing","unknown"]) assert.deepEqual(await labels(company), await legacy(company,[" p1 "]));
  });
  await t.test("SFA and FULL_ERP prefer one operational identity while retaining imported category", async () => {
    for (const company of ["sfa","erp"]) assert.deepEqual((await labels(company)).records,
      [{ productCode: "P1",productName: `${company} operational`,category: "Imported category" }]);
  });
  await t.test("native-only, historical-only and inactive identities remain bounded and isolated", async () => {
    const result = await labels("erp",["NEW","OLD","INACTIVE","SECRET","OTHER","new"]);
    assert.deepEqual(result.records,[
      {productCode:"INACTIVE",productName:"Historical identity",category:null},
      {productCode:"NEW",productName:"New without Excel",category:null},
      {productCode:"OLD",productName:"Imported only",category:"History"},
    ]);
    assert.deepEqual((await labels("empty",["P1","SECRET","OTHER"])).records,[]);
    assert.doesNotMatch(statement!.text,/FROM files|JOIN files|rie_dataset_versions|rie_entity_rows/);
  });
  await t.test("operational edits are visible on the next read without import or cache refresh", async () => {
    await db.query("UPDATE wms_products SET name=$1 WHERE company_id='erp' AND code='NEW'",["Edited operational name"]);
    assert.equal((await labels("erp",["NEW"])).records[0]?.productName,"Edited operational name");
  });
  await t.test("normalized duplicate native identities fail closed instead of duplicating recommendations", async () => {
    await db.exec("INSERT INTO wms_products VALUES('erp-ambiguous','erp','p1','Ambiguous',true)");
    await assert.rejects(labels("erp"),/AMBIGUOUS_OPERATIONAL_CODE/);
    assert.deepEqual(await labels("analysis"),await legacy("analysis",[" p1 "]));
    await db.exec("DELETE FROM wms_products WHERE id='erp-ambiguous'");
  });
  await t.test("ANALYSIS_ONLY duplicate-row parity and operational de-duplication", async () => {
    await db.exec(`INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data) VALUES
      ('analysis-duplicate','analysis','Products','P1-2','{"ProductCode":"P1","ProductName":"Duplicate preserved","Category":"Second"}'),
      ('erp-duplicate','erp','Products','P1-2','{"ProductCode":"P1","ProductName":"Duplicate history","Category":"Second"}')`);
    assert.deepEqual(await labels("analysis"),await legacy("analysis",["p1"]));
    assert.equal((await labels("erp",["p1","P1"])).records.length,1);
  });
  await t.test("blank tenant and excessive keys fail before SQL; empty lookup performs no SQL", async () => {
    const before=calls;
    await assert.rejects(labels("",["P1"]),/requires company/);
    await assert.rejects(labels("erp",Array(5001).fill("P1")),/at most 5000/);
    assert.deepEqual((await labels("erp",[])).records,[]);
    assert.equal(calls,before);
  });
  await t.test("actual session consumes the new RIE contract without changing stock/demand calculations", async () => {
    const facade = new RieFacade({} as never,{} as never,{} as never,{} as never,{} as never,{} as never,{} as never,{} as never,service);
    const sessionService = new SmartLoadingService({
      runPlannedRequest: <T>(_o: unknown,f:()=>Promise<T>)=>f(),
      queryCanonicalRecords: async()=>({records:[],page:{limit:5000,offset:0,hasMore:false}}),
      querySmartLoadingProductMetadata: facade.querySmartLoadingProductMetadata.bind(facade),
      queryManagementActiveVehicleRoutes: async()=>[],
      queryManagementSmartLoadingBundle: async()=>({routeProductStaleness:[{productCode:"new",quantity:7,isStale:false,lastSaleDate:null,staleRouteProductCount:0,staleRouteProducts:[]}],stockAlignment:{alignmentPercent:100,categoryAlignments:[]},vehicleProducts:[]}),
    } as never,{detect:async()=>({status:"no-customers",opportunities:[]})} as never,{} as never,{} as never,{} as never);
    const session = await sessionService.getSession({companyId:"erp",roleCode:"COMPANY_ADMIN",email:"synthetic@example.invalid"} as never,"2099-01-01");
    assert.equal(session.state,"ready");
    if(session.state==="ready") {
      assert.equal(session.products[0]?.productName,"Edited operational name");
      assert.equal(session.products[0]?.currentVehicleStock,null); // existing unavailable-route semantics
      assert.equal(session.products[0]?.weeklyAverageSales,0);
    }
  });
  await t.test("one SQL execution for 1 and 5000 keys; comparable synthetic local timing", async () => {
    await db.exec(`INSERT INTO wms_products(id,company_id,code,name)
      SELECT c||i,c,'SKU-'||i,'Synthetic '||i FROM unnest(ARRAY['erp','other']) c CROSS JOIN generate_series(1,6000) i;
      INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data)
      SELECT c||i,c,'Products','SKU-'||i,jsonb_build_object('ProductCode','SKU-'||i,'ProductName','Synthetic '||i,'Category','Synthetic')
      FROM unnest(ARRAY['analysis','other']) c CROSS JOIN generate_series(1,6000) i;
      ANALYZE wms_products; ANALYZE rie_canonical_entity_rows;`);
    const samples: Record<string,unknown>[]=[];
    for(const count of [1,5000]) {
      const codes=Array.from({length:count},(_,i)=>`SKU-${i+1}`);
      for(const [name,run] of [
        ["analysis-before",()=>legacy("analysis",codes)],
        ["analysis-after",()=>labels("analysis",codes)],
        ["erp-after",()=>labels("erp",codes)],
      ] as const) {
        await run();
        const times:number[]=[];
        for(let i=0;i<10;i++) {
          const before=calls,start=performance.now();const result=await run();times.push(performance.now()-start);
          assert.equal(calls-before,1);assert.equal(result.records.length,count);assert.equal(result.page.hasMore,false);
        }
        samples.push({scenario:name,requestedCodes:count,actualConcurrency:1,sqlAdapterCount:1,elapsedMs:times});
      }
    }
    mkdirSync(".quality/rie-product-metadata",{recursive:true});
    writeFileSync(".quality/rie-product-metadata/observations.json",JSON.stringify({synthetic:true,runtime:"PGlite 0.5.8",datasetRows:Number((await db.query("SELECT (SELECT count(*) FROM wms_products)+(SELECT count(*) FROM rie_canonical_entity_rows)+(SELECT count(*) FROM company_operating_settings) AS n")).rows[0].n),samples,apiP95Ms:null,nativePoolWaitMs:null,nativeLockWaitMs:null,capacityVerified:false},null,2));
  });
});
