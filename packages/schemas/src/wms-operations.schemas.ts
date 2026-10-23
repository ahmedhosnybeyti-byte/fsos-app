import { z } from "zod";
import {wmsCorePermissions,wmsCoreInputs} from "./wms-core.schemas";
const id=z.string().trim().min(1).max(160);
export const wmsDecimal=z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
export const wmsPositive=wmsDecimal.refine(v=>/[1-9]/.test(v),"Positive quantity required");
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const n=new Date(v+"T00:00:00Z");return !isNaN(n.valueOf())&&n.toISOString().slice(0,10)===v&&v>="1900-01-01"&&v<="2199-12-31";});
const key=z.string().uuid();const note=z.string().trim().min(3).max(300);
export const wmsReceiptLineSchema=z.object({
  productId:id,batchId:id.nullable().default(null),batchCode:z.string().trim().min(1).max(80).refine(v=>!v.startsWith("__")).nullable().default(null),
  productionDate:date.nullable().default(null),expiryDate:date.nullable().default(null),unit:z.enum(["BASE","CARTON"]),
  expectedQuantity:wmsPositive,acceptedQuantity:wmsDecimal,quarantinedQuantity:wmsDecimal,rejectedQuantity:wmsDecimal,
  rejectionReason:z.string().trim().max(300).default(""),
}).strict().refine(v=>!(v.batchId&&v.batchCode),"Use existing lot or new lot metadata")
  .refine(v=>!v.productionDate||!v.expiryDate||v.expiryDate>v.productionDate,"Expiry must follow production");
export const wmsReceiptInputSchema=z.object({reference:z.string().trim().min(1).max(80),supplierName:z.string().trim().min(1).max(160),supplierReference:z.string().trim().min(1).max(80),lines:z.array(wmsReceiptLineSchema).min(1).max(20),note:note.default("Receiving document"),idempotencyKey:key}).strict();
export const wmsReceiptEditSchema=wmsReceiptInputSchema.extend({id,version:z.number().int().positive()});
export const wmsLoadLineSchema=z.object({productId:id.optional(),productCode:z.string().trim().min(1).max(40).optional(),quantity:wmsPositive,unit:z.enum(["BASE","CARTON"])}).strict().refine(v=>!!v.productId!==!!v.productCode,"Exactly one product identity required");
export const wmsLoadInputSchema=z.object({reference:z.string().trim().min(1).max(80),source:z.enum(["MANUAL","SMART_LOADING"]),proposalId:id.optional(),recipientId:id,customerCode:z.string().trim().min(1).max(80).nullable().default(null),targetDate:date,lines:z.array(wmsLoadLineSchema).min(1).max(20),note:note.default("Warehouse loading"),idempotencyKey:key}).strict();
export const wmsStepSchema=z.object({id,version:z.number().int().positive(),note,idempotencyKey:key}).strict();
export const wmsPickSchema=wmsStepSchema.extend({allocations:z.array(z.object({id,quantity:wmsDecimal}).strict()).min(1).max(100),discrepancyReason:z.string().trim().max(300).default("")});
export const wmsFefoSchema=z.object({productId:id,quantity:wmsPositive,unit:z.enum(["BASE","CARTON"]).default("BASE"),targetDate:date,customerCode:z.string().trim().min(1).max(80).optional()}).strict();
export const wmsPolicySchema=z.object({customerCode:z.string().trim().min(1).max(80),minShelfLifeDays:z.number().int().min(0).max(3650),version:z.number().int().min(0)}).strict();
export const WMS_OPERATION_PERMISSIONS={
  ...wmsCorePermissions,
  "receipt.create":"wms.receiving.create","receipt.edit":"wms.receiving.create","receipt.submit":"wms.receiving.create","receipt.cancel":"wms.receiving.create",
  "receipt.review":"wms.receiving.review","receipt.return-draft":"wms.receiving.review","receipt.approve":"wms.receiving.approve","receipt.reverse":"wms.receiving.approve",
  "load.create":"wms.request.create","load.reserve":"wms.reservation.manage","load.cancel":"wms.reservation.manage","load.pick":"wms.picking.manage",
  "load.review":"wms.picking.review","load.approve":"wms.dispatch.approve","load.dispatch":"wms.dispatch.execute",
  "load.accept":"wms.custody.accept","load.reject":"wms.custody.accept","load.receive-return":"wms.dispatch.approve",
} as const;
export type WmsOperation=keyof typeof WMS_OPERATION_PERMISSIONS;
export const wmsOperationSchema=z.enum(Object.keys(WMS_OPERATION_PERMISSIONS) as [WmsOperation,...WmsOperation[]]);
export const wmsCommandSchema=z.object({operation:wmsOperationSchema,input:z.unknown()}).strict();
export function wmsInputSchema(op:WmsOperation){return wmsCoreInputs[op as keyof typeof wmsCoreInputs]??(op==="receipt.create"?wmsReceiptInputSchema:op==="receipt.edit"?wmsReceiptEditSchema:op==="load.create"?wmsLoadInputSchema:op==="load.pick"?wmsPickSchema:wmsStepSchema); }
export interface WmsDocumentSummary{id:string;reference:string;status:string;version:number;createdAt:string;supplierName?:string;recipientName?:string;recipientId?:string;source?:string;partial?:boolean}
export interface WmsWorkflowEvent{id:string;operation:string;fromStatus:string|null;toStatus:string;note:string;actorName:string;createdAt:string}
export interface WmsReceiptLine {id:string;productId:string;productName:string;sensitiveHandling?:boolean;handlingNotes?:string|null;productCode:string;baseUnit:string;trackBatches:boolean;trackExpiry:boolean;piecesPerCarton:number;batchId:string|null;batchCode:string|null;productionDate:string|null;expiryDate:string|null;unit:"BASE"|"CARTON";conversionFactor:number;expectedQuantity:string;acceptedQuantity:string;quarantinedQuantity:string;rejectedQuantity:string;rejectionReason:string}
export interface WmsReceipt extends WmsDocumentSummary {supplierName:string;supplierReference:string;lines:WmsReceiptLine[];events:WmsWorkflowEvent[]}
export interface WmsLoadLine {id:string;productId:string;productName:string;sensitiveHandling?:boolean;handlingNotes?:string|null;baseUnit:string;piecesPerCarton?:number;quantity:string;unit:string;conversionFactor:number;requestedBase:string}
export interface WmsAllocation {id:string;productName:string;sensitiveHandling?:boolean;handlingNotes?:string|null;baseUnit:string;piecesPerCarton?:number;batchId:string;batchCode:string;expiryDate:string|null;allocatedQuantity:string;reservedQuantity:string;pickedQuantity:string;dispatchedQuantity:string;reason:string;policyMinDays:number}
export interface WmsLoad extends WmsDocumentSummary {recipientId:string;recipientName:string;source:string;customerCode:string|null;targetDate:string;discrepancyReason:string|null;lines:WmsLoadLine[];allocations:WmsAllocation[];events:WmsWorkflowEvent[];minShelfLifeDays:number}
export interface WmsFefoChoice {batchId:string;batchCode:string;quantity:string;available:string;expiryDate:string|null;reason:string}
export interface WmsFefoResult {choices:WmsFefoChoice[];requestedBase:string;allocatedBase:string;fulfillable:boolean;minShelfLifeDays:number;targetDate:string;cutoffDate:string;limitExceeded:boolean}
export interface WmsCustomerPolicy{customerCode:string;minShelfLifeDays:number;version:number}
