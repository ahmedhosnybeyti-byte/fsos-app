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
// So for this MVP the orchestrator runs synchronously within the HTTP
// request, and "the Queue" is reduced to its one functional requirement
// that actually matters at this scale: preventing two conflicting Refresh
// runs against the same Data Source at once (checked via an open
// QUEUED/RUNNING RefreshRun row). A real background queue is a natural,
// separately-approved upgrade once refreshes need to run on a schedule or
// take long enough to exceed a request timeout.
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

    const startedAt = new Date();
    let run: { id: string };
    try {
      // The partial unique index on active runs is the atomic claim. A
      // find-then-create check can allow two concurrent requests through.
      run = await this.prisma.refreshRun.create({
        data: { companyId, dataSourceId, triggeredByUserId: actorUserId, refreshType, status: "RUNNING", startedAt },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A refresh is already in progress for this data source");
      }
      throw error;
    }

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
        return updatedRun;
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

      return updatedRun;
    } catch (error) {
      // A synchronous refresh has no worker to clean up after a thrown
      // validation/import/event error. Persist the terminal state before the
      // error escapes so an active-run claim can never remain stranded.
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
      throw error;
    }
  }
}
