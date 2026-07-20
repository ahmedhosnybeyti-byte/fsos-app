import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { GeoIntelligenceService } from "./geo-intelligence.service";
import { GeoIntelligenceController } from "./geo-intelligence.controller";

// AppConfigService (for ANTHROPIC_API_KEY) doesn't need to be imported here
// — AppConfigModule is @Global(). haversineKm is imported directly from
// route-planning/route-balancer.util.ts (a pure function, no DI needed), so
// RoutePlanningModule isn't a dependency here either.
//
// Migration #5 (ADR-001 / RIE Migration Plan) — analyze()/expansion()/
// listCustomers() now read via RieFacade too (Migration #1 already moved
// compareCustomerViaRie()). FilesModule is no longer a dependency of this
// module at all.
@Module({
  imports: [RieModule],
  providers: [GeoIntelligenceService],
  controllers: [GeoIntelligenceController],
  exports: [GeoIntelligenceService],
})
export class GeoIntelligenceModule {}
