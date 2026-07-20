import { EventEmitter } from "node:events";
import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type { PlatformEventName } from "@field-sales-os/schemas";
import { AuditLogService } from "../audit-log/audit-log.service";

export interface PlatformEventPayload {
  companyId: string;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

// Phase 9 — Platform Events. A minimal in-process pub/sub (Node's built-in
// EventEmitter — no new npm dependency/infra) standing in for the
// constitution's "standard events for integration between FSOS platforms."
// Every emit() also durably records the event into the existing AuditLog
// (reuse-before-rewrite, same as every prior phase's "history" concept) so
// events are queryable/auditable even before any real subscriber exists.
//
// Deliberately NOT a message broker: the constitution itself says platforms
// should adopt this "whenever possible" as groundwork for a *future*
// event-driven architecture, not that a broker must exist today. Emitting
// is fire-and-forget and defensively wrapped — it can never throw back into
// the caller, exactly like AuditLogService.record().
@Injectable()
export class PlatformEventsService {
  private readonly logger = new Logger(PlatformEventsService.name);
  private readonly emitter = new EventEmitter();

  constructor(private readonly auditLogService: AuditLogService) {
    this.emitter.setMaxListeners(50);
  }

  on(eventName: PlatformEventName, handler: (payload: PlatformEventPayload) => void) {
    this.emitter.on(eventName, handler);
  }

  async emit(eventName: PlatformEventName, payload: PlatformEventPayload) {
    try {
      this.emitter.emit(eventName, payload);
    } catch (err) {
      this.logger.error(`In-process listener for "${eventName}" threw`, err instanceof Error ? err.stack : undefined);
    }

    await this.auditLogService.record({
      companyId: payload.companyId,
      userId: payload.userId ?? null,
      action: `platform.event.${eventName}`,
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadata: payload.metadata,
    });
  }
}
