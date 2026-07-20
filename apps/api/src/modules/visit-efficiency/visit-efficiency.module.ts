import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { VisitEfficiencyService } from "./visit-efficiency.service";
import { VisitEfficiencyController } from "./visit-efficiency.controller";

// Migration #6 (ADR-001 / RIE Migration Plan, 2026-07-17) — query()/
// scopeValues() now read via RieFacade. FilesModule is no longer a
// dependency of this module at all.
@Module({
  imports: [RieModule],
  providers: [VisitEfficiencyService],
  controllers: [VisitEfficiencyController],
  exports: [VisitEfficiencyService],
})
export class VisitEfficiencyModule {}
