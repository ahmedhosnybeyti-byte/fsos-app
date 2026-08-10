import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BUSINESS_TYPE_PRIORITIES, SIZE_BAND_SCORES } from "./prospect-scoring.registry";

type ActivityInputs = { rating?: number | null; userRatingCount?: number | null; weeklyOpenHours?: number | null };
type StoredComponent = { score: number; confidence: number };
type Components = { business?: StoredComponent; density?: StoredComponent; activity?: StoredComponent; vision?: StoredComponent };
export type ProspectScoreInputs = { densityScore?: number | null; activity?: ActivityInputs };
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class ProspectScoringService {
  constructor(private readonly prisma: PrismaService) {}

  async rescore(companyId: string, prospectId: string, input: ProspectScoreInputs = {}) {
    const prospect = await this.prisma.prospect.findFirst({ where: { id: prospectId, companyId }, include: { intelligenceProfile: true } });
    if (!prospect) return null;
    const previous = readComponents(prospect.scoreComponents);
    const components: Components = {
      business: businessComponent(prospect.businessType, prospect.sizeBand),
      density: input.densityScore === undefined ? previous.density : component(input.densityScore, input.densityScore === null ? 0 : 1),
      activity: input.activity === undefined ? previous.activity : activityComponent(input.activity),
      vision: visionComponent(prospect.intelligenceProfile?.menuServiceInsights),
    };
    const fingerprint = JSON.stringify({ v: "v1", business: components.business ?? null, density: components.density ?? null, activity: components.activity ?? null, vision: components.vision ?? null });
    if (prospect.scoreInputFingerprint === fingerprint) return prospect;
    const weighted = [{ key: "business", weight: 30 }, { key: "density", weight: 30 }, { key: "activity", weight: 20 }, { key: "vision", weight: 20 }]
      .flatMap(({ key, weight }) => { const value = components[key as keyof Components]; return value ? [{ weight, value }] : []; });
    const denominator = weighted.reduce((sum, item) => sum + item.weight, 0);
    const total = denominator === 0 ? null : round(weighted.reduce((sum, item) => sum + item.weight * item.value.score, 0) / denominator);
    const confidence = round(weighted.reduce((sum, item) => sum + item.weight * item.value.confidence, 0));
    return this.prisma.prospect.update({ where: { id: prospect.id }, data: { scoreVersion: "v1", scoreTotal: total, scoreConfidence: confidence, businessTypeSizeScore: components.business?.score ?? null, commercialDensityScore: components.density?.score ?? null, activitySignalScore: components.activity?.score ?? null, visionScore: components.vision?.score ?? null, scoreComponents: components, scoreInputFingerprint: fingerprint, scoredAt: new Date() } });
  }
}

function component(score: number | null | undefined, confidence: number): StoredComponent | undefined { return typeof score === "number" && Number.isFinite(score) ? { score: round(clamp(score)), confidence } : undefined; }
function businessComponent(businessType: string | null, sizeBand: string | null): StoredComponent | undefined {
  const priority = businessType ? BUSINESS_TYPE_PRIORITIES[businessType] : undefined;
  const size = sizeBand ? SIZE_BAND_SCORES[sizeBand] : undefined;
  const values = [priority, size].filter((value): value is number => typeof value === "number");
  return values.length === 0 ? undefined : { score: round(values.reduce((sum, value) => sum + value, 0) / values.length), confidence: values.length / 2 };
}
function activityComponent(input: ActivityInputs): StoredComponent | undefined {
  const values: { weight: number; score: number }[] = [];
  if (typeof input.userRatingCount === "number" && input.userRatingCount >= 0) values.push({ weight: 60, score: clamp(100 * Math.log10(input.userRatingCount + 1) / 4) });
  if (typeof input.rating === "number") values.push({ weight: 15, score: clamp((input.rating - 3) / 2 * 100) });
  if (typeof input.weeklyOpenHours === "number" && input.weeklyOpenHours >= 0) values.push({ weight: 25, score: clamp(input.weeklyOpenHours / 168 * 100) });
  const weight = values.reduce((sum, value) => sum + value.weight, 0);
  return weight === 0 ? undefined : { score: round(values.reduce((sum, value) => sum + value.weight * value.score, 0) / weight), confidence: weight / 100 };
}
function visionComponent(insights: unknown): StoredComponent | undefined {
  const vision = (insights as { visionSignals?: unknown } | null)?.visionSignals;
  const score = isRecord(vision) ? vision.score : undefined;
  return typeof score === "number" && Number.isFinite(score) ? { score: round(clamp(score)), confidence: 1 } : undefined;
}
function readComponents(value: unknown): Components { return isRecord(value) ? value as Components : {}; }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
