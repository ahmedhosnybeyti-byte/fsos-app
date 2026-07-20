import { z } from "zod";
import { GEO_INTELLIGENCE_LIMITS } from "./constants";

// New Customer — Geo Intelligence. Narrow, deliberately-scoped wizard:
// Step 1 (frontend-only) captures a location (GPS / map pin / manual
// coordinates) — no backend involvement, it's just a {lat, lon} pair by the
// time it reaches these endpoints. Step 2 resolves a reference customer set
// from an existing dataset and surfaces its best-performing product
// assortment. See PROJECT_LOG.md for why this stops there (no invoice/order/
// customer-creation steps — that's out of scope for Field Sales OS).

export const geoIntelligenceLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

// Migration #5 (ADR-001 / RIE Migration Plan, 2026-07-17) — the old
// column-mapping shape (fileId, customerIdColumn, latitudeColumn, skuColumn,
// itemsFileId, ...) was removed here. Customers/Invoices/Invoice Items/
// Products are resolved automatically via RieFacade against the Canonical
// Schema now — the caller only supplies business inputs. Schema/type NAMES
// below are kept identical to before the migration (geoIntelligenceCustomersQuerySchema,
// geoIntelligenceAnalyzeSchema, geoIntelligenceExpansionSchema) so the
// controller's imports didn't need to change — only their internal shape did.

// GET /geo-intelligence/customers — powers the manual "search & add
// customer" step. Same shape/behavior as Migration #1's
// geoIntelligenceCompareCustomersQuerySchema below (both now just search the
// RIE Customers entity) — kept as a separate named schema per this screen's
// own endpoint rather than reusing Comparison's, so each stays free to
// diverge later without cross-screen coupling.
export const geoIntelligenceCustomersQuerySchema = z.object({
  search: z.string().max(200).optional(),
});
export type GeoIntelligenceCustomersQueryInput = z.infer<typeof geoIntelligenceCustomersQuerySchema>;

export const geoIntelligenceCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
});
export const geoIntelligenceCustomersResultSchema = z.object({
  customers: z.array(geoIntelligenceCustomerSchema),
});
export type GeoIntelligenceCustomersResult = z.infer<typeof geoIntelligenceCustomersResultSchema>;

// POST /geo-intelligence/analyze — the core resolve-customers +
// top-products step. Customers/Invoices/Invoice Items/Products are all
// resolved via RieFacade now — the caller only supplies the business
// choices (location, how to pick the reference customer set).
export const geoIntelligenceAnalyzeSchema = z
  .object({
    location: geoIntelligenceLocationSchema,
    // auto: nearest-N by distance from `location`. manual: exactly the
    // customer IDs the rep picked. both: union of the two (deduped).
    mode: z.enum(["auto", "manual", "both"]),
    nearestCount: z.coerce.number().int().min(1).max(GEO_INTELLIGENCE_LIMITS.maxNearestCount).default(GEO_INTELLIGENCE_LIMITS.defaultNearestCount),
    manualCustomerIds: z.array(z.string().min(1)).max(GEO_INTELLIGENCE_LIMITS.maxManualCustomerIds).default([]),
    topProductsLimit: z.coerce.number().int().min(1).max(GEO_INTELLIGENCE_LIMITS.maxTopProducts).default(GEO_INTELLIGENCE_LIMITS.defaultTopProducts),
  })
  .refine((v) => v.mode === "auto" || v.manualCustomerIds.length > 0, {
    message: "اختار عميل واحد على الأقل للوضع اليدوي",
    path: ["manualCustomerIds"],
  });
export type GeoIntelligenceAnalyzeInput = z.infer<typeof geoIntelligenceAnalyzeSchema>;

export const geoIntelligenceResolvedCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  distanceKm: z.number().nullable(),
  source: z.enum(["auto", "manual"]),
});

export const geoIntelligenceTopProductSchema = z.object({
  sku: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  totalQty: z.number(),
  totalValue: z.number(),
  customerCount: z.number(),
});

export const geoIntelligenceAnalyzeResultSchema = z.object({
  resolvedCustomers: z.array(geoIntelligenceResolvedCustomerSchema),
  topProducts: z.array(geoIntelligenceTopProductSchema),
  excludedBadCoordinates: z.number(),
  totalRowsConsidered: z.number(),
});
export type GeoIntelligenceAnalyzeResult = z.infer<typeof geoIntelligenceAnalyzeResultSchema>;

// POST /geo-intelligence/talking-points — optional AI layer on top of either
// the analyze() output or the compare() output, same Claude-API pattern as
// HeatmapService.interpret(). `framing` picks the system-prompt wording:
// "new_customer" (rep about to visit a customer they've never sold to) vs.
// "gap" (rep about to upsell an existing customer on what similar customers
// already buy from them).
export const geoIntelligenceTalkingPointsSchema = z.object({
  areaLabel: z.string().max(200).optional(),
  customerCount: z.number().int().min(0),
  topProducts: z.array(geoIntelligenceTopProductSchema).max(GEO_INTELLIGENCE_LIMITS.maxTopProductsInPrompt),
  framing: z.enum(["new_customer", "gap"]).default("new_customer"),
});
export type GeoIntelligenceTalkingPointsInput = z.infer<typeof geoIntelligenceTalkingPointsSchema>;

export const geoIntelligenceTalkingPointsResultSchema = z.object({
  summary: z.string(),
  talkingPoints: z.array(z.string()),
});
export type GeoIntelligenceTalkingPointsResult = z.infer<typeof geoIntelligenceTalkingPointsResultSchema>;

// The old file+column-mapping /geo-intelligence/compare request shape
// (fileId, customerIdColumn, latitudeColumn, ...) was removed here — Migration
// #1 (ADR-001) replaced it with geoIntelligenceCompareRieSchema below, which
// has no manual column mapping at all. See docs/adr/ADR-001-eliminate-manual-column-mapping.md.

export const geoIntelligenceCompareResultSchema = z.object({
  targetCustomer: geoIntelligenceCustomerSchema,
  neighbors: z.array(geoIntelligenceResolvedCustomerSchema),
  targetProductCount: z.number(),
  gapProducts: z.array(geoIntelligenceTopProductSchema),
  excludedBadCoordinates: z.number(),
  totalRowsConsidered: z.number(),
});
export type GeoIntelligenceCompareResult = z.infer<typeof geoIntelligenceCompareResultSchema>;

// POST /geo-intelligence/compare — Migration #1 (ADR-001 / RIE Migration
// Plan). Replaces the old column-mapping request shape above: no fileId, no
// column names. Customers/Invoices/Invoice Items/Products are resolved
// automatically via RieFacade against the Canonical Schema — the caller
// only supplies the business inputs. Output shape (geoIntelligenceCompareResultSchema)
// is unchanged, so the frontend result-rendering code didn't need to move.
export const geoIntelligenceCompareRieSchema = z.object({
  targetCustomerId: z.string().min(1),
  nearestCount: z.coerce.number().int().min(1).max(GEO_INTELLIGENCE_LIMITS.maxNearestCount).default(GEO_INTELLIGENCE_LIMITS.defaultNearestCount),
  topProductsLimit: z.coerce.number().int().min(1).max(GEO_INTELLIGENCE_LIMITS.maxTopProducts).default(GEO_INTELLIGENCE_LIMITS.defaultTopProducts),
});
export type GeoIntelligenceCompareRieInput = z.infer<typeof geoIntelligenceCompareRieSchema>;

// GET /geo-intelligence/compare/customers — RIE-backed customer search,
// scoped to Customer Comparison's own endpoint (kept separate from
// /geo-intelligence/customers above — same shape/behavior since Migration
// #5, but each screen owns its own endpoint).
export const geoIntelligenceCompareCustomersQuerySchema = z.object({
  search: z.string().max(200).optional(),
});
export type GeoIntelligenceCompareCustomersQueryInput = z.infer<typeof geoIntelligenceCompareCustomersQuerySchema>;

// POST /geo-intelligence/expansion — New Customer Expansion Map,
// territory-level upgrade (GVE catalog): analyze()/compareCustomer() work
// at a single-customer scope ("who's near THIS point"); this works at a
// whole-territory scope ("where in this territory is under-served
// whitespace worth expanding into"). Grid-based, deliberately simple: lay
// a km-sized grid over the resolved customer set's bounding box, bucket
// customers into cells, then score each EMPTY cell by how much customer
// value surrounds it (its occupied neighbor cells) — an empty cell next to
// a dense, high-value neighborhood is a real expansion target; an empty
// cell in the middle of nowhere isn't. Not a demand-forecasting model —
// just "where is the gap next to the money", same honest-simplification
// spirit as Lost Sales Map / Territory Opportunity Map.
// Migration #5 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping. Customers/Invoices/Invoice Items are resolved via RieFacade
// (customer value is always the RIE "sales" aggregate). Scope narrowing is
// now one of a fixed set of real Customers fields, multi-select like
// Migrations #3/#4, instead of one arbitrary column + single value.
export const geoIntelligenceScopeFieldSchema = z.enum(["RouteID", "City", "CustomerClass", "Channel"]);
export type GeoIntelligenceScopeField = z.infer<typeof geoIntelligenceScopeFieldSchema>;

export const geoIntelligenceExpansionSchema = z.object({
  scopeField: geoIntelligenceScopeFieldSchema.optional(),
  scopeValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  gridSizeKm: z.coerce.number().min(0.5).max(50).default(3),
});
export type GeoIntelligenceExpansionInput = z.infer<typeof geoIntelligenceExpansionSchema>;

// GET /geo-intelligence/expansion/scope-values — RIE-backed dedicated
// endpoint for this screen's own scope dropdown, same pattern as Migrations
// #2-#4. Does NOT touch GET /route-planning/distinct-values, which this
// screen used before its own migration turn and which other not-yet-migrated
// screens still depend on.
export const geoIntelligenceExpansionScopeValuesQuerySchema = z.object({ scopeField: geoIntelligenceScopeFieldSchema });
export type GeoIntelligenceExpansionScopeValuesQueryInput = z.infer<typeof geoIntelligenceExpansionScopeValuesQuerySchema>;

export const geoIntelligenceValuesResultSchema = z.object({ values: z.array(z.string()) });
export type GeoIntelligenceValuesResult = z.infer<typeof geoIntelligenceValuesResultSchema>;

export const geoIntelligenceExpansionPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  value: z.number(), // expansion opportunity score, not a currency amount
});

export const geoIntelligenceExpansionResultSchema = z.object({
  customerCount: z.number(),
  gridSizeKm: z.number(),
  totalCells: z.number(),
  emptyCellsScored: z.number(),
  maxScore: z.number(),
  points: z.array(geoIntelligenceExpansionPointSchema),
});
export type GeoIntelligenceExpansionResult = z.infer<typeof geoIntelligenceExpansionResultSchema>;
