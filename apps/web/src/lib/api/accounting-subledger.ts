import { apiFetch } from "../api-client";
import type { AccountingOpeningInput,AccountingPage,AccountingParty,AccountingPartyInput,AccountingPartyKind,AccountingReverse,AccountingSettlementInput,AccountingTreasury,AccountingVoucher,AccountingVoucherResult } from "@field-sales-os/schemas";
const base="/sfa/accounting";
export const accountingSubledgerApi={
 parties:(kind:AccountingPartyKind,page:number,search="")=>apiFetch<AccountingPage<AccountingParty>>(`${base}/parties`,{query:{kind,page,search}}),
 party:(id:string)=>apiFetch<AccountingParty>(`${base}/parties/${encodeURIComponent(id)}`),
 createParty:(body:AccountingPartyInput)=>apiFetch<{id:string}>(`${base}/parties`,{method:"POST",body}),
 statement:(id:string,page:number)=>apiFetch<AccountingPage<AccountingVoucher>>(`${base}/parties/${encodeURIComponent(id)}/statement`,{query:{page}}),
 treasury:(page:number,search="")=>apiFetch<AccountingPage<AccountingTreasury>>(`${base}/treasury`,{query:{page,search}}),
 registerTreasury:(body:{accountCode:string;kind:"CASH"|"BANK"})=>apiFetch(`${base}/treasury`,{method:"POST",body}),
 receipt:(body:AccountingSettlementInput)=>apiFetch<AccountingVoucherResult>(`${base}/receipts`,{method:"POST",body}),
 payment:(body:AccountingSettlementInput)=>apiFetch<AccountingVoucherResult>(`${base}/disbursements`,{method:"POST",body}),
 opening:(body:AccountingOpeningInput)=>apiFetch<AccountingVoucherResult>(`${base}/party-openings`,{method:"POST",body}),
 reverse:(party:string,id:string,body:AccountingReverse)=>apiFetch<AccountingVoucherResult>(`${base}/parties/${encodeURIComponent(party)}/vouchers/${encodeURIComponent(id)}/reverse`,{method:"POST",body}),
};
