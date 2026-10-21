import { apiFetch } from "../api-client";
import type { AccountingAccount,AccountingBook,AccountingJournal,AccountingLine,AccountingPage,AccountingPost,AccountingResult,AccountingReverse,AccountingTrial } from "@field-sales-os/schemas";
const base="/sfa/accounting";
export const accountingApi={
 book:()=>apiFetch<AccountingBook>(`${base}/book`),
 accounts:(page:number,search="")=>apiFetch<AccountingPage<AccountingAccount>>(`${base}/accounts`,{query:{page,search}}),
 createAccount:(body:AccountingAccount)=>apiFetch<AccountingAccount>(`${base}/accounts`,{method:"POST",body}),
 journals:(page:number,search="",from?:string,to?:string)=>apiFetch<AccountingPage<AccountingJournal>>(`${base}/journals`,{query:{page,search,from,to}}),
 journal:(id:string)=>apiFetch<{items:AccountingLine[]}>(`${base}/journals/${encodeURIComponent(id)}`),
 post:(body:AccountingPost)=>apiFetch<AccountingResult>(`${base}/journals`,{method:"POST",body}),
 reverse:(id:string,body:AccountingReverse)=>apiFetch<AccountingResult>(`${base}/journals/${encodeURIComponent(id)}/reverse`,{method:"POST",body}),
 correct:(id:string,body:AccountingPost)=>apiFetch<AccountingResult>(`${base}/journals/${encodeURIComponent(id)}/correct`,{method:"POST",body}),
 trial:(page:number,asOf:string)=>apiFetch<AccountingTrial>(`${base}/trial-balance`,{query:{page,asOf}}),
 close:(body:{through:string;reason:string})=>apiFetch<{closedThrough:string}>(`${base}/close-period`,{method:"POST",body}),
};
