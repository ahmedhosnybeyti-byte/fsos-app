// Accounting-only isolated fixture. Never imports or reruns WMS/Canonical.
import { readFileSync } from "node:fs";
import { Prisma } from "@field-sales-os/database";
import { accountingPermissions } from "@field-sales-os/schemas";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AccountingService } from "./accounting.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
export const accountingMigration="packages/database/prisma/migrations/20261021160000_accounting_core/migration.sql";
export const accountingFixtureSql=`
 CREATE TABLE companies(id text PRIMARY KEY);
 CREATE TABLE users(id text PRIMARY KEY,company_id text REFERENCES companies(id),status text DEFAULT 'ACTIVE',UNIQUE(company_id,id));
 CREATE TABLE permissions(id text PRIMARY KEY,code text UNIQUE,description text);
 CREATE TABLE company_operating_settings(company_id text PRIMARY KEY REFERENCES companies(id),operating_mode text NOT NULL DEFAULT 'ANALYSIS_ONLY');
 CREATE TABLE test_audit(event_key text PRIMARY KEY,company_id text,actor_id text,action text,entity_id text,metadata jsonb);
 INSERT INTO companies VALUES('demo'),('isolation-sentinel');
 INSERT INTO users(id,company_id) VALUES('demo-admin','demo'),('demo-manager','demo'),('sentinel-admin','isolation-sentinel');
 INSERT INTO company_operating_settings VALUES('demo','FULL_ERP'),('isolation-sentinel','FULL_ERP');`;
export const accountingUser=(companyId="demo",userId="demo-admin"):AuthenticatedUser=>({companyId,userId,roleCode:"COMPANY_ADMIN",permissions:["sfa.access",...accountingPermissions],email:"accounting@example.invalid",mustChangePassword:false,orgUnitId:null});
export function accountingPersistence(db:any,failAudit=false):any {
 function adapter(connection:any):any {
  const run=(sql:any,...values:any[])=>{const q=Array.isArray(sql)?Prisma.sql(sql as unknown as TemplateStringsArray,...values):sql;return connection.query(q.text,q.values);};
  return {$queryRaw:async(sql:any,...values:any[])=>(await run(sql,...values)).rows,$executeRaw:async(sql:any,...values:any[])=>(await run(sql,...values)).affectedRows,
   auditLog:{upsert:async({create:c}:any)=>{if(failAudit)throw Error("synthetic accounting audit failure");await connection.query(`INSERT INTO test_audit VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,[c.eventKey,c.companyId,c.userId,c.action,c.entityId,JSON.stringify(c.metadata??{})]);}},
   $transaction:(work:any)=>db.transaction((conn:any)=>work(adapter(conn)))};
 }return adapter(db);
}
export function accountingAdapter(db:any,failAudit=false) {const p=accountingPersistence(db,failAudit);return new AccountingService(p,new AuditLogService(p));}
export async function accountingFixture(db:any) {await db.exec(accountingFixtureSql);await db.exec(readFileSync(accountingMigration,"utf8"));return accountingAdapter(db);}
