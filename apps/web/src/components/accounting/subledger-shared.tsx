"use client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCompanyFeatureAccessState,hasOperationalPermissions } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export type Text = (key: TranslationKey, params?: Record<string, string | number>) => string;
export const queryOptions={retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false} as const;
export function useAccountingAccess(permission:string){
 const {user,isLoading}=useAuth();const {locale,t}=useTranslation();const company=user?.companyId;
 const allowed=!!company&&(["MANAGER","ACCOUNTANT"].includes(user?.role.code??"")||(user?.role.code==="COMPANY_ADMIN"&&permission==="accounting.treasury.read"))&&getCompanyFeatureAccessState(user?.featureAccess,"accounting-core")==="ENABLED"&&hasOperationalPermissions(user?.role.code??"",user?.permissions,["sfa.access","accounting.read",permission]);
 const mode=useQuery({queryKey:["sfa-mode",company],queryFn:sfaSetupApi.mode,enabled:allowed,...queryOptions});
 return {user,company,t,mode,ready:allowed&&mode.data?.operatingMode==="FULL_ERP",loading:isLoading||(allowed&&mode.isPending),can:(p:string)=>user?.role.code!=="COMPANY_ADMIN"&&!!user?.permissions?.includes(p)};
}
export function AccessState({loading,error,retry,t}:{loading:boolean;error?:unknown;retry:()=>void;t:Text}){return loading?<Skeleton className="h-64"/>:<Card><CardHeader><CardTitle>{t("accounting.accounting")}</CardTitle></CardHeader><CardContent>{error?<ErrorBox error={error} retry={retry} t={t}/>:<p className="text-sm text-muted-foreground">{t("accounting.this_screen_requires_full_erp_accounting_activation_and_explicit_permissions")}</p>}</CardContent></Card>;}
export function Field({label,...props}:React.ComponentProps<typeof Input>&{label:string}){const id=useId();return <label className="block space-y-1 text-sm" htmlFor={id}><span>{label}</span><Input id={id} {...props}/></label>;}
export function ErrorBox({error,retry,t}:{error:unknown;retry?:()=>void;t:Text}){
 const code=error instanceof Error?error.message:"";
 const labels:Record<string,TranslationKey>={ACC_AMOUNT_EXCEEDS_DUE:"accounting.amount_exceeds_the_outstanding_balance_refresh_and_review_the_amount",ACC_INSUFFICIENT_FUNDS:"accounting.the_cash_or_bank_balance_is_insufficient",ACC_OPENING_EXISTS:"accounting.an_opening_or_prior_movement_exists_another_opening_would_duplicate_debt",ACC_VOUCHER_BACKDATED:"accounting.choose_a_date_on_or_after_the_latest_party_or_counter_account_movement",ACC_PERIOD_CLOSED:"accounting.the_selected_date_is_in_a_closed_period",ACC_DUPLICATE_REFERENCE:"accounting.the_code_or_voucher_reference_already_exists",ACC_IDEMPOTENCY_CONFLICT:"accounting.this_command_was_recorded_with_different_values_review_the_statement",ACC_INVALID_INPUT:"accounting.check_the_fields_amount_and_date",ACC_INVALID_TREASURY_ACCOUNT:"accounting.select_a_registered_cash_or_bank_asset_account",ACC_PARTY_ACCOUNT_REQUIRES_UNUSED_MATCHING_TYPE:"accounting.use_an_unused_asset_account_for_a_customer_or_liability_account_for_a_supplier_sep",ACC_OPENING_EQUITY_REQUIRED:"accounting.opening_balances_require_an_equity_counter_account",ACC_OPENING_HAS_SETTLEMENTS:"accounting.reverse_the_settlements_before_reversing_the_opening",ACC_INVALID_VOUCHER_REVERSAL:"accounting.this_voucher_is_already_reversed_or_cannot_be_reversed"};
 const label=labels[code];return <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{label?t(label):t("accounting.request_failed_refresh_and_retry")}</p>{retry&&<Button type="button" variant="outline" onClick={retry}>{t("accounting.retry")}</Button>}</div>;
}
export function Pager({page,more,set,t}:{page:number;more:boolean;set:(n:number)=>void;t:Text}){return <div className="mt-4 flex items-center justify-end gap-3"><Button type="button" variant="outline" disabled={page===1} onClick={()=>set(page-1)}>{t("accounting.previous")}</Button><span className="text-sm tabular-nums">{page}</span><Button type="button" variant="outline" disabled={!more} onClick={()=>set(page+1)}>{t("accounting.next")}</Button></div>;}
export const voucherLabel=(kind:string,t:Text)=>kind==="OPENING"?t("accounting.explicit_opening"):kind==="RECEIPT"?t("accounting.approved_receipt"):kind==="PAYMENT"?t("accounting.approved_payment"):t("accounting.reversal_voucher");
