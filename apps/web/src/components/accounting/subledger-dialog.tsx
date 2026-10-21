"use client";
import { useRef,useState } from "react";
import { useMutation,useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { AccountingParty,AccountingPartyKind,AccountingTreasury,AccountingVoucher,AccountingVoucherResult } from "@field-sales-os/schemas";
import { accountingSubledgerApi as api } from "@/lib/api/accounting-subledger";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBox,Field,Pager,queryOptions,type Text } from "./subledger-shared";
export type SubledgerAction={kind:"party";partyKind:AccountingPartyKind}|{kind:"treasury"}|{kind:"settlement"|"opening";party:AccountingParty}|{kind:"reverse";party:AccountingParty;voucher:AccountingVoucher};
export function SubledgerDialog({action,t,close,done}:{action:SubledgerAction;t:Text;close:()=>void;done:(result?:AccountingVoucherResult)=>Promise<void>}){
 const {user}=useAuth();
 const [code,setCode]=useState("");const [name,setName]=useState("");const [account,setAccount]=useState("");const [treasuryKind,setTreasuryKind]=useState<"CASH"|"BANK">("CASH");
 const [date,setDate]=useState(()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh"}).format(new Date()));const [reference,setReference]=useState("");const [amount,setAmount]=useState("");const [reason,setReason]=useState("");
 const [treasuryPage,setTreasuryPage]=useState(1);const [searchInput,setSearchInput]=useState("");const [search,setSearch]=useState("");const [selected,setSelected]=useState<AccountingTreasury|null>(null);
 const [submitted,setSubmitted]=useState(false);const key=useRef<string|null>(null);
 const treasury=useQuery({queryKey:["accounting",user?.companyId,"treasury-picker",treasuryPage,search],queryFn:()=>api.treasury(treasuryPage,search),enabled:action.kind==="settlement",...queryOptions});
 const mutation=useMutation({retry:false,mutationFn:async()=>{
  if(action.kind==="party"){await api.createParty({kind:action.partyKind,code,name,accountCode:account});return undefined;}
  if(action.kind==="treasury"){await api.registerTreasury({accountCode:account,kind:treasuryKind});return undefined;}
  key.current??=crypto.randomUUID();const cmd={idempotencyKey:key.current,date,reason};
  if(action.kind==="reverse")return api.reverse(action.party.id,action.voucher.id,cmd);
  const body={...cmd,partyId:action.party.id,reference,amount};
  if(action.kind==="opening")return api.opening({...body,equityAccountCode:account});
  if(!selected)throw Error("ACC_INVALID_TREASURY_ACCOUNT");
  return action.party.kind==="CUSTOMER"?api.receipt({...body,treasuryAccountCode:selected.accountCode}):api.payment({...body,treasuryAccountCode:selected.accountCode});
 },onSuccess:done});
 const title=action.kind==="party"?(action.partyKind==="CUSTOMER"?t("ربط حساب عميل","Register customer account"):t("ربط حساب مورد","Register supplier account")):action.kind==="treasury"?t("تسجيل نقدية أو بنك","Register cash or bank"):action.kind==="opening"?t("رصيد افتتاحي صريح","Explicit opening balance"):action.kind==="reverse"?t("عكس السند","Reverse voucher"):action.party.kind==="CUSTOMER"?t("سند قبض","Receipt voucher"):t("سند سداد","Payment voucher");
 const choices=treasury.data?.items??[];const selectedOnPage=selected&&choices.some(c=>c.accountCode===selected.accountCode);
 return <Dialog open onOpenChange={open=>{if(!open&&!mutation.isPending)close();}}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{action.kind==="opening"?t("افتتاحي واحد صريح لهذا الطرف، منفصل عن الفواتير التاريخية. الحساب المقابل من حقوق الملكية.","One explicit opening per party, separate from historical invoices. Use an equity counter-account."):action.kind==="settlement"||action.kind==="reverse"?t("الاعتماد يحفظ السند والقيد المتوازن وسجل التدقيق معًا. التصحيح بعكس موثق.","Approval saves the voucher, balanced journal and audit together. Correct through a documented reversal."):t("استخدم كودًا موجودًا في دليل الحسابات. لكل طرف حساب مستقل غير مستخدم سابقًا.","Use an existing chart account code. Each party requires a dedicated unused account.")}</DialogDescription></DialogHeader>
 <form className="space-y-4" onSubmit={e=>{e.preventDefault();setSubmitted(true);mutation.mutate();}}>
 <fieldset disabled={submitted} className="space-y-4">
 {action.kind==="party"?<><Field label={t("كود الطرف","Party code")} value={code} maxLength={20} required pattern="[A-Z0-9][A-Z0-9_-]{0,19}" onChange={e=>setCode(e.target.value)}/><Field label={t("الاسم","Name")} value={name} maxLength={160} required onChange={e=>setName(e.target.value)}/><Field label={action.partyKind==="CUSTOMER"?t("كود حساب العميل — أصول","Customer GL account — asset"):t("كود حساب المورد — التزامات","Supplier GL account — liability")} required value={account} maxLength={20} onChange={e=>setAccount(e.target.value)}/></>:action.kind==="treasury"?<><Field label={t("كود الحساب من دليل الحسابات — أصول","Chart account code — asset")} required value={account} maxLength={20} onChange={e=>setAccount(e.target.value)}/><Select value={treasuryKind} disabled={submitted} onValueChange={v=>setTreasuryKind(v as typeof treasuryKind)}><SelectTrigger aria-label={t("نوع النقدية أو البنك","Cash or bank type")}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="CASH">{t("نقدية","Cash")}</SelectItem><SelectItem value="BANK">{t("بنك","Bank")}</SelectItem></SelectContent></Select></>:<>
 <p className="text-sm font-semibold">{action.party.code} · {action.party.name}</p><Field label={t("تاريخ السند","Voucher date")} type="date" required value={date} onChange={e=>setDate(e.target.value)}/>
 {action.kind!=="reverse"&&<><Field label={t("مرجع السند الفريد","Unique voucher reference")} value={reference} required maxLength={60} onChange={e=>setReference(e.target.value)}/><Field label={t("المبلغ بالريال السعودي","Amount in SAR")} value={amount} required inputMode="decimal" pattern="(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?" onChange={e=>setAmount(e.target.value)}/></>}
 <Field label={t("السبب الموثق","Documented reason")} value={reason} required minLength={3} maxLength={300} onChange={e=>setReason(e.target.value)}/>
 {action.kind==="opening"&&<Field label={t("كود الحساب المقابل — حقوق ملكية","Equity counter-account code")} value={account} required maxLength={20} onChange={e=>setAccount(e.target.value)}/>}
 {action.kind==="settlement"&&<div className="space-y-3"><div className="flex items-end gap-2"><div className="flex-1"><Field label={t("بحث النقدية والبنوك","Search cash and banks")} value={searchInput} onChange={e=>setSearchInput(e.target.value)} maxLength={80}/></div><Button type="button" variant="outline" onClick={()=>{setSearch(searchInput);setTreasuryPage(1);}}>{t("بحث","Search")}</Button></div>
 {treasury.isPending?<Skeleton className="h-12"/>:treasury.isError?<ErrorBox error={treasury.error} t={t} retry={()=>void treasury.refetch()}/>:<><Select disabled={submitted} value={selected?.accountCode} onValueChange={v=>setSelected(choices.find(c=>c.accountCode===v)??selected)}><SelectTrigger aria-label={t("حساب النقدية أو البنك","Cash or bank account")}><SelectValue placeholder={t("اختر حسابًا","Select an account")}/></SelectTrigger><SelectContent>{selected&&!selectedOnPage&&<SelectItem value={selected.accountCode}>{selected.accountCode} · {selected.name}</SelectItem>}{choices.map(c=><SelectItem key={c.accountCode} value={c.accountCode}>{c.accountCode} · {c.name} · {c.kind==="CASH"?t("نقدية","Cash"):t("بنك","Bank")}</SelectItem>)}</SelectContent></Select>{!choices.length&&<p className="text-xs text-muted-foreground">{t("لا توجد حسابات مسجلة. سجّل حسابًا من شاشة النقدية والبنوك.","No registered accounts. Register one in Cash and banks.")}</p>}<Pager page={treasuryPage} more={treasury.data.hasMore} set={setTreasuryPage} t={t}/></>}
 {selected&&<p className="text-sm tabular-nums">{t("رصيد الحساب المختار: ","Selected account balance: ")}{selected.balance} SAR</p>}</div>}
 </>}
 </fieldset>
 {mutation.isError&&<><ErrorBox error={mutation.error} t={t}/><p className="text-xs text-muted-foreground">{t("إعادة المحاولة تستخدم نفس الطلب. لإصلاح البيانات أغلق النافذة وافتح سندًا جديدًا.","Retry keeps the same command. To change the data, close this dialog and start a new voucher.")}</p></>}
 <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={close}>{t("إلغاء","Cancel")}</Button><Button type="submit" disabled={mutation.isPending||(action.kind==="settlement"&&!selected)}>{mutation.isPending?t("جارٍ الحفظ…","Saving…"):submitted?t("إعادة نفس الطلب","Retry same command"):action.kind==="party"||action.kind==="treasury"?t("حفظ الربط","Save registration"):t("اعتماد وترحيل","Approve and post")}</Button></div>
 </form></DialogContent></Dialog>;
}
