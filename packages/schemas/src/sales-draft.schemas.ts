import { z } from "zod";

export const SALES_DRAFT_PERMISSION = "sales.drafts.manage";
const key = z.string().uuid();
export const salesDraftCreateSchema = z.object({ commandKey: key }).strict();
export const salesDraftLineSchema = z.object({
  productId: z.string().min(1).max(100),
  quantity: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/).refine(v => /[1-9]/.test(v), "Positive exact quantity required"),
  unit: z.enum(["BASE", "CARTON"]),
}).strict();
export const salesDraftSaveSchema = z.object({
  commandKey: key, version: z.number().int().nonnegative(),
  warehouseId: z.string().min(1).max(100).nullable(),
  notes: z.string().trim().max(2000), lines: z.array(salesDraftLineSchema).max(20),
}).strict().superRefine((v,c) => {
  if (v.lines.length && !v.warehouseId) c.addIssue({code:"custom",path:["warehouseId"],message:"Warehouse required"});
  if (new Set(v.lines.map(l=>l.productId)).size !== v.lines.length) c.addIssue({code:"custom",path:["lines"],message:"Duplicate product"});
});
export const salesDraftCancelSchema = z.object({ commandKey: key, version: z.number().int().nonnegative() }).strict();
export const salesDraftPageSchema = z.object({ page:z.coerce.number().int().min(1).max(1000).default(1), search:z.string().trim().max(80).default("") }).strict();
export type SalesDraftSave = z.infer<typeof salesDraftSaveSchema>;
export interface SalesDraftLine {category?:string|null;
  lineNo:number; productId:string; productCode:string; productName:string; baseUnit:string;
  quantity:string; unit:"BASE"|"CARTON"; conversionFactor:number; quantityBase:string;
}
export interface SalesDraft {
  id:string; visitId:string; customerCode:string; customerName:string; repName:string;
  status:"DRAFT"|"CANCELLED"; version:number; warehouseId:string|null; warehouseName:string|null;
  notes:string; createdAt:string; updatedAt:string; lines:SalesDraftLine[]; editable:boolean;
}
export interface SalesDraftProduct {category?:string|null; id:string; code:string; name:string; baseUnit:string; piecesPerCarton:number; cartonAllowed:boolean }
export type SalesDraftAvailability = "AVAILABLE" | "UNAVAILABLE" | "NEEDS_REVIEW";
export const SALES_DRAFT_PRICE_BLOCKERS = ["PRICE_APPROVAL", "PRICE_PRECEDENCE", "PRICE_UNIT_MAPPING", "PRICE_EFFECTIVE_DATE", "PRICE_MONEY_POLICY"] as const;
export const SALES_DRAFT_CREDIT_BLOCKERS = ["CREDIT_CUSTOMER_LINK", "CREDIT_APPROVAL", "CREDIT_EXPOSURE_POLICY", "CREDIT_DRAFT_TOTAL"] as const;
export type SalesDraftCommercialBlocker = typeof SALES_DRAFT_PRICE_BLOCKERS[number] | typeof SALES_DRAFT_CREDIT_BLOCKERS[number];
export interface SalesDraftCommercialReview {
  state:"NEEDS_REVIEW"; reason:"REQUIRES_SETUP"; blockers:readonly SalesDraftCommercialBlocker[];
}
export interface SalesDraftCheck {
  checkedAt:string; pricing:"REQUIRES_SETUP"; priceSource:null; tax:null; discount:null; credit:null;
  draftId:string; draftVersion:number; warehouseId:string|null;
  nonbinding:true; approvalAllowed:false;
  commercial:{pricing:SalesDraftCommercialReview;credit:SalesDraftCommercialReview};
  lines:{
    lineNo:number; productId:string; requestedBase:string; warehouseAvailable:string|null; ownCustody:string|null; eligibleCustody:string|null;
    warehouseShort:boolean|null; custodyShort:boolean|null; state:"CHECKED"|"UNAVAILABLE"|"PRODUCT_CHANGED";
    unitState:SalesDraftAvailability; warehouseState:SalesDraftAvailability; custodyState:SalesDraftAvailability;
    pricingState:"NEEDS_REVIEW"; priceReason:"REQUIRES_SETUP";
    minShelfLifeDays:number; warehouseEligibleLots:number; custodyEligibleLots:number;
    warehouseNearestExpiry:string|null; custodyNearestExpiry:string|null;
  }[];
}

// B2 Part 1: proposals and approvals only; never a price mutation contract.
export const PRICE_EXCEPTION_PERMISSIONS={request:"sales.price-exceptions.request",review:"sales.price-exceptions.review",approve:"sales.price-exceptions.approve",accounting:"sales.price-exceptions.accounting"} as const;
export const priceExceptionStates=["SUBMITTED","REVIEWED","APPROVED","REJECTED"] as const;
const evidenceType=z.enum(["EMAIL","COMPANY_APPROVED_MESSAGE"]);
const reference=z.string().trim().min(3).max(1000);
const proposalDate=z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v},"Invalid date");
export const priceExceptionCreateSchema=z.object({
 commandKey:key,draftId:z.string().uuid(),draftVersion:z.number().int().nonnegative(),productId:z.string().min(1).max(100),
 kind:z.enum(["SPECIAL_PRICE","DISCOUNT_PERCENT"]),value:z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/).refine(v=>/[1-9]/.test(v)),
 currency:z.string().regex(/^[A-Z]{3}$/).nullable(),reason:z.string().trim().min(3).max(1000),
 desiredFrom:proposalDate,desiredTo:proposalDate.nullable(),evidenceType,evidenceReference:reference,
}).strict().superRefine((v,c)=>{
 if(v.kind==="SPECIAL_PRICE"&&!v.currency||v.kind==="DISCOUNT_PERCENT"&&(v.currency!==null||Number(v.value)>100))c.addIssue({code:"custom",path:["value"],message:"Invalid proposal"});
 if(v.desiredTo&&v.desiredTo<v.desiredFrom)c.addIssue({code:"custom",path:["desiredTo"],message:"Invalid range"});
});
export const priceExceptionDecisionSchema=z.object({commandKey:key,version:z.number().int().nonnegative(),decision:z.enum(["FORWARD","APPROVE","REJECT"]),reason:z.string().trim().min(3).max(1000),evidenceType,evidenceReference:reference,evidenceAttested:z.literal(true)}).strict();
export const priceExceptionListSchema=z.object({cursor:z.string().max(200).optional(),status:z.enum(priceExceptionStates).optional()}).strict();
export type PriceExceptionCreate=z.infer<typeof priceExceptionCreateSchema>;
export type PriceExceptionDecision=z.infer<typeof priceExceptionDecisionSchema>;
export interface PriceExceptionEvent {version:number;actorId:string;actorName:string;action:string;reason:string;evidenceType:string;evidenceReference:string;evidenceAttested:boolean;createdAt:string}
export interface PriceExceptionRequest {
 id:string;draftId:string;draftVersion:number;requesterId:string;customerCode:string;customerName:string;channel:string;routeId:string;
 productId:string;productCode:string;productName:string;unit:"BASE"|"CARTON";conversionFactor:number;
 kind:"SPECIAL_PRICE"|"DISCOUNT_PERCENT";value:string;currency:string|null;reason:string;desiredFrom:string;desiredTo:string|null;
 status:typeof priceExceptionStates[number];version:number;reviewedBy:string|null;decidedBy:string|null;createdAt:string;
 priceBefore:null;activation:"REQUIRES_SETUP";attachments:"UNAVAILABLE";events:PriceExceptionEvent[];
}
