import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { LostOpportunityModule } from "../lost-opportunity/lost-opportunity.module";
import { SmartLoadingService } from "./smart-loading.service";
import { SmartLoadingController } from "./smart-loading.controller";

// Smart Loading — read-only, RIE-backed. Same import shape as sgi.module.ts:
// only RieModule is a dependency, no Excel/file selection, no new Prisma
// table or migration.
@Module({
  imports: [RieModule, LostOpportunityModule],
  providers: [SmartLoadingService],
  controllers: [SmartLoadingController],
  exports: [SmartLoadingService],
})
export class SmartLoadingModule {}
