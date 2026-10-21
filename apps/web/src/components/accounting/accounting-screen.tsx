"use client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { useId,useRef,useState } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { BookOpen,Plus,RefreshCw } from "lucide-react";
import { accountingAccountTypes,getCompanyFeatureAccessState,type AccountingJournal,type AccountingLine,type AccountingPost } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { accountingApi } from "@/lib/api/accounting";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { journalTotals } from "@/lib/accounting-money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from "@/components/ui/table";
import { AccountingNav } from "./accounting-nav";
type Text = (key: TranslationKey, params?: Record<string, string | number>) => string;
const options={retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false} as const;
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh"}).format(new Date());
type Action={kind:"account"|"post"|"close"}|{kind:"reverse"|"correct";journal:AccountingJournal;lines:AccountingLine[]};
function Field({label,...props}:React.ComponentProps<typeof Input>&{label:string}) {const id=useId();return <label htmlFor={id} className="block space-y-1 text-sm"><span>{label}</span><Input id={id} {...props}/></label>;}
function ErrorBox({error,t}:{error:unknown;t:Text}) {
 const message=error instanceof Error?error.message:"";
 const labels:Record<string,TranslationKey>={ACC_DUPLICATE_REFERENCE:"accounting.the_code_or_document_reference_already_exists",ACC_UNBALANCED:"accounting.total_debits_must_equal_total_credits",ACC_PERIOD_CLOSED:"accounting.the_entry_date_is_in_a_closed_period_choose_an_open_date",ACC_IDEMPOTENCY_CONFLICT:"accounting.this_command_was_recorded_with_different_content_check_the_journal_history",ACC_ALREADY_REVERSED:"accounting.this_journal_has_already_been_reversed",ACC_UNKNOWN_COMPANY_ACCOUNT:"accounting.an_account_code_is_missing_from_the_company_chart",ACC_INVALID_INPUT:"accounting.check_the_fields_date_and_monetary_amounts",ACC_BOOK_REQUIRED:"accounting.add_a_chart_account_first",ACC_PERIOD_ALREADY_CLOSED:"accounting.the_book_is_already_closed_through_this_date_or_later",ACC_INVALID_SOURCE:"accounting.this_journal_cannot_be_reversed_on_that_date"};
 labels.ACC_USE_PARTY_VOUCHER="accounting.this_journal_belongs_to_a_party_voucher_reverse_it_from_the_customer_or_supplier_a";
 const v=labels[message];return <p role="alert" className="break-words text-sm text-destructive">{v?t(v):t("accounting.request_failed_refresh_the_data_and_retry")}</p>;
}
function Pager({page,more,set,t}:{page:number;more:boolean;set:(n:number)=>void;t:Text}) {return <div className="mt-4 flex items-center justify-end gap-3"><Button variant="outline" disabled={page===1} onClick={()=>set(page-1)}>{t("accounting.previous")}</Button><span className="text-sm tabular-nums">{page}</span><Button variant="outline" disabled={!more} onClick={()=>set(page+1)}>{t("accounting.next")}</Button></div>;}
function typeLabel(type:string,t:Text) {const labels:Record<string,TranslationKey>={ASSET:"accounting.asset",LIABILITY:"accounting.liability",EQUITY:"accounting.equity",REVENUE:"accounting.revenue",EXPENSE:"accounting.expense"};const v=labels[type];return v?t(v):type;}

export function AccountingScreen() {
 const {user,isLoading}=useAuth();const {locale,t}=useTranslation();const client=useQueryClient();const company=user?.companyId;
 const allowed=!!company&&["COMPANY_ADMIN","MANAGER"].includes(user?.role.code??"")&&getCompanyFeatureAccessState(user?.featureAccess,"accounting-core")==="ENABLED"&&["sfa.access","accounting.read"].every(p=>user?.permissions?.includes(p));
 const mode=useQuery({queryKey:["sfa-mode",company],queryFn:sfaSetupApi.mode,enabled:allowed,...options});const ready=allowed&&mode.data?.operatingMode==="FULL_ERP";
 const [tab,setTab]=useState<"accounts"|"journals"|"trial">("accounts");const [p,setP]=useState(1);const [searchInput,setSearchInput]=useState("");const [search,setSearch]=useState("");const [asOf,setAsOf]=useState(today);
 const [selected,setSelected]=useState<AccountingJournal|null>(null);const [action,setAction]=useState<Action|null>(null);
 const book=useQuery({queryKey:["accounting",company,"book"],queryFn:accountingApi.book,enabled:ready,...options});
 const accounts=useQuery({queryKey:["accounting",company,"accounts",p,search],queryFn:()=>accountingApi.accounts(p,search),enabled:ready&&tab==="accounts",...options});
 const journals=useQuery({queryKey:["accounting",company,"journals",p,search],queryFn:()=>accountingApi.journals(p,search),enabled:ready&&tab==="journals",...options});
 const trial=useQuery({queryKey:["accounting",company,"trial",p,asOf],queryFn:()=>accountingApi.trial(p,asOf),enabled:ready&&tab==="trial",...options});
 const detail=useQuery({queryKey:["accounting",company,"detail",selected?.id],queryFn:()=>accountingApi.journal(selected!.id),enabled:ready&&!!selected,...options});
 const can=(permission:string)=>user?.permissions?.includes(permission);
 function switchTab(value:typeof tab){setTab(value);setP(1);setSearch("");setSearchInput("");setSelected(null);}
 async function changed(){await client.invalidateQueries({queryKey:["accounting",company]});setAction(null);setSelected(null);setP(1);}
 if(isLoading||(allowed&&mode.isPending))return <div className="space-y-4"><Skeleton className="h-28"/><Skeleton className="h-64"/></div>;
 if(!ready)return <Card><CardHeader><CardTitle>{t("accounting.accounting")}</CardTitle></CardHeader><CardContent>{mode.isError?<><ErrorBox error={mode.error} t={t}/><Button variant="outline" onClick={()=>void mode.refetch()}>{t("accounting.retry")}</Button></>:<p>{t("accounting.accounting_requires_screen_activation_full_erp_mode_and_explicit_accounting_permis")}</p>}</CardContent></Card>;
 const query=tab==="accounts"?accounts:tab==="journals"?journals:trial;
 return <div className="space-y-5">
  <AccountingNav/>
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><BookOpen className="h-7 w-7 text-primary"/>{t("accounting.accounting")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("accounting.chart_of_accounts_general_ledger_trial_balance")}</p></div><Badge variant="outline">{t("accounting.phase_1_sar")}</Badge></div>
  <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6"><p className="text-sm text-muted-foreground">{t("accounting.closed_through")}{book.data?.closedThrough??t("accounting.no_closed_period")}</p><div className="flex flex-wrap gap-2">{can("accounting.period.close")&&<Button variant="outline" onClick={()=>setAction({kind:"close"})}>{t("accounting.close_period")}</Button>}<Button variant="outline" onClick={()=>void client.invalidateQueries({queryKey:["accounting",company]})}><RefreshCw className="h-4 w-4"/>{t("accounting.refresh")}</Button></div>{book.isError&&<ErrorBox error={book.error} t={t}/>}</CardContent></Card>
  <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("accounting.accounting_functions")}>{(["accounts","journals","trial"] as const).map((value,i)=><Button role="tab" aria-selected={tab===value} key={value} variant={tab===value?"default":"outline"} onClick={()=>switchTab(value)}>{[t("accounting.chart_of_accounts"),t("accounting.general_ledger"),t("accounting.trial_balance")][i]}</Button>)}</div>
  <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{tab==="accounts"?t("accounting.chart_of_accounts"):tab==="journals"?t("accounting.posted_journals"):t("accounting.trial_balance")}</CardTitle>{tab==="accounts"&&can("accounting.accounts.manage")&&<Button onClick={()=>setAction({kind:"account"})}><Plus className="h-4 w-4"/>{t("accounting.new_account")}</Button>}{tab==="journals"&&can("accounting.journal.post")&&<Button onClick={()=>setAction({kind:"post"})}><Plus className="h-4 w-4"/>{t("accounting.new_journal")}</Button>}</div></CardHeader><CardContent className="space-y-4">
  {tab==="trial"?<Field label={t("accounting.balances_as_of")} type="date" value={asOf} required onChange={e=>{if(e.target.value){setAsOf(e.target.value);setP(1);}}}/>:<form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();setSearch(searchInput);setP(1);}}><div className="flex-1"><Field label={tab==="accounts"?t("accounting.search_code_or_name"):t("accounting.search_document_reference")} value={searchInput} maxLength={80} onChange={e=>setSearchInput(e.target.value)}/></div><Button variant="outline">{t("accounting.search")}</Button></form>}
  {query.isPending?<Skeleton className="h-44"/>:query.isError?<><ErrorBox error={query.error} t={t}/><Button variant="outline" onClick={()=>void query.refetch()}>{t("accounting.retry")}</Button></>:<>
   {!query.data?.items.length?<p className="py-5 text-sm text-muted-foreground">{t("accounting.no_results_add_accounts_then_post_a_balanced_journal")}</p>:tab==="accounts"?<Table><TableHeader><TableRow>{[t("accounting.code"),t("accounting.account"),t("accounting.type")].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{accounts.data?.items.map(a=><TableRow key={a.code}><TableCell className="font-mono">{a.code}</TableCell><TableCell>{a.name}</TableCell><TableCell>{typeLabel(a.type,t)}</TableCell></TableRow>)}</TableBody></Table>:tab==="journals"?<Table><TableHeader><TableRow>{[t("accounting.date_reference"),t("accounting.kind_reason"),t("accounting.debit_credit"),t("accounting.details")].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{journals.data?.items.map(j=><TableRow key={j.id}><TableCell>{j.date}<p className="font-semibold">{j.reference}</p></TableCell><TableCell><Badge variant={j.kind==="REVERSAL"?"warning":"secondary"}>{j.kind==="MANUAL"?t("accounting.manual"):j.kind==="REVERSAL"?t("accounting.reversal"):t("accounting.correction")}</Badge>{j.reversed&&<span className="ms-2 text-xs">{t("accounting.reversed")}</span>}<p className="mt-1 max-w-sm whitespace-normal text-sm">{j.reason}</p></TableCell><TableCell className="tabular-nums" dir="ltr">{j.debit}</TableCell><TableCell><Button variant="outline" onClick={()=>setSelected(j)}>{t("accounting.view")}</Button></TableCell></TableRow>)}</TableBody></Table>:<Table><TableHeader><TableRow>{[t("accounting.account"),t("accounting.debit_movement"),t("accounting.credit_movement"),t("accounting.debit_balance"),t("accounting.credit_balance")].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{trial.data?.items.map(a=><TableRow key={a.code}><TableCell>{a.code} · {a.name}</TableCell>{[a.debit,a.credit,a.balanceDebit,a.balanceCredit].map((v,i)=><TableCell dir="ltr" className="tabular-nums" key={i}>{v}</TableCell>)}</TableRow>)}</TableBody></Table>}
   {tab==="trial"&&trial.data&&<div className="glass-card p-4 text-sm"><p className="font-semibold">{t("accounting.company_totals_all_accounts_and_pages")}</p><p className="mt-2 tabular-nums">{t("accounting.movement_debit_credit")}{trial.data.totals.debit} / {trial.data.totals.credit}</p><p className="tabular-nums">{t("accounting.balance_debit_credit")}{trial.data.totals.balanceDebit} / {trial.data.totals.balanceCredit}</p></div>}
   <Pager page={p} more={query.data?.hasMore??false} set={setP} t={t}/>
  </>}
  </CardContent></Card>
  {selected&&<Card><CardHeader><CardTitle>{selected.reference}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="break-all text-xs text-muted-foreground">{t("accounting.journal")}{selected.id} · {t("accounting.actor")}{selected.actorId} · {selected.createdAt}</p>{selected.reversalOf&&<p className="break-all text-sm">{t("accounting.reverses")}{selected.reversalOf}</p>}{selected.correctionOf&&<p className="break-all text-sm">{t("accounting.corrects")}{selected.correctionOf}</p>}{detail.isPending?<Skeleton className="h-28"/>:detail.isError?<ErrorBox error={detail.error} t={t}/>:<Table><TableHeader><TableRow>{[t("accounting.account"),t("accounting.debit"),t("accounting.credit"),t("accounting.memo")].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{detail.data.items.map((l,i)=><TableRow key={i}><TableCell>{l.accountCode} · {l.accountName}</TableCell><TableCell dir="ltr">{l.debit}</TableCell><TableCell dir="ltr">{l.credit}</TableCell><TableCell>{l.memo}</TableCell></TableRow>)}</TableBody></Table>}
  {!selected.reversed&&selected.kind!=="REVERSAL"&&detail.data&&can("accounting.journal.reverse")&&<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setAction({kind:"reverse",journal:selected,lines:detail.data.items})}>{t("accounting.document_reversal")}</Button>{can("accounting.journal.post")&&<Button variant="outline" onClick={()=>setAction({kind:"correct",journal:selected,lines:detail.data.items})}>{t("accounting.reverse_and_correct")}</Button>}</div>}<Button variant="ghost" onClick={()=>setSelected(null)}>{t("accounting.close_details")}</Button></CardContent></Card>}
  {action&&<AccountingDialog action={action} t={t} close={()=>setAction(null)} done={changed}/>}
 </div>;
}

function AccountingDialog({action,t,close,done}:{action:Action;t:Text;close:()=>void;done:()=>Promise<void>}) {
 const {locale}=useTranslation();
 const [code,setCode]=useState("");const [name,setName]=useState("");const [type,setType]=useState<typeof accountingAccountTypes[number]>("ASSET");const [date,setDate]=useState(today);const [reference,setReference]=useState("");const [reason,setReason]=useState("");
 const blank=()=>({accountCode:"",debit:"0",credit:"0",memo:""});
 const [lines,setLines]=useState(action.kind==="correct"?action.lines.map(({accountCode,debit,credit,memo})=>({accountCode,debit,credit,memo})):[blank(),blank()]);
 const [submitted,setSubmitted]=useState(false);const key=useRef<string|null>(null);const totals=journalTotals(lines);const isPosting=action.kind==="post"||action.kind==="correct";
 const mutation=useMutation({retry:false,mutationFn:async()=>{
  key.current??=crypto.randomUUID();
  if(action.kind==="account")return accountingApi.createAccount({code,name,type});
  if(action.kind==="close")return accountingApi.close({through:date,reason});
  const body:AccountingPost={idempotencyKey:key.current,date,reference,reason,lines};
  if(action.kind==="reverse")return accountingApi.reverse(action.journal.id,{idempotencyKey:key.current,date,reason});
  return action.kind==="correct"?accountingApi.correct(action.journal.id,body):accountingApi.post(body);
 },onSuccess:done});
 function editLine(index:number,field:keyof ReturnType<typeof blank>,value:string){setLines(old=>old.map((l,i)=>i===index?{...l,[field]:value}:l));}
 const title=action.kind==="account"?t("accounting.new_account"):action.kind==="close"?t("accounting.close_period"):action.kind==="reverse"?t("accounting.reverse_journal"):action.kind==="correct"?t("accounting.atomic_reversal_and_correction"):t("accounting.new_journal_0d98bde");
 return <Dialog open onOpenChange={open=>{if(!open&&!mutation.isPending)close();}}><DialogContent className={isPosting?"max-w-4xl":""}><DialogHeader className="text-start sm:text-start"><DialogTitle>{title}</DialogTitle><DialogDescription>{action.kind==="close"?t("accounting.closing_is_final_through_the_selected_date_posting_and_reversal_in_that_period_are"):t("accounting.accounts_and_posted_journals_are_immutable_reasons_and_actors_are_recorded_correct")}</DialogDescription></DialogHeader>
 <form className="space-y-4" onSubmit={e=>{e.preventDefault();setSubmitted(true);mutation.mutate();}}>
 <fieldset disabled={submitted} className="space-y-4">
 {action.kind==="account"?<><Field label={t("accounting.account_code")} value={code} maxLength={20} required pattern="[A-Z0-9][A-Z0-9_-]{0,19}" onChange={e=>setCode(e.target.value)}/><Field label={t("accounting.account_name")} value={name} maxLength={160} required onChange={e=>setName(e.target.value)}/><div className="space-y-1"><span className="text-sm">{t("accounting.type")}</span><Select dir={locale === "ar" ? "rtl" : "ltr"} value={type} onValueChange={v=>setType(v as typeof type)}><SelectTrigger aria-label={t("accounting.account_type")}><SelectValue/></SelectTrigger><SelectContent>{accountingAccountTypes.map(v=><SelectItem value={v} key={v}>{typeLabel(v,t)}</SelectItem>)}</SelectContent></Select></div></>:<>
 <div className="grid gap-3 sm:grid-cols-2"><Field label={action.kind==="close"?t("accounting.close_through"):t("accounting.entry_date")} type="date" required value={date} onChange={e=>setDate(e.target.value)}/>{isPosting&&<Field label={t("accounting.unique_document_reference")} value={reference} maxLength={80} required onChange={e=>setReference(e.target.value)}/>}</div>
 <Field label={t("accounting.documented_reason")} value={reason} minLength={3} maxLength={300} required onChange={e=>setReason(e.target.value)}/>
 {isPosting&&<><p className="text-xs text-muted-foreground">{t("accounting.use_chart_account_codes_enter_an_amount_on_one_side_per_line_with_at_most_two_deci")}</p><div className="max-h-[40vh] space-y-3 overflow-y-auto">{lines.map((line,i)=><div className="glass-card grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5" key={i}><Field label={`${t("accounting.account_code")} ${i+1}`} required value={line.accountCode} maxLength={20} onChange={e=>editLine(i,"accountCode",e.target.value)}/><Field label={`${t("accounting.debit")} ${i+1}`} inputMode="decimal" required value={line.debit} onChange={e=>editLine(i,"debit",e.target.value)}/><Field label={`${t("accounting.credit")} ${i+1}`} inputMode="decimal" required value={line.credit} onChange={e=>editLine(i,"credit",e.target.value)}/><Field label={`${t("accounting.memo")} ${i+1}`} value={line.memo} maxLength={200} onChange={e=>editLine(i,"memo",e.target.value)}/><Button type="button" variant="ghost" className="self-end" disabled={lines.length<=2} onClick={()=>setLines(old=>old.filter((_,n)=>n!==i))}>{t("accounting.remove_line")}</Button></div>)}</div><Button type="button" variant="outline" disabled={lines.length>=100} onClick={()=>setLines(old=>[...old,blank()])}>{t("accounting.add_line")}</Button></>}
 </>}
 </fieldset>
 {isPosting&&<p role="status" className={`text-sm tabular-nums ${totals.balanced?"text-success":"text-destructive"}`}>{t("accounting.debit_credit_96bbf47")}{totals.debit} / {totals.credit} · {totals.balanced?t("accounting.balanced"):t("accounting.unbalanced_or_invalid_amount")}</p>}
 {mutation.isError&&<><ErrorBox error={mutation.error} t={t}/><p className="text-xs text-muted-foreground">{t("accounting.retry_uses_the_same_command_to_prevent_duplicates_close_this_dialog_to_start_a_cor")}</p></>}
 <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={close}>{t("accounting.cancel")}</Button><Button type="submit" disabled={mutation.isPending||(isPosting&&!totals.balanced)}>{mutation.isPending?t("accounting.saving"):submitted?t("accounting.retry_same_request"):t("accounting.save_and_confirm")}</Button></div>
 </form></DialogContent></Dialog>;
}
