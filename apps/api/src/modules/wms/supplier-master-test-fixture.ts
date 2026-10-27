// Isolated synthetic fixtures only. Never imported by the application module.
import { randomUUID } from "node:crypto";
import { AuditLogService } from "../audit-log/audit-log.service";
import { WmsService } from "./wms.service";
import { SupplierMasterService } from "./supplier-master.service";
import { wmsPersistence, wmsUser } from "./wms-test-fixture";

/** wmsFixture(db), including the operational supplier migration, must run first. */
export async function supplierMasterFixture(db: any, failAudit = false) {
  const prisma = wmsPersistence(db, failAudit), audit = new AuditLogService(prisma);
  const access = new WmsService(prisma, audit), service = new SupplierMasterService(prisma, access, audit);
  await db.exec(`INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES('a','wa','clerk-a') ON CONFLICT DO NOTHING`);
  const user = { ...wmsUser("a", "clerk-a", "WAREHOUSE_KEEPER"), permissions: ["sfa.access", "wms.read", "wms.receiving.create"] };
  return { service, access, user };
}
export function supplierWaterFixture(service: SupplierMasterService, user: ReturnType<typeof wmsUser>, warehouse = "wa") {
  return service.create(user, warehouse, { code: "WATER-DEMO", name: "مورد مياه تجريبي", idempotencyKey: randomUUID() });
}
