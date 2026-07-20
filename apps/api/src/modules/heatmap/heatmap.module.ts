import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { HeatmapService } from "./heatmap.service";
import { HeatmapController } from "./heatmap.controller";

// Migration #3 (ADR-001 / RIE Migration Plan) — reads via RieFacade now,
// FilesModule is no longer a dependency of this module. AppConfigService
// (for ANTHROPIC_API_KEY) doesn't need to be imported here — AppConfigModule
// is @Global().
@Module({
  imports: [RieModule],
  providers: [HeatmapService],
  controllers: [HeatmapController],
  exports: [HeatmapService],
})
export class HeatmapModule {}
