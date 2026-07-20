import { Module } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD } from "@nestjs/core";
import { AppConfigModule } from "./common/config";
import { PrismaModule } from "./common/prisma";
import { HealthModule } from "./modules/health/health.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { SubscriptionActiveGuard } from "./common/guards/subscription-active.guard";
import { AuthModule } from "./modules/auth/auth.module";
import { RolesModule } from "./modules/roles/roles.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { UsersModule } from "./modules/users/users.module";
import { PlansModule } from "./modules/plans/plans.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { AuditLogModule } from "./modules/audit-log/audit-log.module";
import { FilesModule } from "./modules/files/files.module";
import { GptModule } from "./modules/gpt/gpt.module";
import { UsageAnalyticsModule } from "./modules/usage-analytics/usage-analytics.module";
import { ScheduledTasksModule } from "./modules/scheduled-tasks/scheduled-tasks.module";
import { PlatformSettingsModule } from "./modules/platform-settings/platform-settings.module";
import { AnalysisStudioModule } from "./modules/analysis-studio/analysis-studio.module";
import { RoutePlanningModule } from "./modules/route-planning/route-planning.module";
import { HeatmapModule } from "./modules/heatmap/heatmap.module";
import { GeoIntelligenceModule } from "./modules/geo-intelligence/geo-intelligence.module";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { TeamPerformanceModule } from "./modules/team-performance/team-performance.module";
import { CustomerSimilarityModule } from "./modules/customer-similarity/customer-similarity.module";
import { VisitEfficiencyModule } from "./modules/visit-efficiency/visit-efficiency.module";
import { TargetsModule } from "./modules/targets/targets.module";
import { SgiModule } from "./modules/sgi/sgi.module";
import { CustomerLocationModule } from "./modules/customer-location/customer-location.module";
import { EmployeesModule } from "./modules/employees/employees.module";
import { DataSourcesModule } from "./modules/data-sources/data-sources.module";
import { DataSourcePlatformModule } from "./modules/data-source-platform/data-source-platform.module";
import { RefreshPlatformModule } from "./modules/refresh-platform/refresh-platform.module";
import { GovernanceModule } from "./modules/governance/governance.module";
import { RieModule } from "./modules/rie/rie.module";
import { VisitCopilotModule } from "./modules/visit-copilot/visit-copilot.module";

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    HealthModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    AuthModule,
    RolesModule,
    CompaniesModule,
    UsersModule,
    PlansModule,
    SubscriptionsModule,
    PaymentsModule,
    AuditLogModule,
    FilesModule,
    GptModule,
    UsageAnalyticsModule,
    ScheduledTasksModule,
    PlatformSettingsModule,
    AnalysisStudioModule,
    RoutePlanningModule,
    HeatmapModule,
    GeoIntelligenceModule,
    AssistantModule,
    TeamPerformanceModule,
    CustomerSimilarityModule,
    VisitEfficiencyModule,
    TargetsModule,
    SgiModule,
    CustomerLocationModule,
    EmployeesModule,
    DataSourcesModule,
    DataSourcePlatformModule,
    RefreshPlatformModule,
    GovernanceModule,
    RieModule,
    VisitCopilotModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: authenticate -> authorize by role -> authorize by
    // subscription status. @Public() short-circuits JwtAuthGuard; the later
    // two guards then see no req.user and simply allow (nothing to check).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: SubscriptionActiveGuard },
  ],
})
export class AppModule {}
