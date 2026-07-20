import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { VisitCopilotService } from "./visit-copilot.service";
import { VisitCopilotController } from "./visit-copilot.controller";

// AI Visit Copilot — Phase 1. All data access goes through RieFacade
// (RieModule); the Claude chat endpoint uses AppConfigService for
// ANTHROPIC_API_KEY, which needs no import here — AppConfigModule is
// @Global(), same as AssistantModule.
@Module({
  imports: [RieModule],
  providers: [VisitCopilotService],
  controllers: [VisitCopilotController],
  exports: [VisitCopilotService],
})
export class VisitCopilotModule {}
