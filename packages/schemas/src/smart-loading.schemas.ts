import { z } from "zod";

// Smart Loading â€” read-only loading-preparation session, computed entirely
// from RIE-scoped real data at request time (no new Excel reads, no new
// Prisma table, no persistence). Every field below is sourced from an
// existing Canonical Entity via RieFacade, using the exact same
// company/role hierarchy scoping every other RIE-backed module already
// uses (server-derived, no manual scope picker) â€” see
// smart-loading.service.ts for the field-by-field provenance.
//
// 2026-07-28: initial real data source. `category` <- Products.Category.
// `lastSaleDate` <- max(Invoices.InvoiceDate) per ProductCode across
// Invoice Items joined to Invoices, within the caller's RIE scope.
// `currentVehicleStock` <- Van Inventory (Quantity at the latest
// ReportDate for the caller's own RouteID(s)) â€” confirmed as a real,
// already-consumed Canonical Entity (see visit-copilot.service.ts's
// latestVanStockSet) after re-checking the RIE registry; not a gap that
// needed inventing. `weeklyAverageSales` <- Invoice Items/Invoices,
// averaged over the last 4 full weeks of actual sales in scope.
export const smartLoadingPrioritySchema = z.enum(["high", "normal"]);
export type SmartLoadingPriority = z.infer<typeof smartLoadingPrioritySchema>;

// This is only the initial UI/API default. Every stale calculation receives
// the user-selected threshold; it must never be treated as a business-rule constant.
export const DEFAULT_SMART_LOADING_STALE_DAYS = 4;
export const smartLoadingStaleDaysThresholdSchema = z.coerce.number().int().min(1).default(DEFAULT_SMART_LOADING_STALE_DAYS);

/**
 * Management Loading Risk: current Vehicle Stock is the business-approved
 * actual loaded quantity for the latest Van Inventory report.
 */
export const smartLoadingManagementLoadingRiskQuerySchema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  salesFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  salesTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type SmartLoadingManagementLoadingRiskQuery = z.infer<typeof smartLoadingManagementLoadingRiskQuerySchema>;
export const smartLoadingManagementLoadingRiskProductSchema = z.object({
  productCode: z.string(), productName: z.string(), expectedDemand: z.number(), currentVehicleStock: z.number(), quantityGap: z.number().positive(),
});
export type SmartLoadingManagementLoadingRiskProduct = z.infer<typeof smartLoadingManagementLoadingRiskProductSchema>;
export const smartLoadingManagementLoadingRiskRouteSchema = z.object({ routeId: z.string(), products: z.array(smartLoadingManagementLoadingRiskProductSchema) });
export type SmartLoadingManagementLoadingRiskRoute = z.infer<typeof smartLoadingManagementLoadingRiskRouteSchema>;
export const smartLoadingManagementLoadingRiskPersonSchema = z.object({ employeeId: z.string(), employeeName: z.string(), affectedRouteCount: z.number().int().positive(), affectedProductCount: z.number().int().positive(), routes: z.array(smartLoadingManagementLoadingRiskRouteSchema) });
export type SmartLoadingManagementLoadingRiskPerson = z.infer<typeof smartLoadingManagementLoadingRiskPersonSchema>;
export const smartLoadingManagementLoadingRiskResponseSchema = z.object({ targetDate: z.string(), salesFrom: z.string(), salesTo: z.string(), affectedPersonCount: z.number().int().nonnegative(), people: z.array(smartLoadingManagementLoadingRiskPersonSchema) });
export type SmartLoadingManagementLoadingRiskResponse = z.infer<typeof smartLoadingManagementLoadingRiskResponseSchema>;

export const smartLoadingProductSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
  currentVehicleStock: z.number().nullable(),
  weeklyAverageSales: z.number(),
  priority: smartLoadingPrioritySchema,
  category: z.string().nullable(),
  lastSaleDate: z.string().nullable(),
  isStale: z.boolean(),
});
export type SmartLoadingProduct = z.infer<typeof smartLoadingProductSchema>;

/** Management-only vehicle-market monitor row. Never a loading recommendation. */
export const smartLoadingManagementVehicleProductSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  currentVehicleStock: z.number(),
  weeklyAverageSales: z.number(),
  alignmentPercent: z.number().min(0).max(100),
});
export type SmartLoadingManagementVehicleProduct = z.infer<typeof smartLoadingManagementVehicleProductSchema>;

export const smartLoadingStaleProductCustomerSchema = z.object({
  customerCode: z.string(),
  customerName: z.string(),
  totalQuantity: z.number(),
  purchaseFrequency: z.number().int().positive(),
  lastPurchaseDate: z.string(),
});
export type SmartLoadingStaleProductCustomer = z.infer<typeof smartLoadingStaleProductCustomerSchema>;

export const smartLoadingStaleProductPlanSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  currentVehicleStock: z.number(),
  lastSaleDate: z.string(),
  customers: z.array(smartLoadingStaleProductCustomerSchema),
});
export type SmartLoadingStaleProductPlan = z.infer<typeof smartLoadingStaleProductPlanSchema>;

/** Management-only popup detail: each stale Route × Product state remains distinct. */
export const smartLoadingManagementStaleRouteProductSchema = z.object({
  routeId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  currentVehicleStock: z.number(),
  lastSaleDate: z.string(),
});
export type SmartLoadingManagementStaleRouteProduct = z.infer<typeof smartLoadingManagementStaleRouteProductSchema>;

export const smartLoadingRouteSchema = z.object({
  targetDate: z.string(),
  customerCount: z.number().int().nonnegative(),
});
export type SmartLoadingRoute = z.infer<typeof smartLoadingRouteSchema>;
export const smartLoadingRouteCustomerSchema = z.object({ customerCode: z.string(), customerName: z.string(), routeId: z.string().nullable(), visitSequence: z.number().nullable() });
export type SmartLoadingRouteCustomer = z.infer<typeof smartLoadingRouteCustomerSchema>;
export const smartLoadingCustomerSearchResultSchema = z.object({ customers: z.array(smartLoadingRouteCustomerSchema) });
export type SmartLoadingCustomerSearchResult = z.infer<typeof smartLoadingCustomerSearchResultSchema>;
export const smartLoadingHierarchyOptionSchema = z.object({ value: z.string(), label: z.string() });
export type SmartLoadingHierarchyOption = z.infer<typeof smartLoadingHierarchyOptionSchema>;
export const smartLoadingHierarchyOptionsSchema = z.object({
  managers: z.array(smartLoadingHierarchyOptionSchema),
  supervisors: z.array(smartLoadingHierarchyOptionSchema),
  salesReps: z.array(smartLoadingHierarchyOptionSchema),
});
export type SmartLoadingHierarchyOptions = z.infer<typeof smartLoadingHierarchyOptionsSchema>;
export const smartLoadingRecalculateInputSchema = z.object({ targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), visitsPerWeek: z.union([z.literal(1), z.literal(2), z.literal(6)]), staleDaysThreshold: smartLoadingStaleDaysThresholdSchema, salesRepId: z.string().trim().min(1).optional(), customerCodes: z.array(z.string().trim().min(1)).min(1).max(500), confirmedOrders: z.array(z.object({ productCode: z.string().trim().min(1), quantity: z.number().positive() })) });
export type SmartLoadingRecalculateInput = z.infer<typeof smartLoadingRecalculateInputSchema>;
export const smartLoadingRecalculatedProductSchema = z.object({ productCode: z.string(), productName: z.string(), estimatedCustomerDemand: z.number(), confirmedOrderQuantity: z.number(), safetyStock: z.number(), vehicleStock: z.number().nullable(), suggestedQuantity: z.number() });
export type SmartLoadingRecalculatedProduct = z.infer<typeof smartLoadingRecalculatedProductSchema>;
export const smartLoadingRecalculateResultSchema = z.object({ targetDate: z.string(), fromDate: z.string(), toDate: z.string(), calendarDaysInPeriod: z.number().int().positive(), products: z.array(smartLoadingRecalculatedProductSchema), calculatedAt: z.string() });
export type SmartLoadingRecalculateResult = z.infer<typeof smartLoadingRecalculateResultSchema>;

export const smartLoadingPriorityProductSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  routeCustomerCount: z.number().int().nonnegative(),
  totalQuantity: z.number(),
  currentVehicleStock: z.number().nullable(),
});
export type SmartLoadingPriorityProduct = z.infer<typeof smartLoadingPriorityProductSchema>;

export const smartLoadingManagementCategoryStockAlignmentSchema = z.object({
  category: z.string().nullable(),
  alignmentPercent: z.number().min(0).max(100),
});
export type SmartLoadingManagementCategoryStockAlignment = z.infer<typeof smartLoadingManagementCategoryStockAlignmentSchema>;

export const smartLoadingAttentionSchema = z.object({
  id: z.string(),
  message: z.string(),
});
export type SmartLoadingAttention = z.infer<typeof smartLoadingAttentionSchema>;

// A single customer/product opportunity for the next day's route. Quantities
// are net of confirmed returns and the suggested quantity uses the same
// whole-unit rounding convention as the Smart Loading screen.
export const smartLoadingLostOpportunitySchema = z.object({
  customerCode: z.string(),
  customerName: z.string(),
  productCode: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  baselineNetQuantity: z.number(),
  recentNetQuantity: z.number(),
  suggestedQuantity: z.number(),
});
export type SmartLoadingLostOpportunity = z.infer<typeof smartLoadingLostOpportunitySchema>;

// Why the optional Lost Opportunities list is empty. This is deliberately
// distinct from the loading-session state so vehicle-stock availability keeps
// its existing contract.
export const smartLoadingLostOpportunityReasonSchema = z.enum([
  "available",
  "no-tomorrow-route-customers",
  "no-baseline-sales",
  "no-lost-opportunities",
  "data-unavailable",
  "unsupported-visit-day-format",
]);
export type SmartLoadingLostOpportunityReason = z.infer<typeof smartLoadingLostOpportunityReasonSchema>;

export const smartLoadingReadySessionSchema = z.object({
  state: z.literal("ready"),
  products: z.array(smartLoadingProductSchema),
  managementVehicleProducts: z.array(smartLoadingManagementVehicleProductSchema).nullable(),
  managementStockAlignmentPercent: z.number().min(0).max(100).nullable(),
  managementCategoryStockAlignments: z.array(smartLoadingManagementCategoryStockAlignmentSchema).nullable(),
  staleCount: z.number().int().nonnegative(),
  managementStaleRouteProducts: z.array(smartLoadingManagementStaleRouteProductSchema).nullable(),
  staleProductPlans: z.array(smartLoadingStaleProductPlanSchema),
  attention: z.array(smartLoadingAttentionSchema),
  asOfDate: z.string(),
  staleAsOfDate: z.string(),
  staleDaysThreshold: z.number().int().positive(),
  targetDate: z.string(),
  route: smartLoadingRouteSchema.nullable(),
  routeCustomers: z.array(smartLoadingRouteCustomerSchema),
  priorityProducts: z.array(smartLoadingPriorityProductSchema),
  lostOpportunities: z.array(smartLoadingLostOpportunitySchema),
  lostOpportunityReason: smartLoadingLostOpportunityReasonSchema,
  calculatedAt: z.string(),
});
export type SmartLoadingReadySession = z.infer<typeof smartLoadingReadySessionSchema>;

export const smartLoadingVehicleStockUnavailableSessionSchema = z.object({
  state: z.literal("vehicle-stock-unavailable"),
  lostOpportunityReason: smartLoadingLostOpportunityReasonSchema.optional(),
  targetDate: z.string(),
  route: smartLoadingRouteSchema.nullable(),
  routeCustomers: z.array(smartLoadingRouteCustomerSchema),
});
export type SmartLoadingVehicleStockUnavailableSession = z.infer<typeof smartLoadingVehicleStockUnavailableSessionSchema>;

export const smartLoadingSessionSchema = z.discriminatedUnion("state", [
  smartLoadingReadySessionSchema,
  smartLoadingVehicleStockUnavailableSessionSchema,
]);
export type SmartLoadingSession = z.infer<typeof smartLoadingSessionSchema>;
