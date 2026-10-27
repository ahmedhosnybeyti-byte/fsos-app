// Isolated test helper only; no application module imports this file.
import { readFileSync } from "node:fs";
import { Prisma } from "@field-sales-os/database";
import { AuditLogService } from "../audit-log/audit-log.service";
import { WmsService } from "./wms.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

export const wmsPermissions=["sfa.access","wms.read","wms.products.manage","wms.opening.post","wms.access.manage"];
export const wmsUser=(companyId="a",userId="actor-a",roleCode="COMPANY_ADMIN"):AuthenticatedUser=>({companyId,userId,roleCode,permissions:[...wmsPermissions],email:"synthetic@example.invalid",mustChangePassword:false,orgUnitId:null} as AuthenticatedUser);
export const wmsFixtureSql=`
  CREATE TABLE companies(id text PRIMARY KEY);
  CREATE TABLE users(id text PRIMARY KEY,company_id text REFERENCES companies(id),status text DEFAULT 'ACTIVE',full_name text);
  CREATE TABLE permissions(id text PRIMARY KEY,code text UNIQUE,description text);
  CREATE TABLE test_audit(event_key text PRIMARY KEY,action text,entity_id text);
  INSERT INTO companies VALUES ('a'),('b');
  INSERT INTO users(id,company_id,full_name) VALUES ('actor-a','a','Admin A'),('actor-b','b','Admin B'),('clerk-a','a','Clerk A');
`;
export const wmsWarehouseSql=`INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES
  ('wa','a','MAIN','Warehouse A',now()),('wa2','a','OTHER','Warehouse A2',now()),('wb','b','MAIN','Warehouse B',now());`;
export async function wmsFixture(db:any) {
  await db.exec(wmsFixtureSql);
  await db.exec(readFileSync("packages/database/prisma/migrations/20261019120000_sfa_warehouses/migration.sql","utf8"));
  await db.exec(readFileSync("packages/database/prisma/migrations/20261020100000_wms_phase01/migration.sql","utf8"));
  await db.exec(readFileSync("packages/database/prisma/migrations/20261020150000_wms_phase02/migration.sql","utf8"));
  await db.exec(readFileSync("packages/database/prisma/migrations/20261021100000_wms_core_closure/migration.sql","utf8"));
  await db.exec(wmsWarehouseSql);
  return wmsAdapter(db);
}
export function wmsAdapter(db:any,failAudit=false) {
  const prisma=wmsPersistence(db,failAudit);return new WmsService(prisma,new AuditLogService(prisma));
}
export function wmsPersistence(db:any,failAudit=false) {
  function adapter(connection:any):any {
    const run=async (sql:any,...values:any[])=>{
      const q=Array.isArray(sql)?Prisma.sql(sql as unknown as TemplateStringsArray,...values):sql;
      return connection.query(q.text,q.values);
    };
    const tx={
      $queryRaw:async(sql:any,...values:any[])=>(await run(sql,...values)).rows,
      $executeRaw:async(sql:any,...values:any[])=>(await run(sql,...values)).affectedRows,
      auditLog:{upsert:async({create}:any)=>{
        if(failAudit)throw new Error("synthetic audit failure");
        await connection.query(`INSERT INTO test_audit(event_key,action,entity_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[create.eventKey,create.action,create.entityId]);
      }},
      $transaction:async(work:any)=>db.transaction((connection:any)=>work(adapter(connection))),
    };
    return tx;
  }
  return adapter(db);
}
