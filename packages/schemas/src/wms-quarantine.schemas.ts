import { z } from "zod";
const reason = z.string().trim().min(3).max(300);
const positive = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/).refine(v => /[1-9]/.test(v));
export const wmsQuarantineHoldSchema = z.object({ reference: z.string().trim().min(1).max(80),
  batchId: z.string().trim().min(1).max(160), quantity: positive, unit: z.enum(["BASE", "CARTON"]), reason,
  idempotencyKey: z.string().uuid(),
}).strict();
export const wmsQuarantineStepSchema = z.object({ quantity: positive, version: z.number().int().positive(), reason, idempotencyKey: z.string().uuid() }).strict();
export type WmsQuarantineHoldInput = z.infer<typeof wmsQuarantineHoldSchema>;
export type WmsQuarantineStepInput = z.infer<typeof wmsQuarantineStepSchema>;
export interface WmsQuarantineCandidate {
  batchId: string; productCode: string; productName: string; batchCode: string; baseUnit: string;
  piecesPerCarton: number; physical: string; available: string; quarantined: string; holdable: string;
}
export interface WmsQuarantineDocument {
  id: string; reference: string; reason: string; status: "OPEN" | "PARTIAL" | "CLOSED"; version: number;
  productCode: string; productName: string; batchCode: string; batchId: string; baseUnit: string;
  unit: "BASE" | "CARTON"; conversionFactor: number; held: string; released: string; writtenOff: string; remaining: string;
  physical: string; available: string; quarantined: string; releaseAllowed: boolean;
  createdAt: string;
}
export interface WmsQuarantineEvent {
  id: string; operation: "HOLD" | "RELEASE" | "WRITE_OFF"; quantity: string; reason: string;
  actorName: string; createdAt: string; movementId: string;
}
