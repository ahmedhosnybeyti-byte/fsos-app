import { z } from "zod";
import { wmsPositive, wmsDecimal, wmsReceiptInputSchema } from "./wms-operations.schemas";
export const procurementPermissions={CREATE:"procurement.request.create",EDIT:"procurement.request.create",SUBMIT:"procurement.request.create",APPROVE:"procurement.request.approve",REJECT:"procurement.request.approve",ORDER:"procurement.order.create",CANCEL:"procurement.order.create",RECEIVE:"wms.receiving.create"} as const;
export type ProcurementOperation=keyof typeof procurementPermissions;
const id=z.string().trim().min(1).max(160);
const line=z.object({productId:id,quantity:wmsPositive,unit:z.enum(["BASE","CARTON"])}).strict();
const draft=z.object({reference:z.string().trim().min(1).max(60),lines:z.array(line).min(1).max(20)}).strict();
export const procurementCommandSchema=z.object({operation:z.enum(["CREATE","EDIT","SUBMIT","APPROVE","REJECT","ORDER","CANCEL","RECEIVE"]),id:id.optional(),version:z.number().int().positive().optional(),reason:z.string().trim().min(3).max(300),idempotencyKey:z.string().uuid(),draft:draft.optional(),supplierId:id.optional(),prices:z.array(z.object({productId:id,price:wmsDecimal.nullable()}).strict()).max(20).optional(),receipt:wmsReceiptInputSchema.omit({idempotencyKey:true,supplierName:true,supplierReference:true,note:true}).optional()}).strict().superRefine((v,c)=>{
 if(["CREATE","EDIT"].includes(v.operation)&&!v.draft)c.addIssue({code:"custom",message:"Draft required"});
 if(v.operation!=="CREATE"&&(!v.id||!v.version))c.addIssue({code:"custom",message:"Document and version required"});
 if(v.operation==="ORDER"&&!v.supplierId)c.addIssue({code:"custom",message:"Supplier required"});
 if(v.operation==="RECEIVE"&&!v.receipt)c.addIssue({code:"custom",message:"Receipt required"});
});
export type ProcurementCommand=z.input<typeof procurementCommandSchema>;
export interface ProcurementSummary{pending:number;open:number;partial:number;remaining:{unit:string;quantity:string}[]}
export interface ProcurementDocument{id:string;reference:string;status:string;version:number;creatorId:string;reason:string;orderId:string|null;supplierName:string|null}
export interface ProcurementLine{category?:string|null;productId:string;productCode:string;productName:string;quantity:string;unit:"BASE"|"CARTON";factor:number;piecesPerCarton:number;baseUnit:string;trackBatches:boolean;trackExpiry:boolean;received:string;remaining:string;price:string|null}
export interface ProcurementDetail extends ProcurementDocument{lines:ProcurementLine[];receipts:{id:string;reference:string;status:string}[];events:{operation:string;reason:string;actorName:string}[]}
export interface ProcurementSupplier{id:string;code:string;name:string}
