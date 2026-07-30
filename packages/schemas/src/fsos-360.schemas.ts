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

export const fsos360VisualizationTypeSchema = z.enum(["timeline", "line", "bar", "treemap", "heat-map", "coverage-map", "route-map", "customer-density"]);
export type Fsos360VisualizationType = z.infer<typeof fsos360VisualizationTypeSchema>;

export const fsos360QuerySchema = z.object({
  currentPeriod: dateRangeSchema,
  comparisonPeriod: dateRangeSchema,
  filters: fsos360FiltersSchema.default({}),
  analysisFocus: fsos360AnalysisFocusSchema.optional(),
  visualization: z.object({
    preferredType: z.enum(["auto", ...fsos360VisualizationTypeSchema.options]).optional(),
    metric: z.enum(["sales", "collections", "returns"]).optional(),
    groupBy: z.enum(["product", "brand"]).optional(),
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

export const fsos360RegionCityOptionSchema = fsos360OptionSchema.extend({
  level: z.enum(["region", "city"]),
  parentRegionId: z.string().optional(),
});
export type Fsos360RegionCityOption = z.infer<typeof fsos360RegionCityOptionSchema>;

const fsos360SmallFilterOptionsSchema = z.object({
  regionCity: z.array(fsos360RegionCityOptionSchema),
}).catchall(z.array(fsos360OptionSchema));

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

const fsos360VisualizationSeriesDataSchema = z.object({
  kind: z.literal("series"),
  series: z.array(z.object({
    key: z.string(),
    label: z.string(),
    current: z.number().nullable(),
    comparison: z.number().nullable(),
  })),
});

const fsos360VisualizationCategoriesDataSchema = z.object({
  kind: z.literal("categories"),
  items: z.array(z.object({
    key: z.string(),
    label: z.string(),
    current: z.number(),
    previous: z.number(),
    change: z.number(),
  })),
});

const fsos360VisualizationTreemapDataSchema = z.object({
  kind: z.literal("treemap"),
  groupBy: z.enum(["product", "brand"]),
  items: z.array(z.object({
    key: z.string(),
    label: z.string(),
    value: z.number(),
    isOther: z.boolean(),
  })),
});

const fsos360VisualizationGeoPointsDataSchema = z.object({
  kind: z.literal("geo-points"),
  metric: z.enum(["sales", "collections", "returns", "density", "coverage"]),
  points: z.array(z.object({
    customerCode: z.string(),
    customerName: z.string(),
    routeId: z.string().nullable(),
    latitude: z.number(),
    longitude: z.number(),
    value: z.number(),
  })),
});

export const fsos360VisualizationDataSchema = z.discriminatedUnion("kind", [
  fsos360VisualizationSeriesDataSchema,
  fsos360VisualizationCategoriesDataSchema,
  fsos360VisualizationTreemapDataSchema,
  fsos360VisualizationGeoPointsDataSchema,
]);
export type Fsos360VisualizationData = z.infer<typeof fsos360VisualizationDataSchema>;

export const fsos360VisualizationSchema = z.object({
  selectedType: fsos360VisualizationTypeSchema,
  availableTypes: z.array(z.object({
    type: fsos360VisualizationTypeSchema,
    availability: z.enum(["available", "unavailable", "not-applicable"]),
    reason: z.string().nullable().optional(),
  })),
  data: fsos360VisualizationDataSchema.nullable(),
  meta: z.object({
    totalRows: z.number().int().nonnegative(),
    mappedRows: z.number().int().nonnegative().optional(),
    unmappedRows: z.number().int().nonnegative().optional(),
    routeGeometryAvailable: z.boolean().optional(),
    generatedAt: z.string(),
  }),
});
export type Fsos360Visualization = z.infer<typeof fsos360VisualizationSchema>;

export const fsos360QueryResponseSchema = z.object({
  analysisContext: z.object({
    currentPeriod: dateRangeSchema,
    comparisonPeriod: dateRangeSchema,
    entityMode: z.union([fsos360AnalysisFocusSchema, z.literal("mixed")]),
  }),
  resolvedFilters: fsos360FiltersSchema,
  removedSelections: z.record(z.array(z.string())),
  activeAnalysisLevel: z.union([fsos360AnalysisFocusSchema, z.literal("mixed")]),
  smallFilterOptions: fsos360SmallFilterOptionsSchema,
  smartSlicerCapabilities: z.record(fsos360AvailabilityResultSchema),
  executiveInsight: z.object({ availability: fsos360AvailabilitySchema, reason: z.string().nullable(), items: z.array(fsos360BusinessMeaningSchema) }),
  kpis: z.array(fsos360KpiSchema),
  performanceComparison: z.array(fsos360KpiSchema),
  timeline: z.object({
    granularity: z.enum(["day", "week", "month"]),
    buckets: z.array(z.object({ position: z.number().int(), current: z.number().nullable(), comparison: z.number().nullable() })),
  }),
  target: fsos360AvailabilityResultSchema,
  visualization: fsos360VisualizationSchema,
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
