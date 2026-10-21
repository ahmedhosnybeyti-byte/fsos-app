// Setup for new contracts only. Loads the Phase 1 schema, not its test suites.
import { readFileSync } from "node:fs";
import { accountingSubledgerPermissions } from "@field-sales-os/schemas";
import { accountingFixture,accountingPersistence,accountingUser } from "./accounting-test-fixture";
import { AccountingService } from "./accounting.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AccountingSubledgerService } from "./accounting-subledger.service";
export const subledgerMigration="packages/database/prisma/migrations/20261021180000_accounting_subledgers/migration.sql";
export const subledgerUser=(company="demo",actor="demo-admin")=>({...accountingUser(company,actor),permissions:[...accountingUser().permissions,...accountingSubledgerPermissions]});
export function subledgerAdapter(db:any,failAudit=false){const p=accountingPersistence(db,failAudit),audit=new AuditLogService(p),core=new AccountingService(p,audit);return {core,service:new AccountingSubledgerService(p,core,audit)};}
export async function subledgerFixture(db:any){await accountingFixture(db);await db.exec(readFileSync(subledgerMigration,"utf8"));return subledgerAdapter(db);}
