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
// feature. Two sales-value sourcing modes, same idea as the GPT dataset
// filters: either a column already on the customer file (salesColumn), or
// aggregated on the fly from a second file (e.g. Invoices) by matching a
// shared customer-id column. See route-balancer.util.ts for the algorithm
// itself (region growing from a geographic seed — see PROJECT_LOG.md for
// why this replaced an earlier free-swap approach).
export const routePlanningSplitSchema = z
  .object({
    customerFileId: z.string().min(1),
    latitudeColumn: z.string().min(1).max(200),
    longitudeColumn: z.string().min(1).max(200),
    idColumn: z.string().min(1).max(200),
    labelColumn: z.string().min(1).max(200).optional(),
    scopeColumn: z.string().min(1).max(200),
    scopeValue: z.string().min(1).max(200),
    groupCount: z.coerce.number().int().min(2).max(ROUTE_PLANNING_LIMITS.maxGroupCount),
    // Tolerance band as a fraction of the per-group target (e.g. 0.01 = stop
    // growing a group once it's within 1% of target). Defaults to a value
    // that empirically reaches near-perfect balance without over-fitting.
    tolerance: z.coerce.number().min(0.005).max(0.5).default(ROUTE_PLANNING_LIMITS.defaultTolerance),

    salesColumn: z.string().min(1).max(200).optional(),

    salesFileId: z.string().min(1).max(200).optional(),
    salesFileCustomerIdColumn: z.string().min(1).max(200).optional(),
    salesFileAmountColumn: z.string().min(1).max(200).optional(),
  })
  .refine((v) => !!v.salesColumn || !!(v.salesFileId && v.salesFileCustomerIdColumn && v.salesFileAmountColumn), {
    message:
      "Provide either salesColumn (a value already on the customer file) or salesFileId + salesFileCustomerIdColumn + salesFileAmountColumn (to aggregate sales from a second file)",
    path: ["salesColumn"],
  });
export type RoutePlanningSplitInput = z.infer<typeof routePlanningSplitSchema>;
