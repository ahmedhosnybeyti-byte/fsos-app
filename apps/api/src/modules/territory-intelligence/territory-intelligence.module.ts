import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { SgiModule } from "../sgi/sgi.module";
import { TerritoryIntelligenceService } from "./territory-intelligence.service";
import { TerritoryIntelligenceController } from "./territory-intelligence.controller";

// Territory Intelligence — reads scoped, aggregated canonical facts through
// RieModule and reuses SGI's already-persisted situations (SgiModule,
// SgiService.getLatest()) rather than re-running situation detection.
@Module({
  imports: [RieModule, SgiModule],
  providers: [TerritoryIntelligenceService],
  controllers: [TerritoryIntelligenceController],
  exports: [TerritoryIntelligenceService],
})
export class TerritoryIntelligenceModule {}
