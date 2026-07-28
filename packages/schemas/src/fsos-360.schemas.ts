import { z } from "zod";

const dateRangeSchema = z.object({
  from: z.string().min(1).max(50),
  to: z.string().min(1).max(50),
});

export const fsos360AnalysisFocusSchema = z.enum([
  "company", "region", "branch", "manager", "supervisor", "route", "sales-rep", "customer", "brand", "category", "product",
]);
export type Fsos360AnalysisFocus = z.infer<typeof fsos360AnalysisFocusSchema>;

export const fsos360FiltersSchema = z.object({
  companyId: z.string().min(1).max(200).optional(),
  regionIds: z.array(z.string().min(1).max(200)).max(300).optional(),
  cityValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  branchIds: z.array(z.string().min(1).max(200)).max(300).optional(),
  managerIds: z.array(z.string().min(1).max(200)).max(300).optional(),
  supervisorIds: z.array(z.string().min(1).max(200)).max(300).optional(),
  routeIds: z.array(z.string().min(1).max(200)).max(300).optional(),
  salesRepIds: z.array(z.string().min(1).max(200)).max(300).optional(),
  customerCodes: z.array(z.string().min(1).max(200)).max(300).optional(),
  brandValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  categoryValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  productCodes: z.array(z.string().min(1).max(200)).max(300).optional(),
});
export type Fsos360Filters = z.infer<typeof fsos360FiltersSchema>;

export const fsos360QuerySchema = z.object({
  currentPeriod: dateRangeSchema,
  comparisonPeriod: dateRangeSchema,
  filters: fsos360FiltersSchema.default({}),
  analysisFocus: fsos360AnalysisFocusSchema.optional(),
  visualization: z.object({
    preferredType: z.enum(["auto", "heat-map", "coverage-map", "timeline", "line", "bar", "treemap", "route-map", "customer-density"]).optional(),
  }).optional(),
});
export type Fsos360Query = z.infer<typeof fsos360QuerySchema>;

export const fsos360FilterOptionsSchema = z.object({
  field: z.enum(["customer", "product", "brand", "category", "sales-rep"]),
  query: z.string().max(200).default(""),
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  context: fsos360QuerySchema,
});
export type Fsos360FilterOptionsQuery = z.infer<typeof fsos360FilterOptionsSchema>;

export const fsos360AvailabilitySchema = z.enum(["available", "partial", "unavailable", "not-applicable", "pending-business-approval"]);
export type Fsos360Availability = z.infer<typeof fsos360AvailabilitySchema>;

export const fsos360AvailabilityResultSchema = z.object({
  availability: fsos360AvailabilitySchema,
  reason: z.string().nullable(),
}).passthrough();

const fsos360OptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  meta: z.record(z.string()).optional(),
});

const fsos360BusinessMeaningSchema = z.object({
  code: z.string(),
  params: z.record(z.union([z.string(), z.number()])),
});

export const fsos360KpiSchema = z.object({
  id: z.enum(["sales", "collections", "returns", "lost-sales", "orders", "coverage", "strike-rate", "productivity"]),
  currentValue: z.number().nullable(),
  previousValue: z.number().nullable(),
  changeValue: z.number().nullable(),
  changePercentage: z.number().nullable(),
  direction: z.enum(["up", "down", "flat", "not-comparable"]),
  polarity: z.enum(["favorable", "unfavorable", "neutral", "unknown"]),
  businessMeaning: fsos360BusinessMeaningSchema.nullable(),
  availability: fsos360AvailabilitySchema,
  reason: z.string().nullable(),
});
export type Fsos360Kpi = z.infer<typeof fsos360KpiSchema>;

export const fsos360QueryResponseSchema = z.object({
  analysisContext: z.object({
    currentPeriod: dateRangeSchema,
    comparisonPeriod: dateRangeSchema,
    entityMode: z.union([fsos360AnalysisFocusSchema, z.literal("mixed")]),
  }),
  resolvedFilters: fsos360FiltersSchema,
  removedSelections: z.record(z.array(z.string())),
  activeAnalysisLevel: z.union([fsos360AnalysisFocusSchema, z.literal("mixed")]),
  smallFilterOptions: z.record(z.array(fsos360OptionSchema)),
  smartSlicerCapabilities: z.record(fsos360AvailabilityResultSchema),
  executiveInsight: z.object({ availability: fsos360AvailabilitySchema, reason: z.string().nullable(), items: z.array(fsos360BusinessMeaningSchema) }),
  kpis: z.array(fsos360KpiSchema),
  performanceComparison: z.array(fsos360KpiSchema),
  timeline: z.object({
    granularity: z.enum(["day", "week", "month"]),
    buckets: z.array(z.object({ position: z.number().int(), current: z.number().nullable(), comparison: z.number().nullable() })),
  }),
  target: fsos360AvailabilityResultSchema,
  visualization: fsos360AvailabilityResultSchema,
  opportunities: z.object({ availability: fsos360AvailabilitySchema, reason: z.string().nullable(), items: z.array(z.unknown()) }),
  recommendations: z.object({ availability: fsos360AvailabilitySchema, reason: z.string().nullable(), items: z.array(z.unknown()) }),
  capabilities: z.record(z.unknown()),
  generatedAt: z.string(),
}).passthrough();
export type Fsos360QueryResponse = z.infer<typeof fsos360QueryResponseSchema>;

export const fsos360FilterOptionsResponseSchema = z.object({
  field: fsos360FilterOptionsSchema.shape.field,
  resolvedFilters: fsos360FiltersSchema,
  removedSelections: z.record(z.array(z.string())),
  availability: fsos360AvailabilitySchema,
  reason: z.string().nullable(),
  options: z.array(fsos360OptionSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
}).passthrough();
export type Fsos360FilterOptionsResponse = z.infer<typeof fsos360FilterOptionsResponseSchema>;

export const fsos360CapabilitiesResponseSchema = z.record(z.unknown());
export type Fsos360CapabilitiesResponse = z.infer<typeof fsos360CapabilitiesResponseSchema>;
