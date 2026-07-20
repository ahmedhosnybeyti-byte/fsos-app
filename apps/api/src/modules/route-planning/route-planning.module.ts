import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { RieModule } from "../rie/rie.module";
import { RoutePlanningService } from "./route-planning.service";
import { RoutePlanningController } from "./route-planning.controller";

// Migration #4 (ADR-001 / RIE Migration Plan) — split()/scopeValues() read
// via RieFacade now. FilesModule stays imported: listDistinctValues() (the
// legacy GET /route-planning/distinct-values endpoint) is UNCHANGED and
// still used by New Customer / Geo Intelligence (not yet migrated).
@Module({
  imports: [FilesModule, RieModule],
  providers: [RoutePlanningService],
  controllers: [RoutePlanningController],
  exports: [RoutePlanningService],
})
export class RoutePlanningModule {}
