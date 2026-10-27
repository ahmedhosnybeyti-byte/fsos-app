"use client";
import { useRef, useState, type FormEvent } from "react";
import { Download, Truck } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getCompanyFeatureAccessState, type SmartLoadingWarehouseRequestInput } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { operationQueryOptions } from "./operation-editors";
import { ErrorBox, Pager, Search, type Text } from "./shared";
import { ProductCategoryGroups } from "@/components/products/product-category-groups";

type Proposal={productCode:string;productName:string;category?:string|null;quantity:number};
// Keep the operational two-decimal quantity contract. This prevents a positive
// calculated amount such as 0.01 from being rounded into the invalid value 0.0.
function warehouseQuantity(value:number){
  const serialized=value.toFixed(2);
  // A positive recommendation smaller than one hundredth cannot be represented
  // with the requested two decimal places. Keep it positive at the smallest
  // WMS-accepted carton quantity instead of serializing it as 0.00.
  return serialized==="0.00"?"0.01":serialized;
}
// These are already-calculated suggestions. WMS never recalculates RIE formulas.
export function SmartLoadingWarehouseBridge({proposals,targetDate,onExport,disabled=false,requestDisabled=false}:{proposals:Proposal[];targetDate:string;onExport:()=>Promise<void>;disabled?:boolean;requestDisabled?:boolean}) {
  const {user}=useAuth();const {locale,t}=useTranslation();
  const [open,setOpen]=useState(false),[exporting,setExporting]=useState(false);
  const exportPending=useRef(false),requestPending=useRef(false);
  const company=user?.companyId;
  // Warehouse permissions are deliberately absent. The server restricts this
  // request-only gateway to the rep's explicit warehouse assignments in FULL_ERP.
  const allowed=!!company&&user?.role.code==="SALES_REP"&&user.permissions?.includes("sfa.access")
    &&getCompanyFeatureAccessState(user.featureAccess,"warehouse-core")==="ENABLED"
    &&getCompanyFeatureAccessState(user.featureAccess,"smart-loading")==="ENABLED";
  const mode=useQuery({queryKey:["sfa-mode",company],queryFn:sfaSetupApi.mode,enabled:!!company,...operationQueryOptions});
  const fullErp=mode.data?.operatingMode==="FULL_ERP";
  const ready=!!mode.data&&!mode.isError;
  const reason=fullErp&&!allowed?t("smartLoading.requestAccessRequired"):fullErp&&requestDisabled?t("smartLoading.applyBeforeSending"):undefined;
  async function exportOrder(){
    if(exportPending.current)return;
    exportPending.current=true;setExporting(true);
    try{await onExport();}finally{exportPending.current=false;setExporting(false);}
  }
  return <>
    <Button variant="outline" title={reason} disabled={disabled||!ready||exporting||(fullErp&&(!allowed||requestDisabled))} onClick={()=>fullErp?setOpen(true):void exportOrder()}>
      {fullErp?<Truck className="h-4 w-4"/>:<Download className="h-4 w-4"/>}
      {t(fullErp?"smartLoading.sendToWarehouse":"smartLoading.exportLoadingOrderExcel")}
    </Button>
    {reason&&<p role="status" className="mt-1 max-w-xs text-xs text-muted-foreground">{reason}</p>}
    {mode.isError&&<ErrorBox error={mode.error} retry={()=>void mode.refetch()} t={t}/>}
    {open&&ready&&fullErp&&allowed&&<Dialog open onOpenChange={value=>{if(!requestPending.current)setOpen(value);}}><DialogContent dir={locale==="ar"?"rtl":"ltr"} className="max-w-3xl"><DialogHeader><DialogTitle>{t("smartLoading.sendToWarehouse")}</DialogTitle><DialogDescription>{t("smartLoading.requestOnlyDescription")}</DialogDescription></DialogHeader><RequestForm company={company!} userId={user!.id} proposals={proposals} targetDate={targetDate} t={t} onBusyChange={value=>{requestPending.current=value;}}/></DialogContent></Dialog>}
  </>;
}

function RequestForm({company,userId,proposals,targetDate,t,onBusyChange}:{company:string;userId:string;proposals:Proposal[];targetDate:string;t:Text;onBusyChange:(busy:boolean)=>void}) {
  // Smart Loading results are JavaScript numbers.  A recurring decimal (for
  // example, demand divided over calendar days) may carry binary precision
  // beyond the WMS decimal contract even though the displayed loading value is
  // valid.  Serialize with the screen's established one-decimal quantity
  // contract; reject the whole order if that would produce an invalid/zero line.
  // No proposal is silently removed and the calculation itself is untouched.
  // The WMS contract identifies a product case-insensitively and accepts one
  // line per product. Preserve every calculated quantity by consolidating only
  // duplicate representations of that same code before validation.
  const eligibleByCode=new Map<string,Proposal>();
  for(const proposal of proposals){
    if(!Number.isFinite(proposal.quantity)||proposal.quantity<=0)continue;
    const productCode=proposal.productCode.trim().toUpperCase(),existing=eligibleByCode.get(productCode);
    if(existing)existing.quantity+=proposal.quantity;
    else eligibleByCode.set(productCode,{...proposal,productCode});
  }
  const eligible=[...eligibleByCode.values()];
  const lines=eligible.map(p=>({productCode:p.productCode,quantity:warehouseQuantity(p.quantity),unit:"CARTON" as const}));
  const [warehouse,setWarehouse]=useState(""),[page,setPage]=useState(1),[input,setInput]=useState(""),[search,setSearch]=useState("");
  const [confirmed,setConfirmed]=useState(false),[invalid,setInvalid]=useState(false);
  const [keys]=useState(()=>({idempotencyKey:crypto.randomUUID(),proposalKey:crypto.randomUUID()}));
  const sending=useRef(false);
  const warehouses=useQuery({queryKey:["smart-loading-request",company,userId,"warehouses",page,search],queryFn:()=>smartLoadingApi.requestWarehouses(page,search),...operationQueryOptions});
  const selectedWarehouse=warehouses.data?.items.find((item:{id:string;name:string})=>item.id===warehouse);
  const send=useMutation({retry:false,mutationFn:(body:SmartLoadingWarehouseRequestInput)=>smartLoadingApi.sendWarehouseRequest(warehouse,body),
    onSettled:()=>{sending.current=false;onBusyChange(false);}});
  function submit(event:FormEvent){
    event.preventDefault();if(sending.current||send.isSuccess)return;
    const body:SmartLoadingWarehouseRequestInput={...keys,targetDate,lines};
    setInvalid(!warehouse||!confirmed);
    if(!warehouse||!confirmed)return;
    sending.current=true;onBusyChange(true);send.mutate(body);
  }
  return <form onSubmit={submit} className="space-y-3">
    <fieldset disabled={send.isPending||send.isSuccess} className="min-w-0 space-y-3">
      <p className="text-xs text-muted-foreground">{t("smartLoading.sendWholeLoadingDescription")}</p>
      {!eligible.length?<p className="text-sm">{t("wms.no_valid_positive_proposals_to_request")}</p>:<>
        <section aria-label={t("smartLoading.productsAndQuantities")} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{t("smartLoading.finalLoadingReview")}</p><span className="text-xs text-muted-foreground">{eligible.length} {t("smartLoading.productsAndQuantities")}</span></div>
          <div className="max-h-80 overflow-y-auto pe-1"><ProductCategoryGroups items={eligible} contentClassName="space-y-2" renderItem={(proposal,index)=><div key={proposal.productCode} className="glass-card flex items-center justify-between gap-3 p-3 text-start text-sm"><span className="min-w-0 break-words font-medium">{proposal.productName} · {proposal.productCode}</span><span className="shrink-0 text-primary">{lines[index]!.quantity} {t("wms.carton")}</span></div>}/></div>
        </section>
      </>}
      <Search embedded id="loading-request-warehouse-search" value={input} onChange={setInput} onSearch={()=>{setPage(1);setSearch(input.trim());}} t={t}/>
      {warehouses.isPending?<Skeleton className="h-12"/>:warehouses.isError?<ErrorBox error={warehouses.error} retry={()=>void warehouses.refetch()} t={t}/>:<>
        <div className="space-y-2"><p className="text-sm font-medium">{t("smartLoading.selectedWarehouse")}: {selectedWarehouse?.name??t("smartLoading.chooseWarehouseToContinue")}</p><div className="flex flex-wrap gap-2">{warehouses.data.items.map(w=><Button key={w.id} type="button" variant={warehouse===w.id?"default":"outline"} aria-pressed={warehouse===w.id} onClick={()=>setWarehouse(w.id)}>{w.name}</Button>)}</div></div>
        {!warehouses.data.items.length&&<p role="status" className="text-sm text-muted-foreground">{t("smartLoading.noAssignedWarehouse")}</p>}
        <Pager page={page} hasMore={warehouses.data.hasMore} busy={warehouses.isFetching} onChange={setPage} t={t}/>
      </>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t("smartLoading.confirmCartonUnits")}</label>
    </fieldset>
    {invalid&&<p role="alert" className="text-sm text-destructive">{t("smartLoading.requestFieldsRequired")}</p>}
    {send.isError&&<ErrorBox error={send.error} t={t}/>}
    {send.isSuccess?<p role="status" className="text-sm text-success">{t("wms.request_created_without_reservation_or_dispatch_continue_its_workflow_in_the_wareh")}</p>:<Button type="submit" disabled={!warehouse||!confirmed||send.isPending}>{send.isPending?t("wms.saving"):t("smartLoading.sendToWarehouse")} ({eligible.length})</Button>}
  </form>;
}
