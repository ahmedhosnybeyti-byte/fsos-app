import { z } from "zod";

// Decision Analytics Studio — new cross-filtering analytical workspace
// (client-approved spec). Purpose-built for this one screen: a single
// flexible aggregation endpoint (`query`) parameterized by an "Analyze By"
// dimension, backing the KPI cards, the switchable main chart, the mini
// heat map, and the AI insight panel from ONE consistent joined dataset —
// plus two small support endpoints (`filterOptions`, `table`). This is
// deliberately NOT a generic BI/reporting engine: the dimension list below
// is the fixed, closed set this screen needs, not an extensible framework.
//
// No new Canonical Entities or Prisma models — every field this schema
// exposes is sourced from entities that already exist (Customers, Products,
// Invoices, Invoice Items, Visits, Collections, Returns, Routes, Employees)
// via RieFacade, plus SGI's already-persisted situations for the AI panel
// (same reuse pattern as territory-intelligence.schemas.ts).

export const decisionAnalyzeByDimensionSchema = z.enum([
  "territory", // Customers.City
  "channel", // Customers.Channel
  "category", // Products.Category
  "brand", // Products.Brand
  "product", // Products.ProductCode/ProductName
  "customer", // Customers.CustomerCode/CustomerName
  "representative", // Routes.SalesRepID -> Employees
  "supervisor", // Employees.DirectManagerID -> Employees
]);
export type DecisionAnalyzeByDimension = z.infer<typeof decisionAnalyzeByDimensionSchema>;

// Drill-down (per spec: Category -> Brand -> SKU -> Customer -> Invoice) is
// not a separate mechanism — it IS changing `analyzeBy` to the next
// dimension while adding the clicked value as the matching filter array
// below (e.g. drilling from a Category bar into Brand = analyzeBy:"brand"
// + categoryValues:[clickedCategory]). "Invoice" as the final drill level
// is the Detail Table endpoint below, which is already line-item grain.
export const decisionFiltersSchema = z.object({
  dateFrom: z.string().min(1).max(50),
  dateTo: z.string().min(1).max(50),
  // Optional — when omitted, the service derives a same-length immediately-
  // preceding window itself (same convention as SGI/Territory Intelligence's
  // "current vs previous calendar month"), purely for the Growth KPI/chart deltas.
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
export type DecisionFilters = z.infer<typeof decisionFiltersSchema>;

export const decisionQueryInputSchema = decisionFiltersSchema.extend({
  analyzeBy: decisionAnalyzeByDimensionSchema,
});
export type DecisionQueryInput = z.infer<typeof decisionQueryInputSchema>;

// Every KPI here traces to a real, already-existing field — see
// decision-analytics-studio.service.ts for the exact source per metric.
// Nullable fields degrade to null (never a fabricated 0) when their source
// Dataset isn't uploaded at all, same convention as every other RIE-backed
// module's metrics.
export const decisionKpiSummarySchema = z.object({
  sales: z.number(), // sum(Invoice Items.LineTotal) for invoices in window (no InvoiceStatus filter — matches heatmap/team-performance's existing join)
  salesGrowthPct: z.number().nullable(), // vs prior window
  collections: z.number().nullable(), // sum(Collections.Amount) — null if Collections dataset unavailable
  returns: z.number().nullable(), // sum(Returns.TotalAmount) — null if Returns dataset unavailable
  lostSalesValue: z.number(), // sum of in-scope SGI LOST_SALES situations' metricValuePrior
  ordersCount: z.number(), // count(distinct InvoiceNo) in window
  averageOrderValue: z.number().nullable(), // sales / ordersCount, null when ordersCount = 0
  activeCustomersCount: z.number(), // count(distinct CustomerCode with an invoice) in window
  coveragePct: z.number().nullable(), // count(distinct visited CustomerCode) / count(distinct in-scope CustomerCode) — null if Visits unavailable
  strikeRatePct: z.number().nullable(), // productive visits / total visits — null if Visits unavailable
  // Confirmed business definition (2026-07-22): Sales / count(Productive Visits) in window.
  productivity: z.number().nullable(), // null if Visits unavailable or 0 productive visits
});
export type DecisionKpiSummary = z.infer<typeof decisionKpiSummarySchema>;

// One bar/row of the main chart AND of the Detail-adjacent breakdown —
// carries a small KPI set per group (not just "sales") so the frontend can
// switch which metric the chart plots without a second request.
export const decisionChartGroupSchema = z.object({
  key: z.string(), // stable id for cross-filtering (e.g. the raw City/Category/CustomerCode/repEmail value)
  label: z.string(), // display name
  sales: z.number(),
  salesPriorPct: z.number().nullable(), // this group's own growth vs prior window
  collections: z.number().nullable(),
  returns: z.number().nullable(),
  ordersCount: z.number(),
  activeCustomersCount: z.number(),
  // Chart Color & Visual Intelligence Standard v1.0 — this group's own
  // Sales target, summed from the RIE "Targets" canonical entity
  // (RouteID -> rep, Month/Year period overlap with the query window; same
  // join SGI's TARGET_BEHIND situation already uses). Only ever populated
  // for analyzeBy = "representative"/"supervisor" (the only dimensions with
  // a real target concept per the client's spec — Customers/Products/
  // Cities/Territories/Lost Sales have none); null everywhere else, and
  // null for a rep/supervisor with no matching Targets row this period —
  // never a fabricated 0. Drives the frontend's automatic Target-Based vs
  // Relative Semantic Coloring choice (chart-color-scale.ts) with no other
  // business-logic or KPI-calculation change.
  target: z.number().nullable(),
});
export type DecisionChartGroup = z.infer<typeof decisionChartGroupSchema>;

// Mini Heat Map data — always grouped by City regardless of the active
// analyzeBy dimension (the map is geographic context, not the primary
// analysis axis). Shape deliberately mirrors territory-intelligence's
// TerritoryMapNode (id/name/lat/lon/metricValue) so the frontend can reuse
// the existing polygon map component directly.
export const decisionHeatmapTerritorySchema = z.object({
  id: z.string(), // slug of the City name, same convention as territory-intelligence.schemas.ts
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  sales: z.number(),
});
export type DecisionHeatmapTerritory = z.infer<typeof decisionHeatmapTerritorySchema>;

// AI Insight — reuses SGI's already-persisted situations (SgiService.getLatest()),
// scoped down to whichever customers/reps are in the CURRENT filtered
// analysis, rather than a live LLM call per interaction (2026-07-22 product
// decision — instant/no-delay requirement is incompatible with a live call
// on every cross-filter click). Same trimmed shape as
// territory-intelligence's territoryWhyItemSchema.
export const decisionInsightItemSchema = z.object({
  type: z.enum(["LOST_SALES", "CUSTOMER_DECLINING", "CUSTOMER_INACTIVE", "COLLECTION_RISK", "GROWTH_OPPORTUNITY", "PRODUCT_DECLINE", "TARGET_BEHIND"]),
  severity: z.enum(["high", "medium", "low"]),
  label: z.string(),
  detail: z.string(),
});
export type DecisionInsightItem = z.infer<typeof decisionInsightItemSchema>;

export const decisionQueryResultSchema = z.object({
  kpis: decisionKpiSummarySchema,
  chart: z.array(decisionChartGroupSchema), // grouped by `analyzeBy`, sales desc
  heatmap: z.array(decisionHeatmapTerritorySchema),
  insights: z.array(decisionInsightItemSchema), // top 8 by severity
  generatedAt: z.string(),
  // Honest data-availability flags — surfaced instead of silently zeroing a
  // KPI, same convention as team-performance.schemas.ts's categoriesAvailable.
  datasetsAvailable: z.object({
    invoices: z.boolean(),
    collections: z.boolean(),
    returns: z.boolean(),
    visits: z.boolean(),
  }),
});
export type DecisionQueryResult = z.infer<typeof decisionQueryResultSchema>;

// Filter dropdown options — one endpoint, one fixed field enum (not a
// generic field-introspection system). `label` differs from `value` only
// for product/representative/supervisor (raw code/email vs display name);
// identical for the plain string fields.
export const decisionFilterFieldSchema = z.enum(["branch", "territory", "channel", "category", "brand", "product", "customer", "representative", "supervisor"]);
export type DecisionFilterField = z.infer<typeof decisionFilterFieldSchema>;

export const decisionFilterOptionsQuerySchema = z.object({ field: decisionFilterFieldSchema });
export type DecisionFilterOptionsQuery = z.infer<typeof decisionFilterOptionsQuerySchema>;

export const decisionFilterOptionSchema = z.object({ value: z.string(), label: z.string() });
export const decisionFilterOptionsResultSchema = z.object({ options: z.array(decisionFilterOptionSchema) });
export type DecisionFilterOptionsResult = z.infer<typeof decisionFilterOptionsResultSchema>;

// Detail Table — Invoice Items grain, the deepest drill level ("Invoice" in
// the spec's Category -> Brand -> SKU -> Customer -> Invoice chain).
export const decisionTableQueryInputSchema = decisionFiltersSchema.extend({
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});
export type DecisionTableQueryInput = z.infer<typeof decisionTableQueryInputSchema>;

export const decisionTableRowSchema = z.object({
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
export type DecisionTableRow = z.infer<typeof decisionTableRowSchema>;

export const decisionTableResultSchema = z.object({
  rows: z.array(decisionTableRowSchema),
  page: z.number(),
  pageSize: z.number(),
  totalRows: z.number(),
});
export type DecisionTableResult = z.infer<typeof decisionTableResultSchema>;
