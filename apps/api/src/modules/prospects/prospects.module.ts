import { Module } from "@nestjs/common";
import { ProspectService } from "./prospect.service";
import { ProspectVisitIntentService } from "./prospect-visit-intent.service";
import { ProspectVisitIntentController } from "./prospect-visit-intent.controller";
import { MurshidakIntelligenceService } from "./murshidak-intelligence.service";
import { RieModule } from "../rie/rie.module";
import { ProductFitService } from "./product-fit.service";
import { GoogleRulesIntelligenceService } from "./google-rules-intelligence.service";
import { ProspectIntelligenceController } from "./prospect-intelligence.controller";
import { GeminiIntelligenceService } from "./gemini-intelligence.service";
import { ProspectIntelligenceOrchestratorService } from "./prospect-intelligence-orchestrator.service";
import { ProspectScoringService } from "./prospect-scoring.service";
import { CatalogFitService } from "./catalog-fit.service";
@Module({ imports: [RieModule], providers: [ProspectService, ProspectVisitIntentService, MurshidakIntelligenceService, ProductFitService, CatalogFitService, GoogleRulesIntelligenceService, GeminiIntelligenceService, ProspectIntelligenceOrchestratorService, ProspectScoringService], controllers: [ProspectVisitIntentController, ProspectIntelligenceController], exports: [ProspectService, MurshidakIntelligenceService, ProductFitService, GeminiIntelligenceService] })
export class ProspectsModule {}
