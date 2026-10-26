"use client";
import {useRef,useState} from "react";
import {useMutation,useQuery,useQueryClient} from "@tanstack/react-query";
import {getCompanyFeatureAccessState,type LoadingRecipientSummary} from "@field-sales-os/schemas";
import {useAuth} from "@/hooks/use-auth";
import {useTranslation} from "@/components/translation-provider";
import {smartLoadingApi as api} from "@/lib/api/smart-loading";
import {sfaSetupApi} from "@/lib/api/sfa-setup";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Skeleton} from "@/components/ui/skeleton";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {ErrorBox,Pager,stockQuantity} from "./shared";
import {operationText} from "./operation-labels";
import {ProductCategoryGroups} from "../products/product-category-groups";
export function LoadingRecipientPanel(){
 const {user}=useAuth(),{t}=useTranslation(),client=useQueryClient();
 const [page,setPage]=useState(1),[selected,setSelected]=useState<LoadingRecipientSummary|null>(null);
 const pending=useRef(false),keys=useRef({confirm:crypto.randomUUID(),decline:crypto.randomUUID()});
 const allowed=user?.role.code==="SALES_REP"&&user.permissions?.includes("sfa.access")&&getCompanyFeatureAccessState(user.featureAccess,"warehouse-core")==="ENABLED";
 const mode=useQuery({queryKey:["sfa-mode",user?.companyId],queryFn:sfaSetupApi.mode,enabled:!!allowed});
 const enabled=!!allowed&&mode.data?.operatingMode==="FULL_ERP";
 const scope=["loading-recipient",user?.companyId,user?.id];
 const loads=useQuery({queryKey:[...scope,"list",page],queryFn:()=>api.recipientLoads(page),enabled,staleTime:30000,refetchOnWindowFocus:true,retry:false});
 const detail=useQuery({queryKey:[...scope,"detail",selected?.id],queryFn:()=>api.recipientLoad(selected!.warehouseId,selected!.id),enabled:enabled&&!!selected,staleTime:0,retry:false});
 const decide=useMutation({retry:false,mutationFn:(confirmed:boolean)=>api.recipientDecision(selected!.warehouseId,selected!.id,{version:detail.data!.version,confirmed,
   note:t(confirmed?"smartLoading.recipientConsentNote":"smartLoading.returnForPreparation"),idempotencyKey:confirmed?keys.current.confirm:keys.current.decline}),
   onSuccess:()=>{setSelected(null);void client.invalidateQueries({queryKey:scope});void client.invalidateQueries({queryKey:["wms"]});},onSettled:()=>{pending.current=false;}});
 function open(row:LoadingRecipientSummary){keys.current={confirm:crypto.randomUUID(),decline:crypto.randomUUID()};decide.reset();setSelected(row);}
 function submit(confirmed:boolean){if(pending.current||!detail.data||detail.data.status!=="APPROVED"||detail.isFetching)return;pending.current=true;decide.mutate(confirmed);}
 if(!enabled)return null;
 return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{t("smartLoading.recipientLoadingTitle")}</CardTitle><Button variant="outline" onClick={()=>void client.invalidateQueries({queryKey:scope})}>{t("smartLoading.refreshRecipientLoads")}</Button></div></CardHeader><CardContent className="space-y-3">
  <p className="text-sm text-muted-foreground">{t("smartLoading.recipientLoadingDescription")}</p>
  {loads.isPending?<Skeleton className="h-16"/>:loads.isError?<ErrorBox error={loads.error} retry={()=>void loads.refetch()} t={t}/>:<>
   {!loads.data.items.length&&<p className="text-sm text-muted-foreground">{t("smartLoading.noRecipientLoads")}</p>}
   <div className="grid gap-3 sm:grid-cols-2">{loads.data.items.map(row=><div key={row.id} className="glass-card space-y-2 p-3 text-start">
    <p className="break-words text-sm font-semibold">{row.reference}</p><p className="text-xs">{row.warehouseName} · {row.targetDate}</p>
    <Badge variant={row.status==="APPROVED"?"warning":row.status==="ACCEPTED"?"success":"secondary"}>{row.status==="APPROVED"?t(row.recipientConfirmed?"smartLoading.recipientConsentRecorded":"smartLoading.readyForRecipientReview"):operationText(row.status,t)}</Badge>
    <Button variant={row.status==="APPROVED"?"default":"outline"} onClick={()=>open(row)}>{t(row.status==="APPROVED"?"smartLoading.reviewAndDecide":"smartLoading.showLoadingQuantities")}</Button>
   </div>)}</div><Pager page={page} hasMore={loads.data.hasMore} busy={loads.isFetching} onChange={setPage} t={t}/>
  </>}
  {selected&&<Dialog open onOpenChange={v=>{if(!v&&!pending.current)setSelected(null);}}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{t("smartLoading.reviewPreparedLoading")}</DialogTitle><DialogDescription>{selected.reference} · {selected.warehouseName}</DialogDescription></DialogHeader>
   {detail.isPending?<Skeleton className="h-28"/>:detail.isError?<ErrorBox error={detail.error} retry={()=>void detail.refetch()} t={t}/>:<div className="space-y-4">
    <p className="text-sm">{t("smartLoading.recipientLoadingDescription")}</p>
    <ProductCategoryGroups items={detail.data.lines} renderItem={line=><div className="glass-card space-y-2 p-3" key={line.id}><p className="text-sm font-semibold">{line.productName} · {line.productCode}</p><dl className="grid grid-cols-3 gap-2 text-xs">
     {[["smartLoading.requestedLoadingQuantity",line.requestedQuantity],["smartLoading.preparedLoadingQuantity",line.preparedQuantity],["smartLoading.loadingShortage",line.shortageQuantity]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{t(label as "smartLoading.loadingShortage")}</dt><dd>{stockQuantity(value!,line.piecesPerCarton,line.baseUnit,t)}</dd></div>)}
    </dl></div>}/>
    {detail.data.discrepancyReason&&<p className="text-sm text-warning">{t("wms.picking_discrepancy")}: {detail.data.discrepancyReason}</p>}
    {detail.data.status==="APPROVED"?<fieldset disabled={decide.isPending||detail.isFetching} className="flex flex-wrap gap-3">
     <Button onClick={()=>submit(true)}>{t("smartLoading.approvePreparedQuantities")}</Button>
     <Button variant="outline" onClick={()=>submit(false)}>{t("smartLoading.returnForPreparation")}</Button>
    </fieldset>:<p role="status" className="text-sm text-primary">{detail.data.status==="ACCEPTED"?t("smartLoading.custodyAfterConsent"):detail.data.recipientConfirmed?t("smartLoading.recipientConsentRecorded"):operationText(detail.data.status,t)}</p>}
    {decide.isError&&<ErrorBox error={decide.error} t={t}/>}
   </div>}
  </DialogContent></Dialog>}
 </CardContent></Card>;
}
