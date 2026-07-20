import { z } from "zod";
import { HEATMAP_LIMITS } from "./constants";

// Heat map — dashboard feature. Two endpoints:
//   1. query: read a customer file (+ optional value-column aggregation,
//      optional scope/date filters) and return weighted points for the map.
//   2. interpret: translate a free-text request ("وريني مبيعات الرياض بس
//      الشهر ده") into a structured filter via the Claude API, so the
//      "query" form fields above can be filled in without the user having
//      to operate dropdowns by hand every time.
// See PROJECT_LOG.md for the full design discussion.
//
// metric covers 6 of the DNA's GVE map catalog (Part 20.2) in one feature:
// Sales Heat Map, Returns Heat Map, Collection Heat Map, Category
// Distribution Map (via the optional category filter below), Lost Sales
// Map (via "lostSales"), Territory Opportunity Map (via "opportunity"),
// plus Customer Density Map via "customerCount".
// The aggregation mechanism is identical for sales/returns/collection — a
// value column, either already on the customer file or summed from a
// second file (Invoices/Returns/Payments) by customer id, optionally
// date- and category-filtered — only which dataset the value comes from
// differs, which is a frontend file-picker concern, not a schema/service
// one. Field names below kept as "sales*" for backward compatibility
// (pre-existing Heat Map callers), but they now mean "the value source
// for whichever metric is selected".
//
// "lostSales" and "opportunity" are both two-window comparisons (prior vs
// recent) rather than a single value source — see heatmap.service.ts.
// "lostSales" works at SKU granularity (which specific product stopped
// being bought); "opportunity" (Territory Opportunity Map) is the simpler,
// broader signal — total spend declining per customer, no SKU dimension —
// i.e. "whose relationship is cooling off", not "which product specifically".
//
// Migration #3 (ADR-001 / RIE Migration Plan, 2026-07-17) — the old
// file+column-mapping request shape (customerFileId, latitudeColumn,
// salesFileId, salesFileCustomerIdColumn, ...) was removed here. Customers/
// Invoices/Invoice Items/Returns/Collections/Products are all resolved
// automatically via RieFacade against the Canonical Schema now — the caller
// only supplies business inputs. "Scope" narrowing (previously an arbitrary
// customer-file column) is now one of a fixed set of real Customers fields,
// same convention as Migration #2's customerSimilarityScopeFieldSchema.
export const heatmapScopeFieldSchema = z.enum(["RouteID", "City", "CustomerClass", "Channel"]);
export type HeatmapScopeField = z.infer<typeof heatmapScopeFieldSchema>;

export const heatmapRieQuerySchema = z
  .object({
    metric: z.enum(["sales", "returns", "collection", "lostSales", "opportunity", "customerCount"]).default("sales"),

    scopeField: heatmapScopeFieldSchema.optional(),
    scopeValues: z.array(z.string().min(1).max(200)).max(300).optional(),

    // Category Distribution Map — narrows "sales"/"lostSales" to one
    // Products.Category before aggregating. Meaningless for
    // returns/collection/customerCount (no SKU dimension under RIE — see
    // heatmap.service.ts).
    categoryValue: z.string().min(1).max(200).optional(),

    dateFrom: z.string().min(1).max(50).optional(),
    dateTo: z.string().min(1).max(50).optional(),

    // "lostSales"/"opportunity" only: the "prior" (used-to-buy) window —
    // dateFrom/dateTo above become the "recent" window for these metrics.
    priorDateFrom: z.string().min(1).max(50).optional(),
    priorDateTo: z.string().min(1).max(50).optional(),
  })
  .refine((v) => !v.scopeValues || (v.scopeField && v.scopeValues.length > 0), {
    message: "scopeValues requires scopeField",
    path: ["scopeField"],
  })
  .refine((v) => !v.categoryValue || v.metric === "sales" || v.metric === "lostSales", {
    message: 'categoryValue only applies to metric "sales" or "lostSales"',
    path: ["categoryValue"],
  })
  .refine((v) => (v.metric !== "lostSales" && v.metric !== "opportunity") || !!(v.priorDateFrom && v.priorDateTo && v.dateFrom && v.dateTo), {
    message: 'metric "lostSales"/"opportunity" requires priorDateFrom/priorDateTo and dateFrom/dateTo',
    path: ["priorDateFrom"],
  });
export type HeatmapRieQueryInput = z.infer<typeof heatmapRieQuerySchema>;

// GET /heatmap/scope-values and /heatmap/category-values — RIE-backed
// dedicated endpoints, same pattern as Migration #2's customer-similarity
// scope-values/category-values. Route Planning keeps using its own
// GET /route-planning/distinct-values untouched.
export const heatmapScopeValuesQuerySchema = z.object({ scopeField: heatmapScopeFieldSchema });
export type HeatmapScopeValuesQueryInput = z.infer<typeof heatmapScopeValuesQuerySchema>;

export const heatmapValuesResultSchema = z.object({ values: z.array(z.string()) });
export type HeatmapValuesResult = z.infer<typeof heatmapValuesResultSchema>;

export const heatmapPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  value: z.number(),
});
export type HeatmapPoint = z.infer<typeof heatmapPointSchema>;

export const heatmapQueryResultSchema = z.object({
  metric: z.enum(["sales", "returns", "collection", "lostSales", "opportunity", "customerCount"]),
  excludedBadCoordinates: z.number(),
  totalRows: z.number(),
  usedRows: z.number(),
  maxValue: z.number(),
  totalValue: z.number(),
  points: z.array(heatmapPointSchema),
});
export type HeatmapQueryResult = z.infer<typeof heatmapQueryResultSchema>;

// AI Decision Map (DNA GVE catalog, Part 20.2) — the one genuinely
// AI-driven catalog entry. Rather than a 16th map type, this is a Claude
// call layered ON TOP of whatever Heat Map result is already on screen:
// takes the top-N hottest points (whatever metric is currently selected)
// and asks Claude to turn them into a short prioritized action list — same
// Claude-API-call pattern as interpret()/geo-intelligence's talkingPoints(),
// generation instead of filter interpretation. Explicitly a summarization/
// prioritization layer over numbers the backend already computed
// deterministically, not a model making up figures.
export const heatmapDecisionSchema = z.object({
  metric: z.enum(["sales", "returns", "collection", "lostSales", "opportunity", "customerCount"]),
  scopeLabel: z.string().max(200).optional(),
  totalValue: z.number(),
  usedRows: z.number(),
  topPoints: z
    .array(z.object({ label: z.string(), value: z.number() }))
    .min(1)
    .max(HEATMAP_LIMITS.maxTopPointsInDecisionPrompt),
});
export type HeatmapDecisionInput = z.infer<typeof heatmapDecisionSchema>;

export const heatmapDecisionResultSchema = z.object({
  summary: z.string(),
  actions: z.array(z.object({ title: z.string(), detail: z.string() })),
});
export type HeatmapDecisionResult = z.infer<typeof heatmapDecisionResultSchema>;

export const heatmapInterpretSchema = z.object({
  prompt: z.string().min(1).max(HEATMAP_LIMITS.maxPromptLength),
  scopeColumn: z.string().min(1).max(200).optional(),
  scopeValues: z.array(z.string()).max(HEATMAP_LIMITS.maxScopeValuesInPrompt).optional(),
  currentScopeValue: z.string().max(200).optional(),
  currentDateFrom: z.string().max(50).optional(),
  currentDateTo: z.string().max(50).optional(),
});
export type HeatmapInterpretInput = z.infer<typeof heatmapInterpretSchema>;

// Validated on both ends: we ask Claude for this exact shape, then re-parse
// its reply through this same schema server-side before trusting it.
// "lostSales" is deliberately excluded here — it needs a SKU column and a
// second (prior) date window that free text has no reliable way to supply,
// so switching to it stays a manual form action, not something
// interpret() can set on its own.
export const heatmapInterpretResultSchema = z.object({
  scopeValue: z.string().nullable(),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  metric: z.enum(["sales", "returns", "collection", "customerCount"]).nullable(),
  understood: z.boolean(),
  explanation: z.string(),
});
export type HeatmapInterpretResult = z.infer<typeof heatmapInterpretResultSchema>;
