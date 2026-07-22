import { z } from "zod";
import { decisionInsightItemSchema } from "./decision-analytics-studio.schemas";

// Geo Intelligence Engine (Executive Map Redesign Spec, 2026-07-22,
// client-approved, Phase 1 of 3) — a single unified map data engine meant to
// back every map screen in FSOS (Heat Map, Territory Intelligence, and any
// future map mode) with one consistent filter set, one KPI vocabulary, and
// one point/aggregate shape, instead of each screen inventing its own.
//
// Module name is "geo-engine", NOT "geo-intelligence" — that name is already
// taken by the pre-existing New Customer wizard module (location capture /
// nearest-customer lookup, apps/api/src/modules/geo-intelligence), an
// unrelated feature this spec's Hard Scope explicitly forbids touching.
//
// Hard Scope (per client doc): map rendering/interaction layer only. No new
// business logic, no schema/DB changes, existing endpoints stay compatible.
// This module is additive — every other map-adjacent endpoint (heatmap,
// territory-intelligence, decision-analytics-studio) is untouched and keeps
// working exactly as before; this is a new, independent read path over the
// same Canonical Entities via RieFacade, following this codebase's
// established per-module self-containment convention (see heatmap.service.ts
// / decision-analytics-studio.service.ts's own comments on the same choice).
//
// Country/Region are deliberately NOT filter fields here — confirmed with the
// client (2026-07-22) that the Canonical Schema has no such fields anywhere
// (Customers only carries City); inventing them would be exactly the kind of
// fabricated data this project's "never fabricate" discipline forbids.
// Likewise Territory boundary polygons: per explicit client instruction,
// Phase 1 does NOT generate approximate/convex-hull boundaries — Territory
// Intelligence's existing boundary-registry.ts (real GeoJSON when available,
// honest non-fake fallback shape otherwise) is reused as-is in a later phase,
// not reinvented here.

export const geoKpiSchema = z.enum(["sales", "orders", "customers", "visits", "collections", "returns", "lostSales"]);
export type GeoKpi = z.infer<typeof geoKpiSchema>;

// Field-for-field identical to decision-analytics-studio.schemas.ts's
// decisionFiltersSchema (see that file for the per-field data-source
// comments) — kept as its own schema per this codebase's established
// per-module isolation convention, but intentionally IDENTICAL in shape so
// the same GeoFilterBar/MultiSelectFilter UI (and DAS's already-existing
// GET /decision-analytics-studio/filter-options dropdown endpoint, reused
// as-is rather than duplicated — see geo-engine.controller.ts) works for any
// screen built on this engine without translation.
export const geoFiltersSchema = z.object({
  dateFrom: z.string().min(1).max(50),
  dateTo: z.string().min(1).max(50),
  // "lostSales" only — the prior (used-to-buy) window. Optional: when
  // omitted the service derives a same-length immediately-preceding window
  // itself, same convention as decisionFiltersSchema's priorDateFrom/To.
  priorDateFrom: z.string().min(1).max(50).optional(),
  priorDateTo: z.string().min(1).max(50).optional(),
  branchIds: z.array(z.string().min(1).max(200)).max(300).optional(),
  cityValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  channelValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  categoryValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  brandValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  productCodes: z.array(z.string().min(1).max(200)).max(300).optional(),
  customerCodes: z.array(z.string().min(1).max(200)).max(300).optional(),
  repEmails: z.array(z.string().min(1).max(300)).max(300).optional(),
  supervisorEmails: z.array(z.string().min(1).max(300)).max(300).optional(),
});
export type GeoFilters = z.infer<typeof geoFiltersSchema>;

// Phase 1 supports exactly two grouping levels: raw Customer points (feeds
// Heat Map / Cluster Map / Bubble-per-customer in Phase 2) and City-level
// aggregates (feeds Bubble-per-territory / cross-checks against Territory
// Intelligence's own City grouping). Architecture is additive — a future
// "route" or "branch" level is one more case in geo-engine.service.ts's
// groupPoints(), not a redesign.
export const geoGroupBySchema = z.enum(["customer", "city"]);
export type GeoGroupBy = z.infer<typeof geoGroupBySchema>;

export const geoQueryInputSchema = geoFiltersSchema.extend({
  kpi: geoKpiSchema,
  groupBy: geoGroupBySchema.default("customer"),
});
export type GeoQueryInput = z.infer<typeof geoQueryInputSchema>;

export const geoPointSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  // Always carried (even at groupBy:"city", where it equals `name`) so the
  // frontend never has to branch on `groupBy` just to read a point's city.
  city: z.string(),
  value: z.number(),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

export const geoQueryResultSchema = z.object({
  kpi: geoKpiSchema,
  groupBy: geoGroupBySchema,
  points: z.array(geoPointSchema),
  maxValue: z.number(),
  totalValue: z.number(),
  totalRows: z.number(),
  excludedBadCoordinates: z.number(),
  // AI Insight panel (Phase 3, client-approved 2026-07-22 scope: "AI Insight
  // Panel integration using the existing SGI service ... Do not create a new
  // AI service"). Reuses decisionInsightItemSchema as-is — SGI's already-
  // persisted situations (SgiService.getLatest()), scoped down to whichever
  // customers/reps are in the CURRENT GeoFilters, same reuse pattern
  // decision-analytics-studio.service.ts and territory-intelligence.service.ts
  // already established independently (3rd/4th instance of the same
  // convention, not a new one). No live LLM call per interaction.
  insights: z.array(decisionInsightItemSchema),
  // Honest data-availability flags — surfaced instead of silently zeroing a
  // KPI, same convention as team-performance.schemas.ts's categoriesAvailable
  // and decision-analytics-studio.schemas.ts's datasetsAvailable.
  datasetsAvailable: z.object({
    invoices: z.boolean(),
    collections: z.boolean(),
    returns: z.boolean(),
    visits: z.boolean(),
  }),
  generatedAt: z.string(),
});
export type GeoQueryResult = z.infer<typeof geoQueryResultSchema>;

// Detail Table (Phase 3) — Invoice-line grain, the "Invoice" step of the
// client's City -> Territory -> Customer -> Invoice drill chain. Same
// convention decision-analytics-studio.schemas.ts already established for
// its own identical drill chain ("Invoice" = this table, always reflecting
// whatever GeoFilters is currently scoped to — not a separate click level).
// Field-for-field identical to decisionTableQueryInputSchema/
// decisionTableRowSchema/decisionTableResultSchema since GeoFilters is
// already field-identical to DecisionFilters (see that comment above) — kept
// as its own schema per this module's established isolation convention
// rather than imported.
export const geoTableQueryInputSchema = geoFiltersSchema.extend({
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});
export type GeoTableQueryInput = z.infer<typeof geoTableQueryInputSchema>;

export const geoTableRowSchema = z.object({
  invoiceNo: z.string(),
  lineNo: z.number(),
  date: z.string().nullable(),
  customerCode: z.string(),
  customerName: z.string(),
  city: z.string(),
  channel: z.string(),
  productCode: z.string(),
  productName: z.string(),
  category: z.string(),
  brand: z.string(),
  repName: z.string(),
  supervisorName: z.string(),
  amount: z.number(),
});
export type GeoTableRow = z.infer<typeof geoTableRowSchema>;

export const geoTableResultSchema = z.object({
  rows: z.array(geoTableRowSchema),
  page: z.number(),
  pageSize: z.number(),
  totalRows: z.number(),
});
export type GeoTableResult = z.infer<typeof geoTableResultSchema>;
