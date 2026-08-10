import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { GeminiIntelligenceService, type GeminiIntelligenceInput } from "./gemini-intelligence.service";
import { GoogleRulesIntelligenceService } from "./google-rules-intelligence.service";
import { ProductFitService } from "./product-fit.service";
import { MurshidakIntelligenceService } from "./murshidak-intelligence.service";
import { deriveCommercialTier } from "./commercial-tier";
import { ProspectScoringService } from "./prospect-scoring.service";

type AllowedGeminiInput = Omit<GeminiIntelligenceInput, "prospectId" | "normalizedProspectFacts" | "refreshAt">;

@Injectable()
export class ProspectIntelligenceOrchestratorService {
  constructor(private readonly rules: GoogleRulesIntelligenceService, private readonly gemini: GeminiIntelligenceService, private readonly productFit: ProductFitService, private readonly intelligence: MurshidakIntelligenceService, private readonly scoring: ProspectScoringService) {}

  async enrich(user: AuthenticatedUser, prospectId: string, allowedInput?: AllowedGeminiInput) {
    const rules = await this.rules.enrich(user, prospectId);
    if (rules.state === "CURRENT") return { state: "CURRENT" as const };
    if (rules.state !== "ENRICHED") return { state: "FALLBACK" as const, reason: "Rules intelligence unavailable" };

    let gemini: Awaited<ReturnType<GeminiIntelligenceService["enrich"]>> | { state: "SKIPPED" } = { state: "SKIPPED" };
    if (allowedInput && (allowedInput.menuServiceText || allowedInput.image)) {
      // No Google photo is available here; image can only originate from a
      // future allowed user-upload path and remains request-scoped.
      gemini = await this.gemini.enrich(user, { ...allowedInput, prospectId, refreshAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), normalizedProspectFacts: rules.facts });
      if (gemini.state === "ENRICHED") {
        await this.intelligence.updateCommercialTier(user.companyId!, prospectId, deriveCommercialTier(rules.facts, gemini.output.menuServiceInsights));
        await this.scoring.rescore(user.companyId!, prospectId);
      }
    }
    const productFit = await this.productFit.build(user, prospectId);
    return { state: "ENRICHED" as const, needTags: rules.needTags, gemini, productFit };
  }
}
