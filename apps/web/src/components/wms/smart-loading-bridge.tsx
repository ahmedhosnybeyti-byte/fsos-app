"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getCompanyFeatureAccessState, supportsSfaOperations } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { wmsApi } from "@/lib/api/wms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadEditor, operationQueryOptions } from "./operation-editors";
import { ErrorBox, Pager, Search, type Text } from "./shared";

type Proposal={productCode:string;productName:string;quantity:number};
// These are already-calculated suggestions. WMS never recalculates RIE formulas.
export function SmartLoadingWarehouseBridge({proposals,targetDate}:{proposals:Proposal[];targetDate:string}) {
  const {user}=useAuth();const {locale,t}=useTranslation();
  const company=user?.companyId;
  const allowed=!!company&&user?.role.code!=="SUPER_ADMIN"&&getCompanyFeatureAccessState(user?.featureAccess,"warehouse-core")==="ENABLED"
    &&["sfa.access","wms.read","wms.request.create"].every(p=>user?.permissions?.includes(p));
  const mode=useQuery({queryKey:["sfa-mode",company],queryFn:sfaSetupApi.mode,enabled:allowed,...operationQueryOptions});
  if(!allowed||!supportsSfaOperations(mode.data?.operatingMode))return null;
  return <Bridge company={company!} proposals={proposals} targetDate={targetDate} t={t}/>;
}
function Bridge({company,proposals,targetDate,t}:{company:string;proposals:Proposal[];targetDate:string;t:Text}) {
  const [warehouse,setWarehouse]=useState("");const [page,setPage]=useState(1),[input,setInput]=useState(""),[search,setSearch]=useState("");
  const [proposalPage,setProposalPage]=useState(1),[selected,setSelected]=useState<string[]>([]),[open,setOpen]=useState(false),[saved,setSaved]=useState(false);
  const eligible=proposals.filter(p=>Number.isFinite(p.quantity)&&p.quantity>0&&/^\d{1,12}(\.\d{1,6})?$/.test(String(p.quantity)));
  const selection=eligible.filter(p=>selected.includes(p.productCode)).map(p=>({...p,quantity:String(p.quantity)}));
  const query=useQuery({queryKey:["wms",company,"warehouses",page,search],queryFn:()=>wmsApi.warehouses(page,search),...operationQueryOptions});
  return <Card><CardHeader><CardTitle>{t("wms.send_proposal_to_warehouse")}</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-xs text-muted-foreground">{t("wms.select_up_to_20_positive_quantity_products_and_an_authorized_warehouse_this_create")}</p>
    {!eligible.length?<p className="text-sm">{t("wms.no_valid_positive_proposals_to_request")}</p>:<>
    <div className="grid gap-2 sm:grid-cols-2">{eligible.slice((proposalPage-1)*20,proposalPage*20).map(p=><Button key={p.productCode} variant={selected.includes(p.productCode)?"default":"outline"} aria-pressed={selected.includes(p.productCode)} className="h-auto min-h-10 whitespace-normal text-start" disabled={!selected.includes(p.productCode)&&selection.length>=20} onClick={()=>setSelected(s=>s.includes(p.productCode)?s.filter(c=>c!==p.productCode):[...s,p.productCode])}>{p.productName} · {p.productCode} · {p.quantity}</Button>)}</div>
    <Pager page={proposalPage} hasMore={eligible.length>proposalPage*20} busy={false} onChange={setProposalPage} t={t}/>
    <Search id="loading-warehouse-search" value={input} onChange={setInput} onSearch={()=>{setPage(1);setSearch(input.trim());}} t={t}/>
    {query.isPending?<Skeleton className="h-12"/>:query.isError?<ErrorBox error={query.error} retry={()=>void query.refetch()} t={t}/>:<><div className="flex flex-wrap gap-2">{query.data.items.map(w=><Button key={w.id} variant={warehouse===w.id?"default":"outline"} aria-pressed={warehouse===w.id} onClick={()=>setWarehouse(w.id)}>{w.name}</Button>)}</div>{!query.data.items.length&&<p className="text-sm text-muted-foreground">{t("wms.no_matching_authorized_warehouse")}</p>}<Pager page={page} hasMore={query.data.hasMore} busy={query.isFetching} onChange={setPage} t={t}/></>}
    <Button disabled={!warehouse||!selection.length} onClick={()=>setOpen(true)}>{t("wms.review_warehouse_request")} ({selection.length})</Button>
    </>}
    {saved&&<p role="status" className="text-sm text-success">{t("wms.request_created_without_reservation_or_dispatch_continue_its_workflow_in_the_wareh")}</p>}
    <Button variant="link" asChild><Link href="/sfa/warehouse">{t("wms.open_warehouse_mission_control")}</Link></Button>
    {open&&selection.length>0&&<LoadEditor warehouse={warehouse} company={company} suggestions={selection} initialTargetDate={targetDate} t={t} onClose={()=>setOpen(false)} onSaved={()=>setSaved(true)}/>}
  </CardContent></Card>;
}
