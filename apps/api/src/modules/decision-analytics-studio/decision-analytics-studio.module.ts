import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { SgiModule } from "../sgi/sgi.module";
import { DecisionAnalyticsStudioService } from "./decision-analytics-studio.service";
import { DecisionAnalyticsStudioController } from "./decision-analytics-studio.controller";

// Decision Analytics Studio — reads Customers/Products/Invoices/Invoice
// Items/Routes/Employees/Collections/Returns/Visits via RieFacade
// (RieModule) and reuses SGI's already-persisted situations (SgiModule,
// SgiService.getLatest()) for the AI Insight panel and Lost Sales KPI,
// same reuse pattern as TerritoryIntelligenceModule.
@Module({
  imports: [RieModule, SgiModule],
  providers: [DecisionAnalyticsStudioService],
  controllers: [DecisionAnalyticsStudioController],
  exports: [DecisionAnalyticsStudioService],
})
export class DecisionAnalyticsStudioModule {}
