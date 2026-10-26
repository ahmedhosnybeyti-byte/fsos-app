import { z } from "zod";
const id=z.string().trim().min(1).max(160),key=z.string().uuid(),note=z.string().trim().min(3).max(300);
const positive=z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/).refine(v=>/[1-9]/.test(v));
const unit=z.enum(["BASE","CARTON"]);
export const wmsReturnInputSchema=z.object({reference:z.string().trim().min(1).max(80),sourceId:id,note,idempotencyKey:key,
 lines:z.array(z.object({sourceLineId:id,declaredQuantity:positive,actualQuantity:positive,unit,quality:z.enum(["GOOD","DAMAGED","EXPIRED","QUARANTINED"]),fromQuarantine:z.boolean().default(false),discrepancyReason:z.string().trim().max(300).default("")}).strict()).min(1).max(20)}).strict();
const step=z.object({id,version:z.number().int().positive(),note,idempotencyKey:key}).strict();
export const wmsProposalInputSchema=z.object({targetDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+"T00:00:00Z");return !isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v&&v>="1900-01-01"&&v<="2199-12-31";}),
 lines:z.array(z.object({productCode:z.string().trim().min(1).max(40).transform(v=>v.toUpperCase()),quantity:positive,unit}).strict()).min(1),note,idempotencyKey:key}).strict();
export const wmsQualitySchema=z.object({batchId:id,note,idempotencyKey:key}).strict();
export const wmsCorePermissions={
 "supplier.create":"wms.supplier-return.create","supplier.submit":"wms.supplier-return.create","supplier.cancel":"wms.supplier-return.create","supplier.review":"wms.supplier-return.review","supplier.post":"wms.supplier-return.post","supplier.confirm":"wms.supplier-return.post",
 "rep-return.create":"wms.rep-return.create","rep-return.submit":"wms.rep-return.create","rep-return.cancel":"wms.rep-return.create","rep-return.review":"wms.rep-return.review","rep-return.post":"wms.rep-return.post",
 "proposal.create":"wms.request.create","quality.hold":"wms.quality.manage","quality.unblock":"wms.quality.manage",
} as const;
export const wmsCoreInputs:Record<keyof typeof wmsCorePermissions,z.ZodTypeAny>={
 "supplier.create":wmsReturnInputSchema,"supplier.submit":step,"supplier.cancel":step,"supplier.review":step,"supplier.post":step,"supplier.confirm":step.extend({handoverReference:z.string().trim().min(1).max(80)}),
 "rep-return.create":wmsReturnInputSchema,"rep-return.submit":step,"rep-return.cancel":step,"rep-return.review":step,"rep-return.post":step,"proposal.create":wmsProposalInputSchema,"quality.hold":wmsQualitySchema,"quality.unblock":wmsQualitySchema,
};
export type WmsReturnKind="SUPPLIER"|"REP";
export interface WmsReturnSourceLine{category?:string|null;sourceLineId:string;productId:string;productName:string;sensitiveHandling?:boolean;handlingNotes?:string|null;batchId:string;batchCode:string;expiryDate:string|null;baseUnit:string;piecesPerCarton:number;sourceBase:string;remainingBase:string;physical:string;available:string;quarantined:string;custody:string}
export interface WmsReturnSource{id:string;reference:string;partyName:string;lines:WmsReturnSourceLine[]}
export interface WmsReturnSummary{id:string;reference:string;kind:WmsReturnKind;status:string;version:number;reason:string;sourceId:string;sourceReference:string;partyName:string;handoverReference:string|null}
export interface WmsReturnLine{category?:string|null; id:string;sourceLineId:string;productName:string;sensitiveHandling?:boolean;handlingNotes?:string|null;batchCode:string;baseUnit:string;piecesPerCarton?:number;unit:"BASE"|"CARTON";conversionFactor:number;declaredQuantity:string;actualQuantity:string;quantityBase:string;quality:string;fromQuarantine:boolean;discrepancyReason:string;destination:string|null }
export interface WmsReturnDocument extends WmsReturnSummary{lines:WmsReturnLine[];events:{id:string;operation:string;actorName:string;note:string;createdAt:string}[]}
