import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma/prisma.service";

export type MurshidakIntelligenceOutput = {
  businessClassification: Prisma.InputJsonValue;
  menuServiceInsights: Prisma.InputJsonValue;
  likelyNeedsCategories: Prisma.InputJsonValue;
  productFitInsights: Prisma.InputJsonValue;
};

export type IntelligenceProfileContract = {
  inputFingerprint: string | null;
  refreshAt: Date | null;
  analysisVersion: string | null;
  analyzedAt: Date | null;
};
export type IntelligenceLifecycle =
  | { state: "CURRENT"; profile: IntelligenceProfileContract }
  | { state: "ANALYSIS_REQUIRED"; profile: IntelligenceProfileContract | null };

@Injectable()
export class MurshidakIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(companyId: string, prospectId: string, inputFingerprint: string, now = new Date()): Promise<IntelligenceLifecycle> {
    const profile = await this.findProfile(companyId, prospectId);
    if (profile?.inputFingerprint === inputFingerprint && profile.refreshAt !== null && profile.refreshAt > now) return { state: "CURRENT", profile };
    return { state: "ANALYSIS_REQUIRED", profile };
  }

  async store(params: { companyId: string; prospectId: string; inputFingerprint: string; analysisVersion: string; refreshAt: Date; output: MurshidakIntelligenceOutput }) {
    const prospect = await this.prisma.prospect.findFirst({ where: { id: params.prospectId, companyId: params.companyId }, select: { id: true } });
    if (!prospect) throw new NotFoundException();
    const data = { ...params.output, inputFingerprint: params.inputFingerprint, analysisVersion: params.analysisVersion, analyzedAt: new Date(), refreshAt: params.refreshAt };
    return this.prisma.murshidakIntelligenceProfile.upsert({ where: { prospectId: prospect.id }, create: { prospectId: prospect.id, ...data }, update: data });
  }

  async profile(companyId: string, prospectId: string) {
    return this.findProfile(companyId, prospectId);
  }

  async prospectFacts(companyId: string, prospectId: string) {
    return this.prisma.prospect.findFirst({ where: { id: prospectId, companyId }, select: { businessType: true, channel: true } });
  }

  async storeProductFit(companyId: string, prospectId: string, productFitInsights: Prisma.InputJsonValue) {
    const profile = await this.findProfile(companyId, prospectId);
    if (!profile) throw new NotFoundException();
    return this.prisma.murshidakIntelligenceProfile.update({ where: { id: profile.id }, data: { productFitInsights } });
  }

  async storeRulesInsights(params: { companyId: string; prospectId: string; inputFingerprint: string; refreshAt: Date; businessClassification: Prisma.InputJsonValue; menuServiceInsights: Prisma.InputJsonValue }) {
    const prospect = await this.prisma.prospect.findFirst({ where: { id: params.prospectId, companyId: params.companyId }, select: { id: true } });
    if (!prospect) throw new NotFoundException();
    const data = { inputFingerprint: params.inputFingerprint, analysisVersion: "google-rules-v1", analyzedAt: new Date(), refreshAt: params.refreshAt, businessClassification: params.businessClassification, menuServiceInsights: params.menuServiceInsights };
    return this.prisma.murshidakIntelligenceProfile.upsert({ where: { prospectId: prospect.id }, create: { prospectId: prospect.id, ...data }, update: data });
  }

  async storeGeminiInsights(params: { companyId: string; prospectId: string; inputFingerprint: string; refreshAt: Date; businessClassification: Prisma.InputJsonValue; menuServiceInsights: Prisma.InputJsonValue; needTags: Prisma.InputJsonValue }) {
    const prospect = await this.prisma.prospect.findFirst({ where: { id: params.prospectId, companyId: params.companyId }, select: { id: true } });
    if (!prospect) throw new NotFoundException();
    const current = await this.findProfile(params.companyId, params.prospectId);
    const existingMenu = isRecord(current?.menuServiceInsights) ? current!.menuServiceInsights : {};
    const existingClassification = isRecord(current?.businessClassification) ? current!.businessClassification : {};
    const currentTags = Array.isArray(existingMenu.needTags) ? existingMenu.needTags.filter((tag): tag is string => typeof tag === "string") : [];
    const newTags = Array.isArray(params.needTags) ? params.needTags.filter((tag): tag is string => typeof tag === "string") : [];
    const data = { inputFingerprint: params.inputFingerprint, analysisVersion: "gemini-v1", analyzedAt: new Date(), refreshAt: params.refreshAt, businessClassification: { ...existingClassification, ...(params.businessClassification as object) }, menuServiceInsights: { ...existingMenu, ...(params.menuServiceInsights as object), needTags: [...new Set([...currentTags, ...newTags])] }, likelyNeedsCategories: [...new Set([...currentTags, ...newTags])] };
    return this.prisma.murshidakIntelligenceProfile.upsert({ where: { prospectId: prospect.id }, create: { prospectId: prospect.id, ...data }, update: data });
  }

  async updateCommercialTier(companyId: string, prospectId: string, tier: Prisma.InputJsonValue) {
    const profile = await this.findProfile(companyId, prospectId);
    if (!profile) throw new NotFoundException();
    const classification = isRecord(profile.businessClassification) ? profile.businessClassification : {};
    return this.prisma.murshidakIntelligenceProfile.update({ where: { id: profile.id }, data: { businessClassification: { ...classification, ...(tier as object) } } });
  }

  private async findProfile(companyId: string, prospectId: string) {
    return this.prisma.murshidakIntelligenceProfile.findFirst({ where: { prospectId, prospect: { companyId } } });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
