"use client";
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCompanyFeatureAccessState } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export type Text=(ar:string,en:string)=>string;
export const queryOptions={retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false} as const;
export function useAccountingAccess(permission:string){
 const {user,isLoading}=useAuth();const {locale}=useTranslation();const t:Text=(ar,en)=>locale==="ar"?ar:en;const company=user?.companyId;
 const allowed=!!company&&["COMPANY_ADMIN","MANAGER"].includes(user?.role.code??"")&&getCompanyFeatureAccessState(user?.featureAccess,"accounting-core")==="ENABLED"&&["sfa.access","accounting.read",permission].every(p=>user?.permissions?.includes(p));
 const mode=useQuery({queryKey:["sfa-mode",company],queryFn:sfaSetupApi.mode,enabled:allowed,...queryOptions});
 return {user,company,t,mode,ready:allowed&&mode.data?.operatingMode==="FULL_ERP",loading:isLoading||(allowed&&mode.isPending),can:(p:string)=>!!user?.permissions?.includes(p)};
}
export function AccessState({loading,error,retry,t}:{loading:boolean;error?:unknown;retry:()=>void;t:Text}){return loading?<Skeleton className="h-64"/>:<Card><CardHeader><CardTitle>{t("الحسابات","Accounting")}</CardTitle></CardHeader><CardContent>{error?<ErrorBox error={error} retry={retry} t={t}/>:<p className="text-sm text-muted-foreground">{t("تتطلب هذه الشاشة ERP المتكامل وتفعيل الحسابات وصلاحيات صريحة.","This screen requires Full ERP, accounting activation and explicit permissions.")}</p>}</CardContent></Card>;}
export function Field({label,...props}:React.ComponentProps<typeof Input>&{label:string}){const id=useId();return <label className="block space-y-1 text-sm" htmlFor={id}><span>{label}</span><Input id={id} {...props}/></label>;}
export function ErrorBox({error,retry,t}:{error:unknown;retry?:()=>void;t:Text}){
 const code=error instanceof Error?error.message:"";
 const labels:Record<string,[string,string]>={ACC_AMOUNT_EXCEEDS_DUE:["المبلغ يتجاوز الرصيد المستحق. حدّث الحساب وراجع المبلغ.","Amount exceeds the outstanding balance. Refresh and review the amount."],ACC_INSUFFICIENT_FUNDS:["رصيد النقدية أو البنك لا يكفي لهذه العملية.","The cash or bank balance is insufficient."],ACC_OPENING_EXISTS:["يوجد افتتاحي أو حركة سابقة؛ لا يمكن إضافة مديونية افتتاحية أخرى.","An opening or prior movement exists; another opening would duplicate debt."],ACC_VOUCHER_BACKDATED:["اختر تاريخًا لا يسبق أحدث حركة للطرف أو الحساب المقابل.","Choose a date on or after the latest party or counter-account movement."],ACC_PERIOD_CLOSED:["التاريخ داخل فترة مقفلة.","The selected date is in a closed period."],ACC_DUPLICATE_REFERENCE:["الكود أو مرجع السند مستخدم بالفعل.","The code or voucher reference already exists."],ACC_IDEMPOTENCY_CONFLICT:["هذا الطلب مسجل بقيم مختلفة. راجع سجل الحركات.","This command was recorded with different values. Review the statement."],ACC_INVALID_INPUT:["راجع الحقول والمبلغ والتاريخ.","Check the fields, amount and date."],ACC_INVALID_TREASURY_ACCOUNT:["اختر حساب نقدية أو بنك مسجلًا من نوع الأصول.","Select a registered cash or bank asset account."],ACC_PARTY_ACCOUNT_REQUIRES_UNUSED_MATCHING_TYPE:["الحساب يجب أن يكون غير مستخدم: أصول للعميل أو التزامات للمورد، ومنفصلًا عن النقدية والبنوك.","Use an unused asset account for a customer or liability account for a supplier, separate from cash/banks."],ACC_OPENING_EQUITY_REQUIRED:["الحساب المقابل للافتتاحي يجب أن يكون من حقوق الملكية.","Opening balances require an equity counter-account."],ACC_OPENING_HAS_SETTLEMENTS:["اعكس سندات التسوية أولًا قبل عكس الافتتاحي.","Reverse the settlements before reversing the opening."],ACC_INVALID_VOUCHER_REVERSAL:["السند معكوس بالفعل أو غير متاح للعكس.","This voucher is already reversed or cannot be reversed."]};
 const label=labels[code];return <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{label?t(...label):t("تعذر إتمام الطلب. حدّث البيانات ثم أعد المحاولة.","Request failed. Refresh and retry.")}</p>{retry&&<Button type="button" variant="outline" onClick={retry}>{t("إعادة المحاولة","Retry")}</Button>}</div>;
}
export function Pager({page,more,set,t}:{page:number;more:boolean;set:(n:number)=>void;t:Text}){return <div className="mt-4 flex items-center justify-end gap-3"><Button type="button" variant="outline" disabled={page===1} onClick={()=>set(page-1)}>{t("السابق","Previous")}</Button><span className="text-sm tabular-nums">{page}</span><Button type="button" variant="outline" disabled={!more} onClick={()=>set(page+1)}>{t("التالي","Next")}</Button></div>;}
export const voucherLabel=(kind:string,t:Text)=>kind==="OPENING"?t("رصيد افتتاحي صريح","Explicit opening"):kind==="RECEIPT"?t("سند قبض معتمد","Approved receipt"):kind==="PAYMENT"?t("سند سداد معتمد","Approved payment"):t("سند عكسي","Reversal voucher");
