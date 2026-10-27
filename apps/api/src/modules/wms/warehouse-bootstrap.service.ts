import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";

const id = z.string().trim().min(1).max(160);
const inputSchema = z.object({ managerUserId: id, reason: z.string().trim().min(3).max(300) }).strict();

@Injectable()
export class WarehouseBootstrapService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}
  async assign(actor: AuthenticatedUser, companyId: string, warehouseId: string, input: unknown) {
    if (actor.roleCode !== "SUPER_ADMIN" || actor.companyId !== null || !actor.permissions.includes("platform.admin"))
      throw new ForbiddenException("Platform administrator identity required");
    const parsed = inputSchema.safeParse(input), company = id.safeParse(companyId), warehouse = id.safeParse(warehouseId);
    if (!parsed.success || !company.success || !warehouse.success) throw new BadRequestException("WMS_INVALID_INPUT");
    const { managerUserId, reason } = parsed.data;
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)`;
      const proof = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
        WHERE u.id=${actor.userId} AND u.company_id IS NULL AND u.status='ACTIVE' AND r.code='SUPER_ADMIN' FOR SHARE OF u`);
      if (!proof.length) throw new ForbiddenException("Platform administrator identity required");
      const scope = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT c.id FROM companies c
        JOIN company_operating_settings s ON s.company_id=c.id WHERE c.id=${company.data} AND c.status='ACTIVE'
        AND c.feature_access->>'warehouse-core'='ENABLED' AND s.operating_mode IN ('SFA','FULL_ERP') FOR SHARE OF c,s`);
      if (!scope.length) throw new ForbiddenException("Warehouse company is unavailable");
      // Serialize every initial assignment for this manager, including attempts
      // to bootstrap different warehouses concurrently.
      const manager = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id
        WHERE u.id=${managerUserId} AND u.company_id=${company.data} AND u.status='ACTIVE'
        AND r.code='WAREHOUSE_MANAGER' FOR UPDATE OF u`);
      if (!manager.length) throw new NotFoundException("Active company warehouse manager not found");
      const target = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM warehouses
        WHERE company_id=${company.data} AND id=${warehouse.data} AND is_active FOR SHARE`);
      if (!target.length) throw new NotFoundException("Active company warehouse not found");
      const grants = await tx.$queryRaw<{ warehouseId: string }[]>(Prisma.sql`SELECT warehouse_id AS "warehouseId" FROM wms_warehouse_access
        WHERE company_id=${company.data} AND user_id=${managerUserId} ORDER BY warehouse_id LIMIT 2`);
      if (grants.length) {
        if (grants.length === 1 && grants[0]!.warehouseId === warehouse.data) return { granted: true, alreadyAssigned: true };
        throw new ConflictException("WMS_MANAGER_ALREADY_ASSIGNED");
      }
      await tx.$executeRaw(Prisma.sql`INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id)
        VALUES(${company.data},${warehouse.data},${managerUserId})`);
      await this.audit.record({ companyId: company.data, userId: actor.userId, action: "wms.manager.bootstrap",
        entityType: "Warehouse", entityId: warehouse.data, metadata: { managerUserId, reason } }, tx);
      return { granted: true, alreadyAssigned: false };
    }, { maxWait: 5000, timeout: 15000 });
  }
}
