import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { FilesModule } from "../files/files.module";
import { UsageAnalyticsModule } from "../usage-analytics/usage-analytics.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AnalysisStudioModule } from "../analysis-studio/analysis-studio.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
// Only for CanonicalHierarchyResolverService (ADR-001 migration — hierarchy
// scoping is now resolved the same way RIE does it, via the Canonical
// Routes/Employees Datasets, not a per-file manual config). GptService still
// reads dataset bytes through FilesModule directly, unchanged.
import { RieModule } from "../rie/rie.module";
import { GptService } from "./gpt.service";
import { GptController } from "./gpt.controller";

@Module({
  imports: [SubscriptionsModule, FilesModule, UsageAnalyticsModule, AuditLogModule, AnalysisStudioModule, PlatformSettingsModule, RieModule],
  providers: [GptService],
  controllers: [GptController],
  exports: [GptService],
})
export class GptModule {}
