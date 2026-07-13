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
