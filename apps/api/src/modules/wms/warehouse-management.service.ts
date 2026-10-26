import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  createWarehouseSchema, updateWarehouseSchema, warehouseListQuerySchema,
  hasOperationalPermissions, type SfaWarehouse, type SfaWarehousePage,
} from "@field-sales-os/schemas";
import { Prisma } from "@field-sales-os/database";
import { PrismaService, type PrismaTx, isUniqueConstraintError } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { ZodType, ZodTypeDef } from "zod";

const fields = Prisma.sql`w.id,w.code,w.name,w.address,w.is_active AS "isActive"`;
function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException("WMS_INVALID_INPUT");
  return result.data;
}

@Injectable()
export class WarehouseManagementService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  private async company(tx: PrismaTx, user: AuthenticatedUser, lock = false) {
    if (!user.companyId || user.roleCode !== "WAREHOUSE_MANAGER" || !hasOperationalPermissions(user.roleCode, user.permissions,
      ["sfa.access", "wms.read", "wms.warehouses.manage"])) throw new ForbiddenException("Warehouse management delegation required");
    // Recheck mode, enabled module, tenant and active actor inside write transactions.
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT c.id FROM companies c
      JOIN company_operating_settings s ON s.company_id=c.id
      JOIN users u ON u.company_id=c.id AND u.id=${user.userId} AND u.status='ACTIVE'
      JOIN roles r ON r.id=u.role_id AND r.code='WAREHOUSE_MANAGER'
      WHERE c.id=${user.companyId} AND c.status='ACTIVE' AND c.feature_access->>'warehouse-core'='ENABLED'
      AND s.operating_mode IN ('SFA','FULL_ERP') ${lock ? Prisma.sql`FOR SHARE OF c,s,u` : Prisma.empty}`);
    if (!rows.length) throw new ForbiddenException("Warehouse management is unavailable");
    return user.companyId;
  }
  private assigned(company: string, userId: string) {
    return Prisma.sql`EXISTS(SELECT 1 FROM wms_warehouse_access a WHERE a.company_id=${company} AND a.warehouse_id=w.id AND a.user_id=${userId})`;
  }
  async list(user: AuthenticatedUser, input: unknown): Promise<SfaWarehousePage> {
    const { page, pageSize, search = "" } = parse(warehouseListQuerySchema, input);
    const company = await this.company(this.prisma, user);
    const rows = await this.prisma.$queryRaw<SfaWarehouse[]>(Prisma.sql`SELECT ${fields} FROM warehouses w
      WHERE w.company_id=${company} AND ${this.assigned(company, user.userId)}
      AND (position(lower(${search}) in lower(w.code))>0 OR position(lower(${search}) in lower(w.name))>0)
      ORDER BY w.id LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}`);
    return { items: rows.slice(0, pageSize), page, pageSize, hasMore: rows.length > pageSize };
  }
  async get(user: AuthenticatedUser, id: string): Promise<SfaWarehouse> {
    const company = await this.company(this.prisma, user);
    const rows = await this.prisma.$queryRaw<SfaWarehouse[]>(Prisma.sql`SELECT ${fields} FROM warehouses w
      WHERE w.company_id=${company} AND w.id=${id} AND ${this.assigned(company, user.userId)} LIMIT 1`);
    if (!rows.length) throw new NotFoundException("Warehouse not found");
    return rows[0]!;
  }
  private async mutation<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)`;
        return work(tx);
      }, { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      const pgCode = error && typeof error === "object" ? (error as { code?: string; meta?: { code?: string } }) : undefined;
      if (isUniqueConstraintError(error) || pgCode?.code === "23505" || (pgCode?.code === "P2010" && pgCode.meta?.code === "23505"))
        throw new ConflictException("Warehouse code already exists in your company");
      throw error;
    }
  }
  async create(user: AuthenticatedUser, input: unknown): Promise<SfaWarehouse> {
    const data = parse(createWarehouseSchema, input);
    return this.mutation(async tx => {
      const company = await this.company(tx, user, true), id = randomUUID();
      const rows = await tx.$queryRaw<SfaWarehouse[]>(Prisma.sql`INSERT INTO warehouses AS w(id,company_id,code,name,address,is_active,updated_at)
        VALUES(${id},${company},${data.code},${data.name},${data.address ?? null},${data.isActive ?? true},CURRENT_TIMESTAMP)
        RETURNING ${fields}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES(${company},${id},${user.userId})`);
      await this.audit.record({ companyId: company, userId: user.userId, action: "warehouse.created", entityType: "Warehouse", entityId: id,
        metadata: { creatorAssigned: true } }, tx);
      return rows[0]!;
    });
  }
  async update(user: AuthenticatedUser, id: string, input: unknown): Promise<SfaWarehouse> {
    const data = parse(updateWarehouseSchema, input);
    return this.mutation(async tx => {
      const company = await this.company(tx, user, true);
      // Lock the existing warehouse and exact assignment; concurrent revocation
      // cannot slip between authorization and registry mutation.
      const assigned = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT w.id FROM warehouses w
        JOIN wms_warehouse_access a ON a.company_id=w.company_id AND a.warehouse_id=w.id AND a.user_id=${user.userId}
        WHERE w.company_id=${company} AND w.id=${id} FOR UPDATE OF w FOR SHARE OF a`);
      if (!assigned.length) throw new NotFoundException("Warehouse not found");
      const changes: Prisma.Sql[] = [Prisma.sql`updated_at=CURRENT_TIMESTAMP`];
      if (data.code !== undefined) changes.push(Prisma.sql`code=${data.code}`);
      if (data.name !== undefined) changes.push(Prisma.sql`name=${data.name}`);
      if (data.address !== undefined) changes.push(Prisma.sql`address=${data.address}`);
      if (data.isActive !== undefined) changes.push(Prisma.sql`is_active=${data.isActive}`);
      const rows = await tx.$queryRaw<SfaWarehouse[]>(Prisma.sql`UPDATE warehouses AS w SET ${Prisma.join(changes)}
        WHERE w.company_id=${company} AND w.id=${id} AND ${this.assigned(company, user.userId)} RETURNING ${fields}`);
      if (!rows.length) throw new NotFoundException("Warehouse not found");
      await this.audit.record({ companyId: company, userId: user.userId, action: "warehouse.updated", entityType: "Warehouse", entityId: id }, tx);
      return rows[0]!;
    });
  }
}
