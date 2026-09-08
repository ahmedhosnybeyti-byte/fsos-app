import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import type { RefreshType } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PlatformEventsService } from "../governance/platform-events.service";
import { DataSourceContextService } from "../data-source-platform/data-source-context.service";
import { DataSourceValidationService } from "../data-source-platform/data-source-validation.service";
import { computeHealthStatus } from "../data-source-platform/data-source-health.util";
import { ImportEngineService } from "./import-engine.service";

// Phase 8 — Refresh Orchestrator + Refresh Queue.
//
// Interpretation note (documented, not hidden): "Refresh Queue" in the
// constitution implies asynchronous, worker-based execution with real
// scheduling/load distribution. Introducing a job queue (BullMQ/Redis or
// similar) is real new infrastructure with its own operational cost, and
// isn't needed to satisfy the MVP's explicit scope ("Full Refresh only").
// The HTTP path only validates ownership and enqueues a RefreshRun. A local
// worker claims and executes it, keeping the existing run/status model as the
// durable queue without introducing separate queue infrastructure.
@Injectable()
export class RefreshOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly contextService: DataSourceContextService,
    private readonly validationService: DataSourceValidationService,
    private readonly importEngine: ImportEngineService,
    private readonly platformEventsService: PlatformEventsService,
  ) {}

  async requestRefresh(companyId: string, dataSourceId: string, actorUserId: string | null, refreshType: RefreshType = "FULL") {
    // Ownership is established before creating a run or touching the source.
    // Never use an unscoped source id as an authorization boundary.
    const source = await this.prisma.dataSource.findFirst({
      where: { id: dataSourceId, companyId },
      select: { id: true },
    });
    if (!source) {
      throw new NotFoundException("Data source not found");
    }

    try {
      // The partial unique index on active runs preserves duplicate
      // prevention while a run is waiting or executing.
      return await this.prisma.refreshRun.create({
        data: { companyId, dataSourceId, triggeredByUserId: actorUserId, refreshType, status: "QUEUED" },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A refresh is already in progress for this data source");
      }
      throw error;
    }
  }

  /** Atomically claims one queued run, then executes the unchanged workflow. */
  async processQueuedRun(runId: string): Promise<boolean> {
    const startedAt = new Date();
    const claim = await this.prisma.refreshRun.updateMany({
      where: { id: runId, status: "QUEUED" },
      data: { status: "RUNNING", startedAt },
    });
    if (claim.count === 0) return false;

    const run = await this.prisma.refreshRun.findUniqueOrThrow({
      where: { id: runId },
      select: { id: true, companyId: true, dataSourceId: true, triggeredByUserId: true },
    });
    const { companyId, dataSourceId, triggeredByUserId: actorUserId } = run;

    try {
      await this.platformEventsService.emit("RefreshStarted", {
        companyId,
        userId: actorUserId,
        entityType: "RefreshRun",
        entityId: run.id,
        metadata: { dataSourceId },
      });

      // Refresh Validation — reuses Data Source Validation as its first step,
      // exactly as the constitution's workflow diagram shows.
      const validation = await this.validationService.validate(companyId, dataSourceId);

      if (!validation.valid) {
        const completedAt = new Date();
        const failureMessage = validation.checks
          .filter((c) => !c.passed)
          .map((c) => c.message ?? c.name)
          .join("; ");

        const [updatedRun] = await Promise.all([
          this.prisma.refreshRun.update({
            where: { id: run.id },
            data: {
              status: "FAILED",
              completedAt,
              durationMs: completedAt.getTime() - startedAt.getTime(),
              errorCount: validation.checks.filter((c) => !c.passed).length,
              dataQualityScore: 0,
              resultSummary: {
                totalCategories: 0,
                matchedCategories: [],
                missingFiles: [],
                invalidSchema: [],
                validationScore: 0,
                structuralValidationError: failureMessage,
              },
            },
          }),
          this.prisma.dataSource.updateMany({
            where: { id: dataSourceId, companyId },
            data: { lastValidatedAt: completedAt, healthStatus: "ERROR" },
          }),
          this.auditLogService.record({
            companyId,
            userId: actorUserId,
            action: "refresh.failed",
            entityType: "DataSource",
            entityId: dataSourceId,
            metadata: { runId: run.id, reason: failureMessage },
          }),
        ]);
        await this.platformEventsService.emit("RefreshFailed", {
          companyId,
          userId: actorUserId,
          entityType: "RefreshRun",
          entityId: run.id,
          metadata: { dataSourceId, reason: failureMessage },
        });
        return Boolean(updatedRun);
      }

      const context = await this.contextService.build(companyId, dataSourceId);
      const report = await this.importEngine.run(context);
      const completedAt = new Date();

      const [updatedRun] = await Promise.all([
        this.prisma.refreshRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            importedRecords: report.matchedCategories.length,
            errorCount: report.missingFiles.length + report.invalidSchema.length,
            dataQualityScore: report.validationScore,
            resultSummary: report,
          },
        }),
        this.prisma.dataSource.updateMany({
          where: { id: dataSourceId, companyId },
          data: {
            lastRefreshAt: completedAt,
            lastValidatedAt: completedAt,
            healthStatus: computeHealthStatus({ structuralValid: true, validationScore: report.validationScore }),
          },
        }),
        this.auditLogService.record({
          companyId,
          userId: actorUserId,
          action: "refresh.completed",
          entityType: "DataSource",
          entityId: dataSourceId,
          metadata: { runId: run.id, validationScore: report.validationScore, missingFiles: report.missingFiles },
        }),
      ]);

      await this.platformEventsService.emit("RefreshCompleted", {
        companyId,
        userId: actorUserId,
        entityType: "RefreshRun",
        entityId: run.id,
        metadata: { dataSourceId, validationScore: report.validationScore },
      });

      return Boolean(updatedRun);
    } catch (error) {
      // Persist a terminal state before releasing this worker slot so an
      // active-run claim can never remain stranded after a thrown step.
      const completedAt = new Date();
      await this.prisma.refreshRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          errorCount: 1,
          resultSummary: { unexpectedError: error instanceof Error ? error.message : "Refresh failed" },
        },
      });
      return true;
    }
  }

  /**
   * A RUNNING row older than the recovery cutoff belongs to a process that
   * died before writing a terminal state. Requeue it; its existing active-run
   * claim stays intact and the worker will atomically claim it again.
   */
  async recoverStaleRunningRuns(olderThan: Date): Promise<number> {
    const recovered = await this.prisma.refreshRun.updateMany({
      where: { status: "RUNNING", startedAt: { lt: olderThan } },
      data: { status: "QUEUED", startedAt: null },
    });
    return recovered.count;
  }
}
