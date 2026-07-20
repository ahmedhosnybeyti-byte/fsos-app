import { Injectable } from "@nestjs/common";
import type { PlatformObservability } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";

// Phase 9 — Observability. Platform-health metrics only — explicitly NOT
// business analytics per the constitution ("لا تستخدم هذه البيانات لتحليل
// الأعمال"). All figures are aggregates over existing tables; nothing new
// is tracked to produce them.
@Injectable()
export class ObservabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(): Promise<PlatformObservability> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      companiesCount,
      usersCount,
      refreshRunsCount,
      refreshRunsLast24h,
      completedRuns,
      failedRuns,
      companiesWithActiveDataSource,
      securityOperationsCount,
      auditOperationsCount,
      durationAgg,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.user.count(),
      this.prisma.refreshRun.count(),
      this.prisma.refreshRun.count({ where: { createdAt: { gte: since24h } } }),
      this.prisma.refreshRun.count({ where: { status: "COMPLETED" } }),
      this.prisma.refreshRun.count({ where: { status: "FAILED" } }),
      this.prisma.dataSource.groupBy({ by: ["companyId"], where: { status: { in: ["ACTIVE", "CONNECTED"] } } }),
      this.prisma.auditLog.count({ where: { action: { startsWith: "identity." } } }),
      this.prisma.auditLog.count(),
      this.prisma.refreshRun.aggregate({ _avg: { durationMs: true }, where: { durationMs: { not: null } } }),
    ]);

    const finishedRuns = completedRuns + failedRuns;
    const companiesCountSafe = companiesCount || 1;

    return {
      companiesCount,
      usersCount,
      refreshRunsCount,
      refreshRunsLast24h,
      avgRefreshDurationMs: durationAgg._avg.durationMs ?? null,
      importSuccessRate: finishedRuns > 0 ? completedRuns / finishedRuns : null,
      dataSourceUsageRate: companiesWithActiveDataSource.length / companiesCountSafe,
      securityOperationsCount,
      auditOperationsCount,
      refreshErrorRate: finishedRuns > 0 ? failedRuns / finishedRuns : null,
      generatedAt: new Date(),
    };
  }
}
