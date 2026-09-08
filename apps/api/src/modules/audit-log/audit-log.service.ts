import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@field-sales-os/database";
import { PrismaService, type PrismaTx } from "../../common/prisma";

export interface AuditLogEntry {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  // A caller can keep this key across a retried application operation. When
  // omitted, record() creates one and reuses it for all persistence retries.
  eventKey?: string;
}

type AuditLogPersistence = {
  upsert(args: {
    where: { eventKey: string };
    create: {
      eventKey: string;
      companyId: string | null;
      userId: string | null;
      action: string;
      entityType?: string;
      entityId?: string;
      metadata?: Prisma.InputJsonValue;
      ipAddress?: string;
    };
    update: Record<string, never>;
  }): Promise<unknown>;
};

// Generic, reusable across every module — callers just supply an action
// string and optional entity/metadata, no schema change needed for new
// action types.
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private static readonly maxAttempts = 3;

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry, tx: PrismaTx = this.prisma) {
    const eventKey = entry.eventKey ?? randomUUID();
    // Prisma's generated client is refreshed by the migration deployment. The
    // narrow local contract keeps this module compatible while that generated
    // type is still from the preceding schema version.
    const auditLog = tx.auditLog as unknown as AuditLogPersistence;
    const persist = () => auditLog.upsert({
      where: { eventKey },
      create: {
        eventKey,
        companyId: entry.companyId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress,
      },
      // An already persisted event is the successful result of a retry. Do
      // not rewrite its payload or create a duplicate record.
      update: {},
    });

    // A transaction failure must abort its enclosing business transaction;
    // retrying a transaction client after a database error is unsafe.
    if (tx !== this.prisma) return persist();

    let lastError: unknown;
    for (let attempt = 1; attempt <= AuditLogService.maxAttempts; attempt += 1) {
      try {
        return await persist();
      } catch (error) {
        lastError = error;
        if (!this.isTransientPersistenceError(error) || attempt === AuditLogService.maxAttempts) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 25 * attempt));
      }
    }

    // Do not silently lose durable audit evidence. Callers receive the error
    // after bounded transient retries, while operational logs retain context.
    this.logger.error(
      `Failed to persist audit log for action "${entry.action}" after retry`,
      lastError instanceof Error ? lastError.stack : undefined,
    );
    throw lastError;
  }

  private isTransientPersistenceError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError
      && ["P1001", "P1002", "P1008", "P1017"].includes(error.code);
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
