import { z } from "zod";
import { ROUTE_PLANNING_LIMITS } from "./constants";

// Customer Similarity Map (GVE catalog, Part 20.2): "أنهي عملاء يشبهوا بعض
// في سلوكهم/أدائهم؟" — clusters customers by a behavioral feature vector
// (total value, transaction count, and — when a SKU column is mapped —
// distinct SKU count; a simple RFM-style profile, deliberately not a full
// recency/frequency/monetary model with decay curves) rather than by
// geography. Reuses the same customer-file column-mapping shape as Route
// Planning/Heat Map, and returns the *same result shape* as Route
// Planning's split() (before === after, since there's no "before"
// geographic state here — just one clustering) so the frontend can reuse
// RouteSplitMap/the results table verbatim instead of a new bespoke map
// component.
//
// July 2026: "أساس التشابه" (similarity basis) — originally this only ever
// clustered on the sales file's total value/order count/SKU variety. Now
// the caller picks WHICH behavioral signal to cluster on:
//   - "sales" (default): total purchasing behavior, same as before — and
//     now optionally narrowed to one product category/segment first (e.g.
//     "similar in how they buy Biscuits" instead of overall spend) via
//     salesCategoryColumn/salesCategoryValue.
//   - "collection": behavior on the Collections file instead (how much/how
//     often a customer pays, not what they buy).
//   - "returns": behavior on the Returns file instead.
// Each basis has its own optional file/column block below; only the block
// matching `similarityBasis` is actually required (see the .refine()s).
// Adding a future basis (e.g. "visits") means one more enum value + one
// more optional file block — deliberately shaped so this scales without a
// rewrite.
export const customerSimilarityBasisSchema = z.enum(["sales", "collection", "returns"]);
export type CustomerSimilarityBasis = z.infer<typeof customerSimilarityBasisSchema>;

// Migration #2 (ADR-001 / RIE Migration Plan, 2026-07-17) — the old
// file+column-mapping request shape (customerFileId, latitudeColumn,
// salesFileId, salesFileCustomerIdColumn, ...) was removed here. Customers/
// Invoices/Invoice Items/Collections/Returns/Products are all resolved
// automatically via RieFacade against the Canonical Schema now — the caller
// only supplies business inputs. "Scope" narrowing (previously an arbitrary
// customer-file column) is now one of a fixed set of real Customers fields.
export const customerSimilarityScopeFieldSchema = z.enum(["RouteID", "City", "CustomerClass", "Channel"]);
export type CustomerSimilarityScopeField = z.infer<typeof customerSimilarityScopeFieldSchema>;

export const customerSimilarityRieQuerySchema = z
  .object({
    clusterCount: z.coerce.number().int().min(2).max(ROUTE_PLANNING_LIMITS.maxGroupCount).default(4),
    similarityBasis: customerSimilarityBasisSchema.default("sales"),
    scopeField: customerSimilarityScopeFieldSchema.optional(),
    scopeValues: z.array(z.string().min(1).max(200)).max(ROUTE_PLANNING_LIMITS.maxDistinctValues).optional(),
    // "sales" basis only — narrows to one Products.Category before computing
    // behavior (same idea as the old salesCategoryColumn/salesCategoryValue,
    // but Category is now a known Canonical field, not a picked column).
    salesCategoryValue: z.string().min(1).max(200).optional(),
  })
  .refine((v) => !v.scopeValues || (v.scopeField && v.scopeValues.length > 0), {
    message: "scopeValues requires scopeField",
    path: ["scopeField"],
  })
  .refine((v) => !v.salesCategoryValue || v.similarityBasis === "sales", {
    message: "salesCategoryValue only applies to similarityBasis \"sales\"",
    path: ["salesCategoryValue"],
  });
export type CustomerSimilarityRieQueryInput = z.infer<typeof customerSimilarityRieQuerySchema>;

// GET /customer-similarity/scope-values and /customer-similarity/category-values
// — RIE-backed replacements for the old GET /route-planning/distinct-values
// (which read an arbitrary column out of an arbitrary file). Scoped to this
// screen only; Route Planning/Heat Map keep using distinct-values untouched.
export const customerSimilarityScopeValuesQuerySchema = z.object({ scopeField: customerSimilarityScopeFieldSchema });
export type CustomerSimilarityScopeValuesQueryInput = z.infer<typeof customerSimilarityScopeValuesQuerySchema>;

export const customerSimilarityValuesResultSchema = z.object({ values: z.array(z.string()) });
export type CustomerSimilarityValuesResult = z.infer<typeof customerSimilarityValuesResultSchema>;

export const customerSimilarityRecordSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  sales: z.number(), // total value on the chosen basis — reused as the "sales" field so RouteSplitMap's popup renders unchanged
  before: z.number(), // === after; kept only so the shared result shape matches RoutePlanningSplitResult exactly
  after: z.number(), // cluster index
});

export const customerSimilarityResultSchema = z.object({
  clusterCount: z.number(),
  excludedNoSalesData: z.number(),
  totalScopedRows: z.number(),
  usedRows: z.number(),
  // Echoed back so the frontend can label the results table correctly even
  // if it re-renders from a cached result — no ambiguity about what was
  // actually used.
  similarityBasis: customerSimilarityBasisSchema,
  // Per-cluster summary — same field names as Route Planning's totals/counts
  // arrays for the same frontend-reuse reason.
  afterTotals: z.array(z.number()),
  afterCounts: z.array(z.number()),
  // Per-cluster average feature profile, for the results table (what makes
  // this cluster distinct — e.g. "high value, low frequency"). avgDistinctSkus
  // is null when the chosen basis has no SKU dimension mapped (always for
  // "collection"; optional for "sales"/"returns").
  clusterProfiles: z.array(
    z.object({
      avgTotalValue: z.number(),
      avgOrderCount: z.number(),
      avgDistinctSkus: z.number().nullable(),
    }),
  ),
  records: z.array(customerSimilarityRecordSchema),
});
export type CustomerSimilarityResult = z.infer<typeof customerSimilarityResultSchema>;
