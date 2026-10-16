import { createHash } from "node:crypto";

export const WATER_EVENT_OUTCOMES = [
  "ADD_VERIFIED",
  "DUPLICATE_VERIFIED",
  "UPDATE_EXISTING_HOLD",
  "NEEDS_SOURCE_VERIFICATION",
  "NEEDS_END_DATE_REVIEW",
  "HOLD_POSTPONED",
  "HOLD_RECHECK",
  "EXPIRED_SOURCE_CONFLICT",
] as const;

export type WaterEventOutcome = (typeof WATER_EVENT_OUTCOMES)[number];

export function isImportableWaterEvent(outcome: WaterEventOutcome): boolean {
  return ["ADD_VERIFIED", "NEEDS_SOURCE_VERIFICATION", "NEEDS_END_DATE_REVIEW", "HOLD_RECHECK"].includes(outcome);
}

export type WaterEventCandidate = {
  candidate_id: string;
  title: string;
  event_category: string;
  start_date_raw: string;
  end_date_raw: string | null;
  city: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_location_status: string | null;
  maps_search_url: string | null;
  maps_link_kind: string | null;
  venue_location_source_url: string | null;
  event_source_url: string;
  evidence_label_from_source: string | null;
  business_priority_from_source: string | null;
  water_order_status: string | null;
  buyer_or_contact_role: string | null;
  sales_approach: string | null;
  original_alert: string | null;
  visit_access_note: string | null;
  review_gate: string;
  candidate_key_hint: string | null;
  source_file_sheet_row: string | null;
  research_date: string;
  outcome: WaterEventOutcome;
  existing_market_opportunity_id?: string;
  verification_url?: string;
  review_note?: string;
};

export type WaterEventManifest = {
  manifest_version: number;
  source_file: string;
  source_sha256: string;
  research_date: string;
  vertical: "WATER";
  candidates: WaterEventCandidate[];
};

export type ExistingOpportunityIdentity = {
  id: string;
  externalKey?: string | null;
  title: string;
  city?: string | null;
  opportunityDate?: Date | string | null;
  sourceUrl: string;
};

export function parseIsoDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeOpportunityText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ")
    .trim();
}

export function candidateExternalKey(candidate: WaterEventCandidate): string {
  return `water-event-first:${candidate.candidate_id.toLowerCase()}`;
}

export function candidateFingerprint(candidate: WaterEventCandidate): string {
  const stableCandidate = Object.fromEntries(Object.entries(candidate).sort(([left], [right]) => left.localeCompare(right)));
  return createHash("sha256").update(JSON.stringify(stableCandidate)).digest("hex");
}

export function deterministicOpportunityId(candidate: WaterEventCandidate): string {
  return `water-event-first-20261016-${candidate.candidate_id.toLowerCase()}`;
}

export function deterministicCompanyOpportunityId(candidate: WaterEventCandidate, companyId: string): string {
  const companyHash = createHash("sha256").update(companyId).digest("hex").slice(0, 10);
  return `water-event-${companyHash}-${candidate.candidate_id.toLowerCase()}`;
}

export function waterEventPriority(candidate: WaterEventCandidate): number {
  const category = normalizeOpportunityText(candidate.event_category);
  const categoryRank = /(رياض|مباراة|بطولة|كرة قدم|رياضات الكترونية)/.test(category)
    ? 400
    : /(معرض|مؤتمر|قمة)/.test(category)
      ? 200
      : /(حفل|مهرجان|كوميديا|عرض|ترفيه|شاطئ)/.test(category)
        ? 300
        : 100;
  const sourcePriority = normalizeOpportunityText(candidate.business_priority_from_source);
  const priorityBoost = sourcePriority.includes("عالي") ? 30 : sourcePriority.includes("متوسط") ? 20 : 10;
  return categoryRank + priorityBoost;
}

export function opportunityLocationKind(candidate: WaterEventCandidate): "PRECISE" | "SEARCH_ONLY" | "MULTI_VENUE" | "UNKNOWN" {
  if (normalizeOpportunityText(candidate.maps_link_kind).includes("search")) return "SEARCH_ONLY";
  const status = normalizeOpportunityText(candidate.venue_location_status);
  if (status.includes("اكثر من موقع")) return "MULTI_VENUE";
  if (status.includes("محدد")) return "PRECISE";
  return "UNKNOWN";
}

export function opportunityConfidence(candidate: WaterEventCandidate): "HIGH" | "MEDIUM" | "LOW" {
  const value = normalizeOpportunityText(candidate.business_priority_from_source);
  if (value.includes("عالي")) return "HIGH";
  if (value.includes("منخفض")) return "LOW";
  return "MEDIUM";
}

export function exactCandidateMatch(candidate: WaterEventCandidate, existing: ExistingOpportunityIdentity): boolean {
  if (existing.externalKey === candidateExternalKey(candidate)) return true;
  const existingDate = existing.opportunityDate instanceof Date
    ? existing.opportunityDate.toISOString().slice(0, 10)
    : existing.opportunityDate?.slice(0, 10) ?? null;
  return normalizeOpportunityText(existing.title) === normalizeOpportunityText(candidate.title)
    && normalizeOpportunityText(existing.city) === normalizeOpportunityText(candidate.city)
    && existingDate === candidate.start_date_raw;
}

export function reviewedCandidateMatch(candidate: WaterEventCandidate, existing: ExistingOpportunityIdentity): boolean {
  if (exactCandidateMatch(candidate, existing)) return true;
  const existingDate = existing.opportunityDate instanceof Date
    ? existing.opportunityDate.toISOString().slice(0, 10)
    : existing.opportunityDate?.slice(0, 10) ?? null;
  if (existingDate !== candidate.start_date_raw || normalizeOpportunityText(existing.city) !== normalizeOpportunityText(candidate.city)) return false;
  const candidateTokens = new Set(normalizeOpportunityText(candidate.title).split(" ").filter((token) => token.length >= 4));
  const existingTokens = normalizeOpportunityText(existing.title).split(" ").filter((token) => token.length >= 4);
  if (existingTokens.some((token) => candidateTokens.has(token))) return true;
  try {
    return new URL(existing.sourceUrl).hostname.replace(/^www\./, "") === new URL(candidate.event_source_url).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

export function summarizeWaterEventManifest(manifest: WaterEventManifest) {
  const counts = Object.fromEntries(WATER_EVENT_OUTCOMES.map((outcome) => [outcome, 0])) as Record<WaterEventOutcome, number>;
  for (const candidate of manifest.candidates) counts[candidate.outcome] += 1;
  return {
    total: manifest.candidates.length,
    activeAdditions: counts.ADD_VERIFIED,
    candidateAdditions: counts.NEEDS_SOURCE_VERIFICATION + counts.NEEDS_END_DATE_REVIEW + counts.HOLD_RECHECK,
    verifiedDuplicates: counts.DUPLICATE_VERIFIED,
    trustedHoldUpdates: counts.UPDATE_EXISTING_HOLD,
    needsVerification: counts.NEEDS_SOURCE_VERIFICATION + counts.NEEDS_END_DATE_REVIEW,
    needsEndDateReview: counts.NEEDS_END_DATE_REVIEW,
    heldWithoutImport: counts.HOLD_POSTPONED,
    expiredOrConflicting: counts.EXPIRED_SOURCE_CONFLICT,
    counts,
  };
}

export function validateWaterEventManifest(manifest: WaterEventManifest): void {
  if (manifest.manifest_version !== 1) throw new Error("Unsupported Event-First manifest version");
  if (manifest.vertical !== "WATER") throw new Error("Event-First manifest must be scoped to WATER");
  if (manifest.candidates.length !== 64) throw new Error(`Expected 64 event candidates, received ${manifest.candidates.length}`);
  const ids = new Set<string>();
  for (const candidate of manifest.candidates) {
    if (!WATER_EVENT_OUTCOMES.includes(candidate.outcome)) throw new Error(`${candidate.candidate_id}: invalid outcome`);
    if (!candidate.candidate_id || !candidate.title || !candidate.city || !candidate.event_source_url) {
      throw new Error(`${candidate.candidate_id || "unknown"}: missing required source fields`);
    }
    if (ids.has(candidate.candidate_id)) throw new Error(`${candidate.candidate_id}: duplicate candidate id`);
    ids.add(candidate.candidate_id);
    if (candidate.outcome === "ADD_VERIFIED" && !candidate.verification_url) {
      throw new Error(`${candidate.candidate_id}: verified additions require an independent verification URL`);
    }
    if (["DUPLICATE_VERIFIED", "UPDATE_EXISTING_HOLD"].includes(candidate.outcome)
      && (!candidate.existing_market_opportunity_id || !candidate.verification_url)) {
      throw new Error(`${candidate.candidate_id}: existing record id and verification URL are required`);
    }
  }
}

export function candidateDescription(candidate: WaterEventCandidate): string {
  return [
    candidate.original_alert,
    candidate.visit_access_note,
    candidate.source_file_sheet_row ? `مرجع الملف: ${candidate.source_file_sheet_row}.` : null,
    "الفعالية إشارة لاحتياج مياه محتمل وليست طلب شراء أو عقد توريد مثبتًا.",
  ].filter(Boolean).join("\n");
}

export function candidateWhyRelevant(candidate: WaterEventCandidate): string {
  return [
    candidate.sales_approach,
    candidate.business_priority_from_source ? `أولوية المصدر: ${candidate.business_priority_from_source}.` : null,
    "يجب الوصول إلى المنظم أو المشغل أو متعهد الضيافة قبل اعتبارها فرصة توريد مؤهلة.",
  ].filter(Boolean).join(" ");
}

export function candidateContact(candidate: WaterEventCandidate): { phone: string | null; whatsapp: string | null; email: string | null } {
  const raw = candidate.buyer_or_contact_role?.trim() ?? "";
  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = raw.match(/\+?\d[\d\s()-]{7,}\d/)?.[0]?.replace(/\s+/g, " ") ?? null;
  return {
    phone: phone && !/^واتساب/i.test(raw) ? phone : null,
    whatsapp: phone && /^واتساب/i.test(raw) ? phone : null,
    email,
  };
}
