import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { SgiModule } from "../sgi/sgi.module";
import { UserActivityModule } from "../user-activity/user-activity.module";
import { DecisionAnalyticsStudioService } from "./decision-analytics-studio.service";
import { DecisionAnalyticsStudioController } from "./decision-analytics-studio.controller";
import { Fsos360ContextService } from "./fsos-360-context.service";
import { Fsos360WorkspaceService } from "./fsos-360-workspace.service";
import { Fsos360Controller } from "./fsos-360.controller";

// Decision Analytics Studio — reads Customers/Products/Invoices/Invoice
// Items/Routes/Employees/Collections/Returns/Visits via RieFacade
// (RieModule) and reuses SGI's already-persisted situations (SgiModule,
// SgiService.getLatest()) for the AI Insight panel and Lost Sales KPI,
// same reuse pattern as TerritoryIntelligenceModule.
@Module({
  imports: [RieModule, SgiModule, UserActivityModule],
  providers: [DecisionAnalyticsStudioService, Fsos360ContextService, Fsos360WorkspaceService],
  controllers: [DecisionAnalyticsStudioController, Fsos360Controller],
  exports: [DecisionAnalyticsStudioService],
})
export class DecisionAnalyticsStudioModule {}
