import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AppConfigService } from "../../common/config/app-config.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { GooglePlacesProvider } from "../visit-copilot/discovery/google-places.provider";
import { MurshidakIntelligenceService } from "./murshidak-intelligence.service";
import { deriveGoogleNeedTags, GOOGLE_NEED_RULES_VERSION } from "./need-tag-rules";
import { validatedNeedTags } from "./need-taxonomy";
import { deriveCommercialTier } from "./commercial-tier";
import { ProspectScoringService } from "./prospect-scoring.service";

@Injectable()
export class GoogleRulesIntelligenceService {
  constructor(private readonly prisma: PrismaService, private readonly config: AppConfigService, private readonly intelligence: MurshidakIntelligenceService, private readonly scoring: ProspectScoringService) {}

  async enrich(user: AuthenticatedUser, prospectId: string) {
    const companyId = user.companyId!;
    const prospect = await this.prisma.prospect.findFirst({ where: { id: prospectId, companyId, source: "GOOGLE" } });
    if (!prospect) throw new NotFoundException();
    const fingerprint = `${prospect.source}:${prospect.externalKey}:${prospect.updatedAt.toISOString()}:${GOOGLE_NEED_RULES_VERSION}`;
    const lifecycle = await this.intelligence.resolve(companyId, prospectId, fingerprint);
    if (lifecycle.state === "CURRENT") return { state: "CURRENT" as const };
    const apiKey = this.config.values.googlePlaces.apiKey;
    if (!apiKey) return { state: "UNAVAILABLE" as const };
    const facts = await new GooglePlacesProvider(apiKey).intelligenceFacts(prospect.externalKey);
    if (!facts) return { state: "UNAVAILABLE" as const };
    const needTags = validatedNeedTags(deriveGoogleNeedTags(facts));
    const commercialTier = deriveCommercialTier(facts);
    await this.intelligence.storeRulesInsights({ companyId, prospectId, inputFingerprint: fingerprint, refreshAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), businessClassification: { businessType: facts.businessType ?? prospect.businessType, source: "google-rules", ...commercialTier }, menuServiceInsights: { version: GOOGLE_NEED_RULES_VERSION, needTags, source: "google-rules" } });
    await this.scoring.rescore(companyId, prospectId, { activity: { rating: facts.rating, userRatingCount: facts.userRatingCount, weeklyOpenHours: facts.weeklyOpenHours } });
    return { state: "ENRICHED" as const, needTags, facts };
  }
}
