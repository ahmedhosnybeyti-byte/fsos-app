import { z } from "zod";

const id = z.string().trim().min(1).max(100);
export const wmsPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  search: z.string().trim().max(80).default(""),
}).strict();
export const wmsStockQuerySchema = wmsPageSchema.extend({
  productId: id.optional(), nearExpiry: z.enum(["true", "false"]).default("false"),
  horizon: z.coerce.number().int().min(1).max(365).default(30),
});
export const wmsProductSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).transform(v => v.toUpperCase()),
  barcode: z.string().trim().min(1).max(80).nullable().default(null),
  name: z.string().trim().min(1).max(160), baseUnit: z.enum(["PIECE", "KG", "LITRE"]).default("PIECE"),
  piecesPerCarton: z.number().int().min(1).max(1000000).default(1),
  trackBatches: z.boolean().default(false), trackExpiry: z.boolean().default(false),
  sensitiveHandling: z.boolean().default(false), handlingNotes: z.string().trim().max(600).nullable().default(null),
  isActive: z.boolean().default(true),
}).strict();
function validProduct(v: z.infer<typeof wmsProductSchema>) {
  return (!v.trackExpiry || v.trackBatches) && (v.baseUnit === "PIECE" || v.piecesPerCarton === 1);
}
export const wmsCreateProductSchema = wmsProductSchema.refine(validProduct, "Expiry requires batch tracking; cartons require PIECE base unit");
export const wmsUpdateProductSchema = wmsProductSchema.extend({ version: z.number().int().positive() }).refine(validProduct);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0,10) === v && v >= "1900-01-01" && v <= "2199-12-31";
}, "Invalid calendar date");
export const wmsBatchSchema = z.object({
  productId: id, code: z.string().trim().min(1).max(80).refine(v => !v.startsWith("__")),
  productionDate: date.nullable().default(null), expiryDate: date.nullable().default(null),
  isQuarantined: z.boolean().default(false),
}).strict().refine(v => !v.productionDate || !v.expiryDate || v.expiryDate > v.productionDate, "Expiry must follow production");
// Never coerce quantities through a JS floating point number.
export const wmsOpeningSchema = z.object({
  productId: id, batchId: id.nullable().default(null),
  quantity: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/).refine(v => /[1-9]/.test(v), "Quantity must be positive"),
  unit: z.enum(["BASE", "CARTON"]), quarantined: z.boolean().default(false),
  reference: z.string().trim().min(1).max(80), reason: z.string().trim().min(3).max(300),
  idempotencyKey: z.string().uuid(),
}).strict();
export const wmsReversalSchema = z.object({ reason: z.string().trim().min(3).max(300), idempotencyKey: z.string().uuid() }).strict();
export const wmsAccessSchema = z.object({ userId: id, granted: z.boolean() }).strict();
export type WmsProductInput = z.infer<typeof wmsCreateProductSchema>;
export type WmsBatchInput = z.infer<typeof wmsBatchSchema>;
export type WmsOpeningInput = z.infer<typeof wmsOpeningSchema>;
export type WmsReversalInput = z.infer<typeof wmsReversalSchema>;
export interface WmsPage<T> { items: T[]; page: number; hasMore: boolean }
export interface WmsWarehouse { id: string; code: string; name: string }
export interface WmsProduct extends WmsProductInput { id: string; category?: string | null; version: number; physical: string; available: string; reserved: string; quarantined: string; inTransit: string }
export interface WmsBatch {
  id: string; productId: string; productName: string; baseUnit: string; piecesPerCarton?: number; code: string;
  productionDate: string | null; expiryDate: string | null; isQuarantined: boolean; qualityBlocked:boolean;
  physical: string; available: string; reserved: string; quarantined: string; inTransit: string;
  daysRemaining: number | null; lifeConsumedPct: string | null;
}
export interface WmsSummary {
  cartons?: { physical: string; available: string; reserved: string; quarantined: string; expired: string; inTransit: string };
  units: { baseUnit: string; physical: string; available: string; reserved: string; quarantined: string; expired: string; inTransit: string }[];
  nearExpiryBatches: number; expiredBatches: number; stockedProducts: number; asOf: string;
}
export interface WmsMovement {
  piecesPerCarton?: number;
  id: string; productName: string; batchCode: string; kind: "OPENING" | "REVERSAL" | "RECEIPT" | "RECEIPT_REVERSAL" | "RESERVE" | "RELEASE" | "DISPATCH" | "ACCEPT" | "TRANSIT_RETURN"|"SUPPLIER_RETURN"|"REP_RETURN"|"QUALITY_HOLD"|"QUALITY_RELEASE"|"ADJUSTMENT"|"QUARANTINE_HOLD"|"QUARANTINE_RELEASE"|"WRITE_OFF";
  quantity: string; baseUnit: string; inputQuantity: string; inputUnit: string; conversionFactor: number;
  reference: string; reason: string; createdAt: string; reversalOf: string | null; reversed: boolean;
  reservedDelta: string; inTransitDelta: string;
}
export interface WmsAccessUser { id: string; fullName: string; granted: boolean }
