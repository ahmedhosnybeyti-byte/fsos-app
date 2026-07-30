import { z } from "zod";

// Smart Loading — read-only loading-preparation session, computed entirely
// from RIE-scoped real data at request time (no new Excel reads, no new
// Prisma table, no persistence). Every field below is sourced from an
// existing Canonical Entity via RieFacade, using the exact same
// company/role hierarchy scoping every other RIE-backed module already
// uses (server-derived, no manual scope picker) — see
// smart-loading.service.ts for the field-by-field provenance.
//
// 2026-07-28: initial real data source. `category` <- Products.Category.
// `lastSaleDate` <- max(Invoices.InvoiceDate) per ProductCode across
// Invoice Items joined to Invoices, within the caller's RIE scope.
// `currentVehicleStock` <- Van Inventory (Quantity at the latest
// ReportDate for the caller's own RouteID(s)) — confirmed as a real,
// already-consumed Canonical Entity (see visit-copilot.service.ts's
// latestVanStockSet) after re-checking the RIE registry; not a gap that
// needed inventing. `weeklyAverageSales` <- Invoice Items/Invoices,
// averaged over the last 4 full weeks of actual sales in scope.
export const smartLoadingPrioritySchema = z.enum(["high", "normal"]);
export type SmartLoadingPriority = z.infer<typeof smartLoadingPrioritySchema>;

export const smartLoadingProductSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
  currentVehicleStock: z.number(),
  weeklyAverageSales: z.number(),
  priority: smartLoadingPrioritySchema,
  category: z.string().nullable(),
  lastSaleDate: z.string().nullable(),
});
export type SmartLoadingProduct = z.infer<typeof smartLoadingProductSchema>;

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
  baselineNetQuantity: z.number(),
  recentNetQuantity: z.number(),
  suggestedQuantity: z.number(),
});
export type SmartLoadingLostOpportunity = z.infer<typeof smartLoadingLostOpportunitySchema>;

export const smartLoadingReadySessionSchema = z.object({
  state: z.literal("ready"),
  products: z.array(smartLoadingProductSchema),
  attention: z.array(smartLoadingAttentionSchema),
  asOfDate: z.string(),
  lostOpportunities: z.array(smartLoadingLostOpportunitySchema),
  calculatedAt: z.string(),
});
export type SmartLoadingReadySession = z.infer<typeof smartLoadingReadySessionSchema>;

export const smartLoadingVehicleStockUnavailableSessionSchema = z.object({
  state: z.literal("vehicle-stock-unavailable"),
});
export type SmartLoadingVehicleStockUnavailableSession = z.infer<typeof smartLoadingVehicleStockUnavailableSessionSchema>;

export const smartLoadingSessionSchema = z.discriminatedUnion("state", [
  smartLoadingReadySessionSchema,
  smartLoadingVehicleStockUnavailableSessionSchema,
]);
export type SmartLoadingSession = z.infer<typeof smartLoadingSessionSchema>;
