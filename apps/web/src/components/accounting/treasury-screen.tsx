"use client";
import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { Landmark,Plus,RefreshCw } from "lucide-react";
import { accountingSubledgerApi as api } from "@/lib/api/accounting-subledger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from "@/components/ui/table";
import { AccountingNav } from "./accounting-nav";
import { SubledgerDialog } from "./subledger-dialog";
import { AccessState,ErrorBox,Field,Pager,queryOptions,useAccountingAccess } from "./subledger-shared";
export function TreasuryScreen(){
 const access=useAccountingAccess("accounting.treasury.read");const {company,t,ready,can}=access;const client=useQueryClient();const [page,setPage]=useState(1);const [input,setInput]=useState("");const [search,setSearch]=useState("");const [adding,setAdding]=useState(false);
 const query=useQuery({queryKey:["accounting",company,"treasury",page,search],queryFn:()=>api.treasury(page,search),enabled:ready,...queryOptions});
 if(!ready)return <AccessState loading={access.loading} error={access.mode.error} retry={()=>void access.mode.refetch()} t={t}/>;
 return <div className="space-y-5"><header><h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Landmark className="h-7 w-7 text-primary"/>{t("accounting.cash_and_banks")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("accounting.existing_chart_accounts_with_balances_from_the_general_ledger")}</p></header><AccountingNav/><Card><CardHeader><div className="flex flex-wrap justify-between gap-3"><CardTitle>{t("accounting.registered_accounts")}</CardTitle><div className="flex flex-wrap gap-2">{can("accounting.treasury.manage")&&<Button onClick={()=>setAdding(true)}><Plus className="h-4 w-4"/>{t("accounting.register_cash_or_bank")}</Button>}<Button variant="outline" onClick={()=>void query.refetch()}><RefreshCw className="h-4 w-4"/>{t("accounting.refresh")}</Button></div></div></CardHeader><CardContent className="space-y-4"><form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();setPage(1);setSearch(input);}}><div className="flex-1"><Field label={t("accounting.search_code_or_name")} value={input} maxLength={80} onChange={e=>setInput(e.target.value)}/></div><Button variant="outline">{t("accounting.search")}</Button></form>
 {query.isPending?<Skeleton className="h-40"/>:query.isError?<ErrorBox error={query.error} t={t} retry={()=>void query.refetch()}/>:<>{!query.data.items.length?<p className="py-5 text-sm text-muted-foreground">{t("accounting.no_registered_cash_or_bank_accounts_register_an_asset_account_from_the_chart")}</p>:<Table><TableHeader><TableRow>{[t("accounting.account_code"),t("accounting.name"),t("accounting.type"),t("accounting.balance")].map(v=><TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{query.data.items.map(a=><TableRow key={a.accountCode}><TableCell>{a.accountCode}</TableCell><TableCell>{a.name}</TableCell><TableCell><Badge variant="outline">{a.kind==="CASH"?t("accounting.cash"):t("accounting.bank")}</Badge></TableCell><TableCell dir="ltr" className="tabular-nums">{a.balance} {t("accounting.currency_sar")}</TableCell></TableRow>)}</TableBody></Table>}<Pager page={page} more={query.data.hasMore} set={setPage} t={t}/></>}
 </CardContent></Card>{adding&&<SubledgerDialog action={{kind:"treasury"}} t={t} close={()=>setAdding(false)} done={async()=>{setAdding(false);await client.invalidateQueries({queryKey:["accounting"]});}}/>}</div>;
}
