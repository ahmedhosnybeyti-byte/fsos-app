import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { LostOpportunityModule } from "../lost-opportunity/lost-opportunity.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { ProspectsModule } from "../prospects/prospects.module";
import { VisitCopilotService } from "./visit-copilot.service";
import { VisitCopilotController } from "./visit-copilot.controller";

// AI Visit Copilot — Phase 1. All data access goes through RieFacade
// (RieModule); the Claude chat endpoint uses AppConfigService for
// ANTHROPIC_API_KEY, which needs no import here — AppConfigModule is
// @Global(), same as AssistantModule. Daily 360 reads its persisted SGI
// snapshot directly through Prisma, scoped in PostgreSQL, without refresh.
@Module({
  imports: [RieModule, LostOpportunityModule, AuditLogModule, ProspectsModule],
  providers: [VisitCopilotService],
  controllers: [VisitCopilotController],
  exports: [VisitCopilotService],
})
export class VisitCopilotModule {}
