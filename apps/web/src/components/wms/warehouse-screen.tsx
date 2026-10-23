"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, ClipboardList, PackagePlus, Pencil, Plus, RefreshCw, ShieldCheck, Warehouse } from "lucide-react";
import { hasOperationalPermissions, supportsSfaOperations, getCompanyFeatureAccessState, type WmsWarehouse } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { wmsApi } from "@/lib/api/wms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from "@/components/ui/table";
import { Choice,ErrorBox,Field,Pager,quantity,Search,unitLabel,type Text } from "./shared";
import { WarehouseDialog,type WarehouseAction } from "./warehouse-dialog";

import { WmsReturnsPanel,QualityAction } from "./returns-panel";
import { WmsOperationsPanel } from "./operations-panel";
import { operationText } from "./operation-labels";
import { WmsQuarantinePanel } from "./quarantine-panel";
import { WmsCoveragePanel } from "./coverage-panel";

const queryOptions={retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false} as const;
export function WarehouseScreen({initialWarehouseId,initialReceiptId}:{initialWarehouseId?:string;initialReceiptId?:string}={}) {
  const {user,isLoading}=useAuth(); const {locale,t}=useTranslation();
  const client=useQueryClient(); const company=user?.companyId; const readOnly=user?.role.code==="COMPANY_ADMIN";
  const allowed=!!company&&user?.role.code!=="SUPER_ADMIN"&&getCompanyFeatureAccessState(user?.featureAccess,"warehouse-core")==="ENABLED"
    &&hasOperationalPermissions(user?.role.code??"",user?.permissions,["sfa.access","wms.read"]);
  const mode=useQuery({queryKey:["sfa-mode",company],queryFn:sfaSetupApi.mode,enabled:allowed,...queryOptions});
  const enabled=allowed&&supportsSfaOperations(mode.data?.operatingMode);
  const [warehouse,setWarehouse]=useState<WmsWarehouse|null>(()=>initialWarehouseId?{id:initialWarehouseId,name:initialWarehouseId,code:""}:null);
  const [pickerPage,setPickerPage]=useState(1); const [pickerInput,setPickerInput]=useState(""); const [pickerSearch,setPickerSearch]=useState("");
  const warehouses=useQuery({queryKey:["wms",company,"warehouses",pickerPage,pickerSearch],queryFn:()=>wmsApi.warehouses(pickerPage,pickerSearch),enabled,...queryOptions});
  useEffect(()=>{const found=warehouses.data?.items.find(w=>w.id===initialWarehouseId);if(found&&warehouse?.id===found.id&&warehouse.name===initialWarehouseId)setWarehouse(found);},[warehouses.data,initialWarehouseId,warehouse]);
  const [searchInput,setSearchInput]=useState(""); const [search,setSearch]=useState(""); const [productPage,setProductPage]=useState(1);
  const [lotPage,setLotPage]=useState(1); const [ledgerPage,setLedgerPage]=useState(1); const [selectedProduct,setSelectedProduct]=useState<{id:string;name:string}|null>(null);
  const [nearExpiry,setNearExpiry]=useState(false); const [horizon,setHorizon]=useState(30);
  const [action,setAction]=useState<WarehouseAction|null>(null); const ready=enabled&&!!warehouse;
  const summary=useQuery({queryKey:["wms",company,warehouse?.id,"summary",horizon],queryFn:()=>wmsApi.summary(warehouse!.id,horizon),enabled:ready,...queryOptions});
  const products=useQuery({queryKey:["wms",company,warehouse?.id,"products",productPage,search],queryFn:()=>wmsApi.products(warehouse!.id,productPage,search),enabled:ready,...queryOptions});
  const batches=useQuery({queryKey:["wms",company,warehouse?.id,"batches",lotPage,selectedProduct?.id,nearExpiry,horizon],queryFn:()=>wmsApi.batches(warehouse!.id,lotPage,selectedProduct?.id,nearExpiry,horizon),enabled:ready,...queryOptions});
  const ledger=useQuery({queryKey:["wms",company,warehouse?.id,"ledger",ledgerPage],queryFn:()=>wmsApi.movements(warehouse!.id,ledgerPage),enabled:ready&&!readOnly,...queryOptions});
  const canProduct=!readOnly&&user?.permissions?.includes("wms.products.manage"); const canPost=!readOnly&&user?.permissions?.includes("wms.opening.post");
  const canAccess=!readOnly&&user?.role.code==="COMPANY_ADMIN"&&user.permissions?.includes("wms.access.manage");
  const [showAccess,setShowAccess]=useState(false); const [accessPage,setAccessPage]=useState(1); const [accessInput,setAccessInput]=useState(""); const [accessSearch,setAccessSearch]=useState("");
  const access=useQuery({queryKey:["wms",company,warehouse?.id,"access",accessPage,accessSearch],queryFn:()=>wmsApi.users(warehouse!.id,accessPage,accessSearch),enabled:ready&&canAccess&&showAccess,...queryOptions});
  const accessMutation=useMutation({mutationFn:({userId,granted}:{userId:string;granted:boolean})=>wmsApi.access(warehouse!.id,userId,granted),onSuccess:()=>client.invalidateQueries({queryKey:["wms",company]})});
  function choose(w:WmsWarehouse) {setWarehouse(w);setProductPage(1);setLotPage(1);setLedgerPage(1);setSelectedProduct(null);setAction(null);setNearExpiry(false);setShowAccess(false);setAccessPage(1);}
  function retryAll(){void client.invalidateQueries({queryKey:["wms",company]});}
  if(isLoading||(allowed&&mode.isPending))return <div className="space-y-4"><Skeleton className="h-36"/><Skeleton className="h-64"/></div>;
  if(!enabled)return <Card><CardHeader><CardTitle>{t("wms.warehouse_mission_control")}</CardTitle></CardHeader><CardContent>{mode.isError?<ErrorBox error={mode.error} retry={()=>void mode.refetch()} t={t}/>:<p className="text-sm text-muted-foreground">{t("wms.warehouse_requires_sfa_mode_screen_activation_and_explicit_permissions_no_company_")}</p>}</CardContent></Card>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Warehouse className="h-7 w-7 text-primary"/>{t("wms.warehouse_mission_control")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("wms.stock_receiving_reservations_picking_and_dispatch_from_the_operational_ledger")}</p></div><Badge variant="outline">{t("wms.wave_1_warehouse_core")}</Badge></div>
    <Card><CardHeader><CardTitle>{t("wms.warehouse_scope")}</CardTitle></CardHeader><CardContent className="space-y-3">
      <Search id="warehouse-picker-search" value={pickerInput} onChange={setPickerInput} onSearch={()=>{setPickerPage(1);setPickerSearch(pickerInput.trim());}} t={t}/>
      {warehouses.isPending?<Skeleton className="h-12"/>:warehouses.isError?<ErrorBox error={warehouses.error} retry={()=>void warehouses.refetch()} t={t}/>:<>
        <div className="flex flex-wrap gap-2">{warehouses.data.items.map(w=><Button key={w.id} variant={warehouse?.id===w.id?"default":"outline"} aria-pressed={warehouse?.id===w.id} onClick={()=>choose(w)}><Warehouse className="h-4 w-4"/>{w.name} <span dir="ltr" className="text-xs">{w.code}</span></Button>)}</div>
        {!warehouses.data.items.length&&<p className="py-3 text-sm text-muted-foreground">{t("wms.no_matching_authorized_warehouses_ask_your_administrator_to_configure_a_warehouse_")}</p>}
        <Pager page={pickerPage} hasMore={warehouses.data.hasMore} busy={warehouses.isFetching} onChange={setPickerPage} t={t}/>
      </>}
      {!readOnly&&user?.role.code==="COMPANY_ADMIN"&&user.permissions?.includes("company.manage")&&getCompanyFeatureAccessState(user.featureAccess,"sfa-setup")==="ENABLED"&&<Link href="/sfa/setup" className="inline-flex rounded-md text-sm text-primary underline focus-visible:ring-2 focus-visible:ring-ring">{t("wms.manage_warehouse_registry")}</Link>}
    </CardContent></Card>
    {!warehouse?<Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center"><Boxes className="h-10 w-10 text-primary"/><h2 className="text-lg font-semibold">{t("wms.choose_a_warehouse_to_begin")}</h2><p className="max-w-lg text-sm text-muted-foreground">{t("wms.its_actual_balances_lots_and_your_authorized_actions_will_appear_here")}</p></CardContent></Card>:<>
    <section className="glass-hero p-4 sm:p-6" aria-label={t("wms.warehouse_operations_center")}><div className="relative z-10 space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-primary">{t("wms.selected_warehouse")}</p><h2 className="mt-1 text-xl font-bold">{warehouse.name}</h2><p className="mt-1 text-xs text-muted-foreground">{t("wms.available_excludes_reserved_quarantined_expired_and_inactive_product_stock")}</p></div><Button variant="outline" size="sm" onClick={retryAll} disabled={summary.isFetching}><RefreshCw className="h-4 w-4"/>{t("wms.refresh")}</Button></div>
    {summary.isPending?<Skeleton className="h-28"/>:summary.isError?<ErrorBox error={summary.error} retry={()=>void summary.refetch()} t={t}/>:<>
      <div className="flex flex-wrap gap-2"><Badge>{summary.data.stockedProducts} {t("wms.stocked_products")}</Badge><Badge variant={summary.data.nearExpiryBatches?"warning":"secondary"}>{summary.data.nearExpiryBatches} {t("wms.near_expiry_lots")}</Badge><Badge variant={summary.data.expiredBatches?"destructive":"secondary"}>{summary.data.expiredBatches} {t("wms.expired_lots")}</Badge></div>
      {!summary.data.units.length?<p className="py-4 text-sm text-muted-foreground">{t("wms.no_posted_stock_in_this_warehouse_create_a_product_then_post_reviewed_opening_coun")}</p>:summary.data.units.map(u=><div key={u.baseUnit} className="glass-card p-4"><p className="mb-3 text-sm font-semibold">{t("wms.balances_in")} {unitLabel(u.baseUnit,t)}</p><dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{([[t("wms.physical"),u.physical],[t("wms.available"),u.available],[t("wms.reserved_850e28e"),u.reserved],[t("wms.quarantined_6909176"),u.quarantined],[t("wms.in_transit"),u.inTransit],[t("wms.expired_within_physical"),u.expired]]).map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-all text-xl font-bold tabular-nums" dir="ltr">{quantity(value)}</dd></div>)}</dl></div>)}
      <p className="text-xs text-muted-foreground">{t("wms.read_at")} <time dateTime={summary.data.asOf}>{new Date(summary.data.asOf).toLocaleString(locale==="ar"?"ar-SA":"en-GB")}</time> · {t("wms.different_units_are_never_added_together")}</p>
    </>}
    </div></section>
    {!readOnly&&<>
    <WmsCoveragePanel key={warehouse.id+"coverage"} warehouse={warehouse.id} company={company!} t={t}/>
    <WmsQuarantinePanel key={warehouse.id+"quarantine"} warehouse={warehouse.id} company={company!} permissions={user?.permissions??[]} t={t}/>
    <WmsOperationsPanel initialReceiptId={initialReceiptId} key={warehouse.id} warehouse={warehouse.id} company={company!} userId={user!.id} permissions={user?.permissions??[]} t={t}/>
    <WmsReturnsPanel key={warehouse.id+"returns"} warehouse={warehouse.id} company={company!} permissions={user?.permissions??[]} t={t}/>
    </>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-primary"/>{t("wms.products_balances")}</CardTitle>{canProduct&&<Button size="sm" onClick={()=>setAction({kind:"product"})}><Plus className="h-4 w-4"/>{t("wms.new_product")}</Button>}</div></CardHeader><CardContent className="space-y-4">
      <Search id="product-search" value={searchInput} onChange={setSearchInput} onSearch={()=>{setProductPage(1);setSearch(searchInput.trim());}} t={t}/>
      {products.isPending?<Skeleton className="h-60"/>:products.isError?<ErrorBox error={products.error} retry={()=>void products.refetch()} t={t}/>:<>
        {!products.data.items.length?<p className="py-6 text-sm text-muted-foreground">{t("wms.no_matching_products_add_a_product_master_to_begin")}</p>:<ul className="divide-y divide-border">{products.data.items.map(p=><li key={p.id} className="space-y-3 py-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold">{p.name}</h3><p className="mt-1 text-xs text-muted-foreground"><bdi>{p.code}</bdi>{p.barcode&&<> · <bdi>{p.barcode}</bdi></>}</p></div><Badge variant={p.isActive?"success":"secondary"}>{p.isActive?t("wms.active"):t("wms.inactive")}</Badge></div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[[t("wms.physical_d9dc474"),p.physical],[t("wms.available_fa9e2f7"),p.available],[t("wms.reserved"),p.reserved],[t("wms.quarantined"),p.quarantined]].map(([label,value])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{quantity(value)} <span className="text-xs font-normal">{unitLabel(p.baseUnit,t)}</span></dd></div>)}</dl>
          <div className="flex flex-wrap gap-2"><Badge variant="outline">{p.baseUnit==="PIECE"?`${t("wms.carton")} = ${p.piecesPerCarton} ${unitLabel(p.baseUnit,t)}`:unitLabel(p.baseUnit,t)}</Badge>{p.trackBatches&&<Badge variant="secondary">{t("wms.lot_tracked")}</Badge>}{p.trackExpiry&&<Badge variant="secondary">{t("wms.expiry_tracked")}</Badge>}{p.sensitiveHandling&&<Badge variant="warning">{t("wms.sensitive_handling")}</Badge>}</div>
          {p.handlingNotes&&<p className="break-words text-xs text-muted-foreground">{p.handlingNotes}</p>}
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-pressed={selectedProduct?.id===p.id} onClick={()=>{setSelectedProduct({id:p.id,name:p.name});setLotPage(1);setNearExpiry(false);}}>{t("wms.lots")}</Button>{canProduct&&<Button size="sm" variant="outline" aria-label={`${t("wms.edit")} ${p.name}`} onClick={()=>setAction({kind:"product",product:p})}><Pencil className="h-3.5 w-3.5"/>{t("wms.edit")}</Button>}{canProduct&&p.trackBatches&&p.isActive&&<Button size="sm" variant="outline" onClick={()=>setAction({kind:"batch",product:p})}><Plus className="h-3.5 w-3.5"/>{t("wms.lot_fb631e1")}</Button>}{canPost&&p.isActive&&<Button size="sm" onClick={()=>setAction({kind:"opening",product:p})}><PackagePlus className="h-3.5 w-3.5"/>{t("wms.opening_stock")}</Button>}</div>
        </li>)}</ul>}
        <Pager page={productPage} hasMore={products.data.hasMore} busy={products.isFetching} onChange={setProductPage} t={t}/>
      </>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning"/>{t("wms.lots_expiry")}</CardTitle></CardHeader><CardContent className="space-y-4">
      <Field id="expiry-horizon" label={t("wms.alert_horizon_in_days")}><Choice id="expiry-horizon" value={String(horizon)} onChange={v=>{setHorizon(Number(v));setLotPage(1);}} options={[7,30,60,90].map(v=>({value:String(v),label:`${v} ${t("wms.days_4600034")}`}))}/></Field>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant={!nearExpiry&&!selectedProduct?"default":"outline"} onClick={()=>{setNearExpiry(false);setSelectedProduct(null);setLotPage(1);}}>{t("wms.all_stock")}</Button><Button size="sm" variant={nearExpiry?"default":"outline"} onClick={()=>{setNearExpiry(true);setSelectedProduct(null);setLotPage(1);}}>{t("wms.near_expiry")}</Button></div>
      {selectedProduct&&<p className="text-sm text-primary">{t("wms.product_lots")} {selectedProduct.name}</p>}
      {batches.isPending?<Skeleton className="h-48"/>:batches.isError?<ErrorBox error={batches.error} retry={()=>void batches.refetch()} t={t}/>:<>
        {!batches.data.items.length?<p className="py-6 text-sm text-muted-foreground">{t("wms.no_lots_in_this_scope")}</p>:<ul className="divide-y divide-border">{batches.data.items.map(b=><li key={b.id} className="space-y-2 py-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{b.productName}</h3><p className="text-xs text-muted-foreground">{b.code==="__UNTRACKED__"?t("wms.stock_without_lot_tracking"):b.code}</p></div><Badge variant={b.isQuarantined||b.qualityBlocked?"warning":b.daysRemaining!==null&&b.daysRemaining<=0?"destructive":b.daysRemaining!==null&&b.daysRemaining<=horizon?"warning":"secondary"}>{b.qualityBlocked?t("wms.quality_blocked"):b.isQuarantined?t("wms.quarantined_73845da"):b.daysRemaining===null?t("wms.no_expiry"):b.daysRemaining<=0?t("wms.expired_unavailable"):`${b.daysRemaining} ${t("wms.days_remaining")}`}</Badge></div>
          <dl className="grid grid-cols-2 gap-2 text-xs"><div><dt className="text-muted-foreground">{t("wms.production")}</dt><dd>{b.productionDate??t("wms.not_recorded")}</dd></div><div><dt className="text-muted-foreground">{t("wms.expiry")}</dt><dd>{b.expiryDate??t("wms.not_recorded")}</dd></div><div><dt className="text-muted-foreground">{t("wms.life_consumed")}</dt><dd>{b.lifeConsumedPct===null?t("wms.unknown_missing_date"):`${quantity(b.lifeConsumedPct)}%`}</dd></div><div><dt className="text-muted-foreground">{t("wms.physical_available")}</dt><dd>{quantity(b.physical)} / {quantity(b.available)} {unitLabel(b.baseUnit,t)}</dd></div></dl>
          {!readOnly&&user?.permissions?.includes("wms.quality.manage")&&<QualityAction warehouse={warehouse.id} company={company!} batchId={b.id} blocked={b.qualityBlocked} t={t}/>}
        </li>)}</ul>}
        <Pager page={lotPage} hasMore={batches.data.hasMore} busy={batches.isFetching} onChange={setLotPage} t={t}/>
      </>}
      <p className="text-xs text-muted-foreground">{t("wms.stock_is_blocked_on_its_expiry_date_quality_is_rechecked_at_reservation_picking_di")}</p>
    </CardContent></Card>
    </div>
    {!readOnly&&<>
    <Card><CardHeader><CardTitle>{t("wms.physical_counts_stock_adjustments")}</CardTitle></CardHeader><CardContent><Button asChild><Link href={`/sfa/warehouse/counts?warehouseCode=${encodeURIComponent(warehouse.code)}`}>{t("wms.open_physical_counts")}</Link></Button></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary"/>{t("wms.movement_ledger")}</CardTitle></CardHeader><CardContent>
      {ledger.isPending?<Skeleton className="h-44"/>:ledger.isError?<ErrorBox error={ledger.error} retry={()=>void ledger.refetch()} t={t}/>:<>{!ledger.data.items.length?<p className="py-5 text-sm text-muted-foreground">{t("wms.no_posted_movements_each_opening_appears_here_with_its_reference_and_reason")}</p>:<Table><TableHeader><TableRow>{[t("wms.movement_reference"),t("wms.product_lot_6eb91b6"),t("wms.base_quantity"),t("wms.input_unit"),t("wms.reason_time"),t("wms.action")].map(l=><TableHead key={l}>{l}</TableHead>)}</TableRow></TableHeader><TableBody>{ledger.data.items.map(m=><TableRow key={m.id}><TableCell><Badge variant={m.kind==="REVERSAL"?"warning":"secondary"}>{operationText(m.kind,t)}</Badge><p className="mt-1 text-xs">{m.reference}</p>{m.reversed&&<p className="text-xs text-muted-foreground">{t("wms.reversed_b31bfd7")}</p>}</TableCell><TableCell>{m.productName}<p className="text-xs text-muted-foreground">{m.batchCode==="__UNTRACKED__"?"—":m.batchCode}</p></TableCell><TableCell className="tabular-nums">{quantity(m.quantity)} {unitLabel(m.baseUnit,t)}{(m.reservedDelta!=="0.000000"||m.inTransitDelta!=="0.000000")&&<p className="text-xs text-muted-foreground">{t("wms.reserved_transit_change")}: {quantity(m.reservedDelta)} / {quantity(m.inTransitDelta)}</p>}</TableCell><TableCell>{quantity(m.inputQuantity)} {m.inputUnit==="CARTON"?t("wms.carton_776d2a9"):unitLabel(m.baseUnit,t)}<p className="text-xs text-muted-foreground">× {m.conversionFactor}</p></TableCell><TableCell><p className="max-w-64 whitespace-normal break-words text-xs">{m.reason}</p><time className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString(locale==="ar"?"ar-SA":"en-GB")}</time></TableCell><TableCell>{canPost&&m.kind==="OPENING"&&!m.reversed?<Button variant="outline" size="sm" onClick={()=>setAction({kind:"reverse",movement:m})}>{t("wms.reverse")}</Button>:"—"}</TableCell></TableRow>)}</TableBody></Table>}
      <Pager page={ledgerPage} hasMore={ledger.data.hasMore} busy={ledger.isFetching} onChange={setLedgerPage} t={t}/></>}
    </CardContent></Card>
    </>}
    {canAccess&&<Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/>{t("wms.warehouse_access")}</CardTitle><Button variant="outline" size="sm" aria-expanded={showAccess} onClick={()=>setShowAccess(!showAccess)}>{showAccess?t("wms.close"):t("wms.manage_access")}</Button></div></CardHeader>{showAccess&&<CardContent className="space-y-4"><p className="text-xs text-muted-foreground">{t("wms.company_administrators_see_their_company_warehouses_other_users_need_an_assignment")}</p><Search id="access-search" value={accessInput} onChange={setAccessInput} onSearch={()=>{setAccessPage(1);setAccessSearch(accessInput.trim());}} t={t}/>{accessMutation.isError&&<ErrorBox error={accessMutation.error} t={t}/>} {access.isPending?<Skeleton className="h-20"/>:access.isError?<ErrorBox error={access.error} retry={()=>void access.refetch()} t={t}/>:<><ul className="divide-y divide-border">{access.data.items.map(u=><li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="text-sm">{u.fullName}</span><Button variant="outline" size="sm" disabled={accessMutation.isPending} onClick={()=>accessMutation.mutate({userId:u.id,granted:!u.granted})}>{u.granted?t("wms.revoke_assignment"):t("wms.assign_warehouse")}</Button></li>)}</ul><Pager page={accessPage} hasMore={access.data.hasMore} busy={access.isFetching} onChange={setAccessPage} t={t}/></>}</CardContent>}</Card>}
    </>}
    {action&&warehouse&&company&&<WarehouseDialog action={action} warehouse={warehouse.id} company={company} onClose={()=>setAction(null)} t={t}/>}
  </div>;
}
