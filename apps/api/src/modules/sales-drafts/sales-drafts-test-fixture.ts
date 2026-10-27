// Synthetic isolated fixture shared by SQL semantics and explicit native races.
import { readFileSync } from "node:fs";
import { Prisma } from "@field-sales-os/database";
import { wmsFixture,wmsPersistence } from "../wms/wms-test-fixture";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SalesDraftsService } from "./sales-drafts.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
export const draftUser=(companyId="a",userId="clerk-a"):AuthenticatedUser=>({companyId,userId,roleCode:"SALES_REP",permissions:["sfa.access","visits.execute","sales.drafts.manage"],email:`${userId}@example.invalid`,orgUnitId:null,mustChangePassword:false});
export const draftMigration="packages/database/prisma/migrations/20261022140000_sales_drafts/migration.sql";
export async function draftFixture(db:any){
 await wmsFixture(db);
 await db.exec(`ALTER TABLE users ADD UNIQUE(company_id,id);
 UPDATE company_operating_settings SET operating_mode=CASE WHEN company_id='b' THEN 'FULL_ERP' ELSE 'SFA' END;`);
 for(const migration of ["20261021160000_accounting_core","20261021180000_accounting_subledgers","20261021200000_wms_physical_counts","20261021210000_wms_quarantine","20261022120000_visit_execution","20261022140000_sales_drafts"])
  await db.exec(readFileSync(`packages/database/prisma/migrations/${migration}/migration.sql`,"utf8"));
 await db.exec(`CREATE TABLE reference_sentinel(id text PRIMARY KEY,data jsonb);
  INSERT INTO reference_sentinel VALUES('history','{"InvoiceNo":"HIST-1","Amount":100}');
  INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('a','wa','clerk-a'),('b','wb','actor-b');
  INSERT INTO wms_products(id,company_id,code,name,base_unit,pieces_per_carton,track_batches) VALUES('p','a','P','صنف الاختبار','PIECE',12,true),('kg','a','KG','وزن','KG',1,false),('inactive','a','OFF','Inactive','PIECE',1,false),('pb','b','P','Foreign','PIECE',12,true);
  UPDATE wms_products SET is_active=false WHERE id='inactive';
  INSERT INTO wms_batches(id,company_id,product_id,code,expiry_date) VALUES('lot','a','p','GOOD','2099-01-01'),('expired','a','p','EXPIRED','2020-01-01');
  INSERT INTO wms_positions(company_id,warehouse_id,batch_id,physical) VALUES('a','wa','lot',120),('a','wa','expired',100);
  INSERT INTO wms_custody_positions(company_id,warehouse_id,batch_id,recipient_id,quantity) VALUES('a','wa','lot','clerk-a',24),('a','wa','expired','clerk-a',100),('a','wa','lot','actor-a',900);
  INSERT INTO accounting_books(company_id) VALUES('a');
  INSERT INTO accounting_accounts(company_id,code,name,type) VALUES('a','AR','Customer AR','ASSET'),('a','EQ','Equity','EQUITY');
  INSERT INTO accounting_parties(id,company_id,kind,code,name,account_code) VALUES('customer','a','CUSTOMER','C1','Synthetic customer','AR');
  SELECT accounting_post_voucher('a','actor-a','opening','customer','OPENING','{"date":"2026-10-22","amount":"100","equityAccountCode":"EQ","reference":"OPEN","reason":"Synthetic opening"}', 'voucher','journal',NULL);
  INSERT INTO visit_executions(id,company_id,rep_id,customer_code,customer_name,rep_name,entry_source,request_key) VALUES
   ('visit','a','clerk-a','C1','عميل اختبار','مندوب اختبار','VISIT_COPILOT','start'),
   ('other-visit','a','actor-a','C1','Other','Other','VISIT_COPILOT','other'),
   ('foreign-visit','b','actor-b','C1','Foreign','Foreign','VISIT_COPILOT','foreign');`);
}
export function draftAdapter(db:any,failAudit=false,routes={allowed:true}){
 const prisma=wmsPersistence(db,failAudit);
 const rie={queryCanonicalRecords:async(q:any)=>({records:routes.allowed&&q.scope.customer.values[0]==="C1"?[{CustomerCode:"C1"}]:[]})};
 return {service:new SalesDraftsService(prisma,rie as never,new AuditLogService(prisma)),prisma,routes};
}
export async function protectedSnapshot(db:any){
 const tables=["wms_products","wms_batches","wms_positions","wms_movements","wms_custody_positions","wms_allocations","wms_load_requests","wms_customer_policies","accounting_books","accounting_accounts","accounting_parties","accounting_lines","accounting_journals","accounting_commands","accounting_vouchers","accounting_voucher_commands","reference_sentinel"];
 const result:Record<string,unknown>={};for(const table of tables)result[table]=(await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') AS rows FROM ${table} t`)).rows[0].rows;
 return result;
}
