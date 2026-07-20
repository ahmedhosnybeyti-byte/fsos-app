import { z } from "zod";
import { ROUTE_PLANNING_LIMITS } from "./constants";

// GET /route-planning/distinct-values — powers the scope-value dropdown in
// the frontend (e.g. picking which SalesmanID or TerritoryID to split)
// without the user having to type an exact value by hand.
export const routePlanningDistinctValuesSchema = z.object({
  fileId: z.string().min(1),
  column: z.string().min(1).max(200),
});
export type RoutePlanningDistinctValuesInput = z.infer<typeof routePlanningDistinctValuesSchema>;

// POST /route-planning/split — the core "balanced territory/route split"
// feature. See route-balancer.util.ts for the algorithm itself (region
// growing from a geographic seed — see PROJECT_LOG.md for why this replaced
// an earlier free-swap approach).
//
// Migration #4 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping. Customers/Invoices/Invoice Items are resolved automatically via
// RieFacade; sales value is always the RIE "sales" aggregate (Invoice Items
// joined to Invoices by CustomerCode), same convention as Migration #3's
// heatmap "sales" metric. Scope narrowing is now one of a fixed set of real
// Customers fields, same convention as Migrations #2/#3. GET
// /route-planning/distinct-values (above) is UNCHANGED and kept — New
// Customer / Geo Intelligence (not yet migrated) still depends on it for its
// own arbitrary uploaded-file column dropdowns.
export const routePlanningScopeFieldSchema = z.enum(["RouteID", "City", "CustomerClass", "Channel"]);
export type RoutePlanningScopeField = z.infer<typeof routePlanningScopeFieldSchema>;

export const routePlanningRieSplitSchema = z.object({
  scopeField: routePlanningScopeFieldSchema,
  // Multi-select: a supervisor pools one or more existing scope values
  // (e.g. several reps' routes) into one customer set before re-splitting
  // it into `groupCount` groups. groupCount is independent of how many
  // values are pooled — it can shrink (consolidate 4 routes into 3), stay
  // the same (rebalance the same 4), or grow (add a 5th route).
  scopeValues: z.array(z.string().min(1).max(200)).min(1).max(ROUTE_PLANNING_LIMITS.maxDistinctValues),
  groupCount: z.coerce.number().int().min(2).max(ROUTE_PLANNING_LIMITS.maxGroupCount),
  // Tolerance band as a fraction of the per-group target (e.g. 0.01 = stop
  // growing a group once it's within 1% of target). Defaults to a value
  // that empirically reaches near-perfect balance without over-fitting.
  tolerance: z.coerce.number().min(0.005).max(0.5).default(ROUTE_PLANNING_LIMITS.defaultTolerance),
});
export type RoutePlanningRieSplitInput = z.infer<typeof routePlanningRieSplitSchema>;

// GET /route-planning/scope-values — RIE-backed dedicated endpoint for this
// screen's own scope dropdown, same pattern as Migrations #2/#3. The
// existing GET /route-planning/distinct-values above stays untouched for
// New Customer's still-manual file/column dropdowns.
export const routePlanningScopeValuesQuerySchema = z.object({ scopeField: routePlanningScopeFieldSchema });
export type RoutePlanningScopeValuesQueryInput = z.infer<typeof routePlanningScopeValuesQuerySchema>;

export const routePlanningValuesResultSchema = z.object({ values: z.array(z.string()) });
export type RoutePlanningValuesResult = z.infer<typeof routePlanningValuesResultSchema>;
