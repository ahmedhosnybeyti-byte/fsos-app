import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { SgiModule } from "../sgi/sgi.module";
import { LostOpportunityModule } from "../lost-opportunity/lost-opportunity.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { ProspectsModule } from "../prospects/prospects.module";
import { VisitCopilotService } from "./visit-copilot.service";
import { VisitCopilotController } from "./visit-copilot.controller";

// AI Visit Copilot — Phase 1. All data access goes through RieFacade
// (RieModule); the Claude chat endpoint uses AppConfigService for
// ANTHROPIC_API_KEY, which needs no import here — AppConfigModule is
// @Global(), same as AssistantModule. SgiModule (2026-07-28): the
// "ملخص اليوم 360°" endpoint reuses SgiService.getLatest(user) as its sole
// facts/numbers source — no new Excel reads (see visit-copilot.schemas.ts).
@Module({
  imports: [RieModule, SgiModule, LostOpportunityModule, AuditLogModule, ProspectsModule],
  providers: [VisitCopilotService],
  controllers: [VisitCopilotController],
  exports: [VisitCopilotService],
})
export class VisitCopilotModule {}
