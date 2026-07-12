import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import { PrismaService, type PrismaTx } from "../../common/prisma";

export interface AuditLogEntry {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}

// Generic, reusable across every module — callers just supply an action
// string and optional entity/metadata, no schema change needed for new
// action types.
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry, tx: PrismaTx = this.prisma) {
    try {
      await tx.auditLog.create({
        data: {
          companyId: entry.companyId ?? null,
          userId: entry.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata,
          ipAddress: entry.ipAddress,
        },
      });
    } catch (err) {
      // Audit logging must never break the primary request flow.
      this.logger.error(
        `Failed to write audit log for action "${entry.action}"`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  async list(params: { companyId?: string; page: number; pageSize: number }) {
    const { companyId, page, pageSize } = params;
    const where = companyId ? { companyId } : {};
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
