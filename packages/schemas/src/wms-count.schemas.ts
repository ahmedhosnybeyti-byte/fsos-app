import { z } from "zod";

const id = z.string().trim().min(1).max(160);
const reason = z.string().trim().min(3).max(300);
const quantity = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
export const wmsCountDraftSchema = z.object({
  reference: z.string().trim().min(1).max(80), reason, idempotencyKey: z.string().uuid(),
  lines: z.array(z.object({ batchId: id, revision: z.string().regex(/^\d{1,19}$/),
    countedQuantity: quantity, unit: z.enum(["BASE", "CARTON"]),
  }).strict()).min(1).max(20).refine(lines => new Set(lines.map(l => l.batchId)).size === lines.length),
}).strict();
export const wmsCountStepSchema = z.object({ version: z.number().int().positive(), reason, idempotencyKey: z.string().uuid() }).strict();
export type WmsCountDraftInput = z.infer<typeof wmsCountDraftSchema>;
export type WmsCountStepInput = z.infer<typeof wmsCountStepSchema>;
export interface WmsCountCandidate {
  batchId: string; productCode: string; productName: string; batchCode: string; expiryDate: string|null;
  baseUnit: string; piecesPerCarton: number; physical: string; physicalCartons: string|null;
  reserved: string; quarantined: string; revision: string;
}
export interface WmsCountSummary {
  id: string; reference: string; reason: string; status: "DRAFT"|"POSTED"|"CANCELLED"; version: number;
  createdAt: string; approvedAt: string|null; approvedBy: string|null;
}
export interface WmsCountLine {
  id: string; batchId: string; productCode: string; productName: string; batchCode: string; baseUnit: string; piecesPerCarton?: number;
  unit: "BASE"|"CARTON"; conversionFactor: number; systemQuantity: string; countedQuantity: string;
  difference: string; differenceBase: string; shortage: string; surplus: string; movementId: string|null;
}
export interface WmsCountDocument extends WmsCountSummary {
  lines: WmsCountLine[];
  events: { id: string; action: string; actorName: string; reason: string; createdAt: string }[];
}
