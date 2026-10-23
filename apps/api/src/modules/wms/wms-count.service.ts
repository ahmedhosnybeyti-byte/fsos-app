import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@field-sales-os/database";
import { wmsCountDraftSchema, wmsCountStepSchema, wmsPageSchema, type WmsCountCandidate, type WmsCountDocument, type WmsCountSummary } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PrismaService } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";
import { WmsService } from "./wms.service";

const fields = Prisma.sql`d.id,d.reference,d.reason,d.status,d.version,
 to_char(d.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
 to_char(d.approved_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "approvedAt",
 (SELECT full_name FROM users WHERE company_id=d.company_id AND id=d.approved_by) AS "approvedBy"`;

@Injectable()
export class WmsCountService {
  constructor(private readonly prisma: PrismaService, private readonly access: WmsService, private readonly audit: AuditLogService) {}

  private page(input: unknown) {
    const parsed = wmsPageSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("WMS_INVALID_INPUT");
    return parsed.data;
  }

  async candidates(user: AuthenticatedUser, warehouse: string, input: unknown) {
    const { page, search } = this.page(input), c = await this.access.authorizedRead(user, warehouse);
    const rows = await this.prisma.$queryRaw<WmsCountCandidate[]>(Prisma.sql`
      SELECT s.batch_id AS "batchId",p.code AS "productCode",p.name AS "productName",b.code AS "batchCode",
       to_char(b.expiry_date,'YYYY-MM-DD') AS "expiryDate",p.base_unit AS "baseUnit",p.pieces_per_carton AS "piecesPerCarton",
       s.physical::text,CASE WHEN p.base_unit='PIECE' THEN round(s.physical/p.pieces_per_carton,6)::text END AS "physicalCartons",
       s.reserved::text,s.quarantined::text,s.revision::text
      FROM wms_positions s JOIN wms_batches b ON b.company_id=${c} AND b.id=s.batch_id
      JOIN wms_products p ON p.company_id=${c} AND p.id=b.product_id
      WHERE s.company_id=${c} AND s.warehouse_id=${warehouse} AND p.is_active
       AND (position(lower(${search}) in lower(p.code||' '||p.name||' '||b.code))>0)
      ORDER BY p.code,b.code,s.batch_id LIMIT 21 OFFSET ${(page - 1) * 20}`);
    return { items: rows.slice(0, 20), page, hasMore: rows.length > 20 };
  }

  async list(user: AuthenticatedUser, warehouse: string, input: unknown) {
    const { page, search } = this.page(input), c = await this.access.authorizedRead(user, warehouse);
    const rows = await this.prisma.$queryRaw<WmsCountSummary[]>(Prisma.sql`SELECT ${fields} FROM wms_counts d
      WHERE d.company_id=${c} AND d.warehouse_id=${warehouse} AND position(lower(${search}) in lower(d.reference))>0
      ORDER BY d.created_at DESC,d.id DESC LIMIT 21 OFFSET ${(page - 1) * 20}`);
    return { items: rows.slice(0, 20), page, hasMore: rows.length > 20 };
  }

  async detail(user: AuthenticatedUser, warehouse: string, id: string): Promise<WmsCountDocument> {
    const c = await this.access.authorizedRead(user, warehouse);
    const rows = await this.prisma.$queryRaw<WmsCountSummary[]>(Prisma.sql`SELECT ${fields} FROM wms_counts d
      WHERE d.company_id=${c} AND d.warehouse_id=${warehouse} AND d.id=${id}`);
    if (!rows[0]) throw new NotFoundException("WMS_DOCUMENT_NOT_FOUND");
    const lines = await this.prisma.$queryRaw<WmsCountDocument["lines"]>(Prisma.sql`
      SELECT l.id,l.batch_id AS "batchId",p.code AS "productCode",p.name AS "productName",b.code AS "batchCode",p.base_unit AS "baseUnit",p.pieces_per_carton AS "piecesPerCarton",
       l.input_unit AS unit,l.conversion_factor AS "conversionFactor",round(l.system_base/l.conversion_factor,6)::text AS "systemQuantity",
       l.counted_quantity::text AS "countedQuantity",round((l.counted_base-l.system_base)/l.conversion_factor,6)::text AS difference,
       (l.counted_base-l.system_base)::text AS "differenceBase",
       round(GREATEST(l.system_base-l.counted_base,0)/l.conversion_factor,6)::text AS shortage,
       round(GREATEST(l.counted_base-l.system_base,0)/l.conversion_factor,6)::text AS surplus,m.id AS "movementId"
      FROM wms_count_lines l JOIN wms_batches b ON b.company_id=${c} AND b.id=l.batch_id
      JOIN wms_products p ON p.company_id=${c} AND p.id=b.product_id
      LEFT JOIN wms_movements m ON m.company_id=${c} AND m.count_line_id=l.id
      WHERE l.company_id=${c} AND l.count_id=${id} ORDER BY p.code,b.code,l.id LIMIT 20`);
    const events = await this.prisma.$queryRaw<WmsCountDocument["events"]>(Prisma.sql`
      SELECT e.id,e.action,u.full_name AS "actorName",e.reason,to_char(e.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM wms_count_events e JOIN users u ON u.company_id=${c} AND u.id=e.actor_id
      WHERE e.company_id=${c} AND e.count_id=${id} ORDER BY e.created_at,e.id LIMIT 3`);
    return { ...rows[0], lines, events };
  }

  async command(user: AuthenticatedUser, warehouse: string, op: "CREATE" | "APPROVE" | "CANCEL", input: unknown, id?: string) {
    const parsed = (op === "CREATE" ? wmsCountDraftSchema : wmsCountStepSchema).safeParse(input);
    if (!parsed.success) throw new BadRequestException("WMS_INVALID_INPUT");
    const { idempotencyKey, ...data } = parsed.data;
    const payload = op === "CREATE" ? data : { ...data, id };
    return this.access.authorizedTransaction(user, warehouse, op === "APPROVE" ? "wms.count.approve" : "wms.count.create", async (tx, c) => {
      const rows = await tx.$queryRaw<{ result: { id: string; status: string; eventId: string } }[]>(Prisma.sql`
        SELECT wms_count_execute(${c},${warehouse},${op},${JSON.stringify(payload)}::jsonb,${user.userId},${idempotencyKey},${randomUUID()}) AS result`);
      const result = rows[0]!.result;
      await this.audit.record({ companyId: c, userId: user.userId, action: `wms.count.${op.toLowerCase()}`,
        entityType: "WmsCount", entityId: result.id, eventKey: `wms-count:${c}:${result.eventId}` }, tx);
      return result;
    });
  }
}
