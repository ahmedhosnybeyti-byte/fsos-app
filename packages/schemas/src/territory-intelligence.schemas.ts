import { z } from "zod";

// Territory Intelligence screen — a manager-facing map/list view that
// groups customers geographically and surfaces which areas need attention.
//
// This platform has no first-class territory/region/GeoJSON-polygon concept
// anywhere in the Canonical Schema — the only reliable geographic grouping
// key with real data behind it is Customers.City (a plain place name every
// uploaded Customers dataset carries). Territories are therefore City
// buckets, not administratively-defined regions. RouteID would be a viable
// fallback grouping key if City coverage ever proves too sparse in practice,
// but City is the primary key here since it reads as an actual place a
// manager recognizes.
//
// Reuses SGI's already-computed situations (see sgi.schemas.ts) as the
// "why" behind each territory's health score rather than re-deriving its
// own situation detection — TARGET_BEHIND is rep-level, not geographic, and
// is excluded entirely from territory grouping.
export const territoryHealthTierSchema = z.enum(["excellent", "good", "average", "weak", "veryWeak"]);
export type TerritoryHealthTier = z.infer<typeof territoryHealthTierSchema>;

// One SGI situation, narrowed to this territory's customer set and reduced
// to the fields the Territory Intelligence card needs — mirrors a subset of
// sgiSituationSchema (see sgi.schemas.ts) rather than importing it directly,
// so this schema stays self-contained and doesn't couple to SGI's internal
// id/entityType/metricValue fields the UI here never renders.
export const territoryWhyItemSchema = z.object({
  type: z.enum(["LOST_SALES", "CUSTOMER_DECLINING", "CUSTOMER_INACTIVE", "COLLECTION_RISK", "GROWTH_OPPORTUNITY", "PRODUCT_DECLINE"]),
  severity: z.enum(["high", "medium", "low"]),
  label: z.string(),
  detail: z.string(),
});
export type TerritoryWhyItem = z.infer<typeof territoryWhyItemSchema>;

// The five raw signals that feed the Health Score below. Each is nullable
// independently — a metric is null only when its underlying Dataset
// (Invoices/Visits) isn't uploaded at all or SGI has no history yet, never
// when the real value happens to be zero (same "null = data-not-present,
// distinct from a real zero" convention team-performance.schemas.ts uses).
export const territoryMetricsSchema = z.object({
  salesGrowthPct: z.number().nullable(),
  activeCustomerRatePct: z.number(),
  lostSalesCount: z.number(),
  visitCoveragePct: z.number().nullable(),
  collectionHealthPct: z.number().nullable(),
});
export type TerritoryMetrics = z.infer<typeof territoryMetricsSchema>;

export const territorySummaryItemSchema = z.object({
  id: z.string(), // slug of the City name (lowercase, whitespace -> "-")
  name: z.string(), // the City name as-is
  lat: z.number(), // centroid of this territory's customers with valid coordinates
  lon: z.number(),
  customerCount: z.number(),
  healthScore: z.number(), // 0-100 rounded integer, weighted composite (see DEFAULT_HEALTH_SCORE_WEIGHTS)
  tier: territoryHealthTierSchema,
  metrics: territoryMetricsSchema,
  why: z.array(territoryWhyItemSchema), // top 5 SGI situations, sorted by severity then magnitude
  recommendation: z.string(), // templated Arabic sentence keyed off the top why item's type
  suggestedActions: z.array(z.string()), // 2-4 short strings, reused verbatim from the top why items' own SGI recommendation
  expectedImpactSar: z.number().nullable(), // null only when SGI has no history at all for this company
  opportunityValueSar: z.number(),
});
export type TerritorySummaryItem = z.infer<typeof territorySummaryItemSchema>;

export const territoryIntelligenceSummaryResponseSchema = z.object({
  territories: z.array(territorySummaryItemSchema), // sorted by healthScore ascending (worst-first)
  generatedAt: z.string(),
  groupedBy: z.literal("City"),
});
export type TerritoryIntelligenceSummaryResponse = z.infer<typeof territoryIntelligenceSummaryResponseSchema>;

// One row of an executive rollup list (top opportunities / worst
// territories) — value's meaning depends on which list it appears in
// (SAR for opportunity/risk figures, healthScore points for worst-territory
// rankings), documented at each usage site in the response schema below.
export const territoryExecutiveItemSchema = z.object({
  territoryId: z.string(),
  name: z.string(),
  value: z.number().nullable(),
  reason: z.string(),
});
export type TerritoryExecutiveItem = z.infer<typeof territoryExecutiveItemSchema>;

export const territoryIntelligenceExecutiveResponseSchema = z.object({
  topOpportunities: z.array(territoryExecutiveItemSchema), // up to 5, by opportunityValueSar desc — value = opportunityValueSar (SAR)
  worstTerritories: z.array(territoryExecutiveItemSchema), // up to 5, by healthScore asc — value = healthScore (points)
  fastestWin: territoryExecutiveItemSchema.nullable(), // healthScore >= 40 with the highest opportunityValueSar — value = opportunityValueSar (SAR)
  biggestRisk: territoryExecutiveItemSchema.nullable(), // lowest healthScore among high-severity-topped territories — value = healthScore (points)
  generatedAt: z.string(),
});
export type TerritoryIntelligenceExecutiveResponse = z.infer<typeof territoryIntelligenceExecutiveResponseSchema>;
