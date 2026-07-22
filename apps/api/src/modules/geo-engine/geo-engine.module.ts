import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { SgiModule } from "../sgi/sgi.module";
import { GeoEngineService } from "./geo-engine.service";
import { GeoEngineController } from "./geo-engine.controller";

// Phase 3 (client-approved 2026-07-22): adds SgiModule so GeoEngineService
// can call SgiService.getLatest() for the AI Insight panel — same reuse
// pattern DecisionAnalyticsStudioModule and TerritoryIntelligenceModule
// already use, not a new AI service.
@Module({
  imports: [RieModule, SgiModule],
  providers: [GeoEngineService],
  controllers: [GeoEngineController],
  exports: [GeoEngineService],
})
export class GeoEngineModule {}
