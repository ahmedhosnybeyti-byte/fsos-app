import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { CustomerSimilarityService } from "./customer-similarity.service";
import { CustomerSimilarityController } from "./customer-similarity.controller";

// Migration #2 (ADR-001 / RIE Migration Plan) — reads via RieFacade now,
// FilesModule is no longer a dependency of this module.
@Module({
  imports: [RieModule],
  providers: [CustomerSimilarityService],
  controllers: [CustomerSimilarityController],
  exports: [CustomerSimilarityService],
})
export class CustomerSimilarityModule {}
