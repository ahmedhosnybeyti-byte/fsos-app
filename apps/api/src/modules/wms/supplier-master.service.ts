import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@field-sales-os/database";
import { wmsPageSchema } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";
import { WmsService } from "./wms.service";

export const supplierCreateSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/),
  name: z.string().trim().min(1).max(160), idempotencyKey: z.string().uuid(),
}).strict();
export interface SupplierIdentity { id: string; code: string; name: string }

@Injectable()
export class SupplierMasterService {
  constructor(private readonly prisma: PrismaService, private readonly access: WmsService, private readonly audit: AuditLogService) {}

  private async admitted(tx: PrismaTx, user: AuthenticatedUser, company: string) {
    const rows = await tx.$queryRaw<{ company_id: string }[]>(Prisma.sql`SELECT s.company_id
      FROM company_operating_settings s JOIN users u ON u.company_id=s.company_id AND u.id=${user.userId} AND u.status='ACTIVE'
      WHERE s.company_id=${company} AND s.operating_mode IN ('SFA','FULL_ERP')`);
    if (!rows.length) throw new ForbiddenException("Supplier operational access required");
  }

  async list(user: AuthenticatedUser, warehouse: string, input: unknown) {
    const parsed = wmsPageSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("WMS_INVALID_INPUT");
    const company = await this.access.authorizedRead(user, warehouse);
    await this.admitted(this.prisma, user, company);
    const { page, search } = parsed.data;
    const rows = await this.prisma.$queryRaw<SupplierIdentity[]>(Prisma.sql`SELECT id,code,name FROM wms_suppliers
      WHERE company_id=${company} AND (position(lower(${search}) in lower(name))>0 OR position(lower(${search}) in lower(code))>0)
      ORDER BY name,id LIMIT 21 OFFSET ${(page - 1) * 20}`);
    return { items: rows.slice(0, 20), page, hasMore: rows.length > 20 };
  }

  async create(user: AuthenticatedUser, warehouse: string, input: unknown): Promise<SupplierIdentity> {
    const parsed = supplierCreateSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("WMS_INVALID_INPUT");
    const data = parsed.data;
    return this.access.authorizedTransaction(user, warehouse, "wms.receiving.create", async (tx, company) => {
      await this.admitted(tx, user, company);
      // A retry returns the same identity, without a duplicate supplier or audit.
      const inserted = await tx.$queryRaw<SupplierIdentity[]>(Prisma.sql`INSERT INTO wms_suppliers(id,company_id,code,name,idempotency_key)
        VALUES(${randomUUID()},${company},${data.code},${data.name},${data.idempotencyKey})
        ON CONFLICT DO NOTHING RETURNING id,code,name`);
      const supplier = inserted[0] ?? (await tx.$queryRaw<SupplierIdentity[]>(Prisma.sql`SELECT id,code,name FROM wms_suppliers
        WHERE company_id=${company} AND idempotency_key=${data.idempotencyKey}`))[0];
      if (!supplier) throw new ConflictException("WMS_DUPLICATE_REFERENCE");
      if (supplier.code !== data.code || supplier.name !== data.name) throw new ConflictException("WMS_IDEMPOTENCY_CONFLICT");
      if (inserted.length) await this.audit.record({ companyId: company, userId: user.userId, action: "wms.supplier.created",
        entityType: "WmsSupplier", entityId: supplier.id, eventKey: `wms-supplier:${company}:${data.idempotencyKey}` }, tx);
      return supplier;
    });
  }
}
