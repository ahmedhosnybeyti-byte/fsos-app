import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {wmsFixture,wmsPersistence,wmsUser} from "./wms-test-fixture";
import {procurementSeed,procurementMigration} from "./procurement-test-fixture";
import {RieWmsCoverageQueryService} from "../rie/wms-coverage-query.service";
import {RieExecutionCoordinatorService} from "../rie/rie-execution-coordinator.service";
import {WmsCoverageService} from "./wms-coverage.service";
import {ForbiddenException,NotFoundException} from "@nestjs/common";

async function fixture(t:any) {
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE);
  const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());
  const access=await wmsFixture(db);await db.exec(procurementSeed);await db.exec(readFileSync(procurementMigration,"utf8"));
  await db.exec(`CREATE TABLE erp_product_links(company_id text,product_id text,source_code text,source_uom jsonb);
    INSERT INTO erp_product_links VALUES('a','p','SKU','{"CartonQty":12,"PackQty":3,"PieceQty":1}');`);
  const coordinator=new RieExecutionCoordinatorService();
  function rie(allowed:Set<string>|null=null){return new RieWmsCoverageQueryService(wmsPersistence(db),{resolveAllowedRouteIds:async()=>allowed} as never,coordinator);}
  async function row(entity:string,data:any,company="a"){await db.query("INSERT INTO rie_canonical_entity_rows(company_id,entity_name,data) VALUES($1,$2,$3)",[company,entity,JSON.stringify(data)]);}
  async function sale(id:string,day:string,quantity:any,unit="Carton",extra:any={},company="a",route="R1"){
    await row("Invoices",{InvoiceNo:id,InvoiceDate:day,InvoiceStatus:"Confirmed",InvoiceType:"Sale",RouteID:route,...extra},company);
    await row("Invoice Items",{InvoiceNo:id,ProductCode:"SKU",RouteID:route,Quantity:quantity,FreeQuantity:0,Unit:unit},company);
  }
  async function history(q=10){for(const [id,date]of [["one","2026-10-01"],["two","2026-10-10"],["three","2026-10-21"]])await sale(id!,date!,q);}
  const query=(service=rie(),orders=false)=>service.query("a","wa",wmsUser(),"2026-10-21",1,"",orders);
  return{db,access,rie,row,sale,history,query};
}

test("coverage exact UOM/calendar mean and stock exclusions; dynamic critical/watch/safe; no writes",async t=>{
 const f=await fixture(t);await f.history(10);
 await f.db.exec("UPDATE wms_positions SET reserved=120,quarantined=72 WHERE company_id='a' AND warehouse_id='wa'");
 const before=(await f.db.query("SELECT * FROM wms_positions ORDER BY company_id,warehouse_id,batch_id")).rows;
 let [r]=await f.query();assert.equal(r!.dailyDemand,"12.000000");assert.equal(r!.available,"2160.000000");assert.equal(r!.daysOfCover,"180.00");assert.equal(r!.risk,"SAFE");assert.equal(r!.leadTimeDays,null);
 assert.deepEqual((await f.db.query("SELECT * FROM wms_positions ORDER BY company_id,warehouse_id,batch_id")).rows,before);
 await f.db.exec("UPDATE wms_positions SET physical=276 WHERE company_id='a' AND warehouse_id='wa'");
 [r]=await f.query();assert.equal(r!.daysOfCover,"7.00");assert.equal(r!.risk,"CRITICAL");
 await f.db.exec("UPDATE wms_positions SET physical=552 WHERE company_id='a' AND warehouse_id='wa'");
 [r]=await f.query();assert.equal(r!.daysOfCover,"30.00");assert.equal(r!.risk,"WATCH");
 await f.sale("pack","2026-10-21",10,"Pack");[r]=await f.query();assert.equal(r!.dailyDemand,"13.000000");
 await f.db.exec(`UPDATE rie_canonical_entity_rows SET data=data||'{"FreeQuantity":6}' WHERE entity_name='Invoice Items' AND data->>'InvoiceNo'='one'`);
 [r]=await f.query();assert.equal(r!.dailyDemand,"15.400000");
});

test("coverage excludes future/cancelled/exchange/untyped invoices, loads, other tenants and restricted routes",async t=>{
 const f=await fixture(t);await f.history();
 await f.sale("future","2026-10-22",99999);await f.sale("cancel","2026-10-20",99999,"Carton",{InvoiceStatus:"Cancelled"});
 await f.sale("exchange","2026-10-20",99999,"Carton",{InvoiceType:"Exchange"});await f.sale("untyped","2026-10-20",99999,"Carton",{InvoiceType:null});
 await f.sale("foreign","2026-10-20",99999,"Carton",{},"b");await f.row("Van Loads",{Quantity:99999,ProductCode:"SKU"});
 assert.equal((await f.query())[0]!.dailyDemand,"12.000000");
 assert.equal((await f.query(f.rie(new Set())))[0]!.risk,"UNKNOWN");
 assert.equal((await f.query(f.rie(new Set(["r1"]))))[0]!.dailyDemand,"12.000000");
 await f.sale("posted","2026-10-20",10,"Carton",{InvoiceStatus:"Posted",InvoiceType:"Van Sale"});
 await f.sale("presale","2026-10-20",10,"Carton",{InvoiceStatus:"Posted",InvoiceType:"Pre-Sale"});
 assert.equal((await f.query())[0]!.dailyDemand,"20.000000");
});

test("coverage fails closed for missing, stale, sparse history and corrupt quantities/UOM",async t=>{
 const f=await fixture(t);assert.equal((await f.query())[0]!.daysOfCover,null);
 await f.sale("short","2026-10-21",10);assert.equal((await f.query())[0]!.risk,"UNKNOWN");
 await f.history();assert.equal((await f.query())[0]!.risk,"SAFE");
 await f.sale("unknown","2026-10-20",10,"Pallet");let [r]=await f.query();assert.equal(r!.reason,"UOM");assert.equal(r!.dailyDemand,null);
 await f.db.exec("DELETE FROM rie_canonical_entity_rows WHERE data->>'InvoiceNo' IN ('unknown','short','three')");
 [r]=await f.query();assert.equal(r!.reason,"HISTORY");assert.equal(r!.daysOfCover,null);
 await f.db.exec("UPDATE erp_product_links SET source_uom='{}'");await f.sale("recent","2026-10-21",10);assert.equal((await f.query())[0]!.reason,"UOM");
});

test("coverage service retains warehouse/tenant/permission boundary, bounded page and completed-day period",async t=>{
 const f=await fixture(t),service=new WmsCoverageService(f.access,f.rie());
 await assert.rejects(service.coverage({...wmsUser(),permissions:[]},"wa",{}),ForbiddenException);
 await assert.rejects(service.coverage(wmsUser(),"wb",{}),NotFoundException);
 // The procurement seed intentionally assigns clerk-a to wa; use a truly
 // unassigned actor to exercise the warehouse boundary.
 await f.db.exec("INSERT INTO users(id,company_id,full_name) VALUES('unassigned-a','a','Unassigned')");
 await assert.rejects(service.coverage(wmsUser("a","unassigned-a","MANAGER"),"wa",{}),NotFoundException);
 const r=await service.coverage(wmsUser(),"wa",{});assert.equal(r!.page,1);assert.ok(r!.items.length<=20);
 assert.equal(Date.parse(r!.to)-Date.parse(r!.from),29*86400000);assert.ok(Date.parse(r!.to)<Date.parse(r!.stockAsOf));
});

test("coverage links only authorized existing open supply; blocked stock stays unavailable; future line invalidates estimate",async t=>{
 const f=await fixture(t);await f.history();
 await f.db.exec(`INSERT INTO procurement_requests(id,company_id,warehouse_id,reference,status,creator_id,reason) VALUES('pr','a','wa','EXISTING-ORDER','APPROVED','actor-a','Existing supply');
 INSERT INTO procurement_lines(company_id,request_id,product_id,quantity,unit,factor) VALUES('a','pr','p',10,'CARTON',12);
 INSERT INTO procurement_orders(id,company_id,request_id,supplier_id) VALUES('po','a','pr','supplier');`);
 assert.equal((await f.query())[0]!.purchaseReference,null);
 assert.equal((await f.query(f.rie(),true))[0]!.purchaseReference,'EXISTING-ORDER');
 await f.db.exec("UPDATE procurement_orders SET cancelled=true WHERE id='po';UPDATE wms_positions SET quality_blocked=true WHERE company_id='a' AND warehouse_id='wa'");
 let [r]=await f.query(f.rie(),true);assert.equal(r!.purchaseReference,null);assert.equal(r!.available,'0');assert.equal(r!.risk,'CRITICAL');
 await f.db.exec(`UPDATE rie_canonical_entity_rows SET data=data||'{"InvoiceDate":"2026-10-22"}' WHERE entity_name='Invoice Items' AND data->>'InvoiceNo'='three'`);
 [r]=await f.query();assert.equal(r!.dailyDemand,null);assert.equal(r!.reason,'UOM');
});
