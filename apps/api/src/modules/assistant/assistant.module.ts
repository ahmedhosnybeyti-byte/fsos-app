import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { SgiModule } from "../sgi/sgi.module";
import { CompaniesModule } from "../companies/companies.module";
import { AssistantService } from "./assistant.service";
import { AssistantController } from "./assistant.controller";

// AppConfigService (for ANTHROPIC_API_KEY) doesn't need to be imported
// here — AppConfigModule is @Global(), same as HeatmapModule/
// GeoIntelligenceModule.
//
// Migration #9 (ADR-001 / RIE Migration Plan, 2026-07-19) — list_datasets/
// query_dataset now read via RieFacade. FilesModule is no longer a
// dependency of this module at all (gpt.module.ts, the external Custom GPT
// Action, is deliberately left untouched and still depends on FilesModule
// directly — see completion report).
//
// CompaniesModule (2026-07-26) — Entity Resolution's Branch/Region
// resolvers need OrgUnitsService (the real, working data path for those
// two entities; they have no uploaded RIE/Excel dataset behind them — see
// local-decision/resolvers/org-unit.resolver.ts).
@Module({
  imports: [RieModule, SgiModule, CompaniesModule],
  providers: [AssistantService],
  controllers: [AssistantController],
  exports: [AssistantService],
})
export class AssistantModule {}
