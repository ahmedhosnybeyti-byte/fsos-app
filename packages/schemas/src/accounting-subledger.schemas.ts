import { z } from "zod";
import { accountingAccountSchema,accountingAmountSchema,accountingPageSchema,accountingReverseSchema } from "./accounting.schemas";

export const accountingSubledgerPermissions = ["accounting.ar.read","accounting.ap.read","accounting.parties.manage","accounting.receipts.post","accounting.payments.post","accounting.opening.post","accounting.treasury.read","accounting.treasury.manage"] as const;
export const accountingPartyKindSchema=z.enum(["CUSTOMER","SUPPLIER"]);
export type AccountingPartyKind=z.infer<typeof accountingPartyKindSchema>;
export const accountingPartySchema=z.object({kind:accountingPartyKindSchema,code:accountingAccountSchema.shape.code,name:accountingAccountSchema.shape.name,accountCode:accountingAccountSchema.shape.code}).strict();
export const accountingPartyQuerySchema=accountingPageSchema.extend({kind:accountingPartyKindSchema});
export const accountingTreasurySchema=z.object({accountCode:accountingAccountSchema.shape.code,kind:z.enum(["CASH","BANK"])}).strict();
const amount=accountingAmountSchema.refine(v=>v!=="0.00","Amount must be positive");
const command=accountingReverseSchema.extend({partyId:z.string().min(1).max(80),reference:z.string().trim().min(1).max(60),amount});
export const accountingSettlementSchema=command.extend({treasuryAccountCode:accountingAccountSchema.shape.code}).strict();
export const accountingOpeningSchema=command.extend({equityAccountCode:accountingAccountSchema.shape.code}).strict();
export type AccountingPartyInput=z.input<typeof accountingPartySchema>;
export type AccountingSettlementInput=z.input<typeof accountingSettlementSchema>;
export type AccountingOpeningInput=z.input<typeof accountingOpeningSchema>;
export interface AccountingParty {id:string;kind:AccountingPartyKind;code:string;name:string;accountCode:string;balance:string;openingPosted:boolean}
export interface AccountingTreasury {accountCode:string;name:string;kind:"CASH"|"BANK";balance:string}
export interface AccountingVoucher {id:string;partyId:string;kind:"OPENING"|"RECEIPT"|"PAYMENT"|"REVERSAL";date:string;reference:string;amount:string;counterAccountCode:string;journalId:string;reversalOf:string|null;reversed:boolean;origin:"EXPLICIT_OPENING"|"MANUAL_VOUCHER";reason:string;actorId:string;createdAt:string;debit:string;credit:string}
export interface AccountingVoucherResult {voucherId:string;journalId:string}
