import { Injectable } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import { AppConfigService } from "../../common/config/app-config.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { MurshidakIntelligenceService } from "./murshidak-intelligence.service";
import { validatedNeedTags } from "./need-taxonomy";

const GEMINI_VERSION = "gemini-v1";
const JSON_SCHEMA = { type: "object", required: ["businessClassification", "menuServiceInsights", "needTags", "visionSignals", "confidence", "reasons"], properties: { businessClassification: { type: "object" }, menuServiceInsights: { type: "object" }, needTags: { type: "array", items: { type: "string" } }, visionSignals: { type: ["object", "null"] }, confidence: { type: "number" }, reasons: { type: "array", items: { type: "string" } } } };

export type GeminiIntelligenceInput = { prospectId: string; inputFingerprint: string; normalizedProspectFacts: Record<string, unknown>; menuServiceText?: string; image?: { mimeType: string; base64: string }; refreshAt: Date };
export type GeminiIntelligenceOutput = { businessClassification: Record<string, unknown>; menuServiceInsights: Record<string, unknown>; needTags: string[]; visionSignals: Record<string, unknown> | null; confidence: number; reasons: string[] };

@Injectable()
export class GeminiIntelligenceService {
  constructor(private readonly config: AppConfigService, private readonly intelligence: MurshidakIntelligenceService) {}

  async enrich(user: AuthenticatedUser, input: GeminiIntelligenceInput) {
    const companyId = user.companyId!;
    const fingerprint = `${GEMINI_VERSION}:${input.inputFingerprint}`;
    const lifecycle = await this.intelligence.resolve(companyId, input.prospectId, fingerprint);
    if (lifecycle.state === "CURRENT") return { state: "CURRENT" as const, profile: lifecycle.profile };
    const key = this.config.values.gemini.apiKey;
    if (!key) return { state: "FALLBACK" as const, reason: "GEMINI_API_KEY is not configured" };
    const output = await this.callGemini(key, input);
    if (!output) return { state: "FALLBACK" as const, reason: "Gemini enrichment unavailable" };
    await this.intelligence.storeGeminiInsights({ companyId, prospectId: input.prospectId, inputFingerprint: fingerprint, refreshAt: input.refreshAt, businessClassification: output.businessClassification as Prisma.InputJsonValue, menuServiceInsights: { ...output.menuServiceInsights, needTags: output.needTags, visionSignals: output.visionSignals, confidence: output.confidence, reasons: output.reasons, source: "gemini" } as Prisma.InputJsonValue, needTags: output.needTags });
    return { state: "ENRICHED" as const, output };
  }

  private async callGemini(apiKey: string, input: GeminiIntelligenceInput): Promise<GeminiIntelligenceOutput | null> {
    const parts: Record<string, unknown>[] = [{ text: `Classify only from supplied facts. Do not invent needs. Return JSON only. Set menuServiceInsights.commercialTier to PREMIUM, MID_MARKET, or VALUE only when the supplied evidence supports it; otherwise omit it. visionSignals must be null without an image; with an image it must contain score (0-100) and reasons. Facts: ${JSON.stringify(input.normalizedProspectFacts)}${input.menuServiceText ? `\nMenu/service text: ${input.menuServiceText}` : ""}` }];
    if (input.image) parts.push({ inline_data: { mime_type: input.image.mimeType, data: input.image.base64 } });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.values.gemini.model)}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, signal: controller.signal, body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", responseSchema: JSON_SCHEMA } }) });
      if (!response.ok) return null;
      const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? validateOutput(JSON.parse(text)) : null;
    } catch { return null; } finally { clearTimeout(timer); }
  }
}

function validateOutput(value: unknown): GeminiIntelligenceOutput | null {
  if (!value || typeof value !== "object") return null;
  const output = value as Record<string, unknown>;
  const validVision = output.visionSignals === null || (isObject(output.visionSignals) && typeof output.visionSignals.score === "number" && output.visionSignals.score >= 0 && output.visionSignals.score <= 100 && Array.isArray(output.visionSignals.reasons) && output.visionSignals.reasons.every((reason) => typeof reason === "string"));
  if (!isObject(output.businessClassification) || !isObject(output.menuServiceInsights) || !Array.isArray(output.needTags) || !output.needTags.every((tag) => typeof tag === "string") || !validVision || typeof output.confidence !== "number" || !Array.isArray(output.reasons) || !output.reasons.every((reason) => typeof reason === "string")) return null;
  return { businessClassification: output.businessClassification, menuServiceInsights: output.menuServiceInsights, needTags: validatedNeedTags(output.needTags.filter((tag): tag is string => typeof tag === "string")), visionSignals: output.visionSignals as Record<string, unknown> | null, confidence: Math.max(0, Math.min(100, output.confidence)), reasons: output.reasons };
}
function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
