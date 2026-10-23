"use client";
import { useState, type FormEvent } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { wmsBatchSchema,wmsCreateProductSchema,wmsOpeningSchema,wmsReversalSchema,wmsUpdateProductSchema,type WmsMovement,type WmsProduct,type WmsProductInput } from "@field-sales-os/schemas";
import { wmsApi } from "@/lib/api/wms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Choice,ErrorBox,Field,Pager,unitLabel,type Text } from "./shared";

export type WarehouseAction={kind:"product";product?:WmsProduct}|{kind:"batch";product:WmsProduct}|{kind:"opening";product:WmsProduct}|{kind:"reverse";movement:WmsMovement};
export function WarehouseDialog({action,warehouse,company,onClose,t}:{action:WarehouseAction;warehouse:string;company:string;onClose:()=>void;t:Text}) {
  const client=useQueryClient();
  const product="product" in action?action.product:undefined;
  const [form,setForm]=useState<WmsProductInput>(product?{code:product.code,barcode:product.barcode,name:product.name,baseUnit:product.baseUnit,piecesPerCarton:product.piecesPerCarton,trackBatches:product.trackBatches,trackExpiry:product.trackExpiry,sensitiveHandling:product.sensitiveHandling,handlingNotes:product.handlingNotes,isActive:product.isActive}:{code:"",barcode:null,name:"",baseUnit:"PIECE",piecesPerCarton:1,trackBatches:false,trackExpiry:false,sensitiveHandling:false,handlingNotes:null,isActive:true});
  const [batch,setBatch]=useState({code:"",productionDate:"",expiryDate:"",isQuarantined:false});
  const [opening,setOpening]=useState({batchId:"",quantity:"",unit:"BASE",reference:"",reason:"",quarantined:false});
  const [reason,setReason]=useState(""); const [confirmed,setConfirmed]=useState(false);
  const [key]=useState(()=>crypto.randomUUID()); const [invalid,setInvalid]=useState(false); const [batchPage,setBatchPage]=useState(1);
  const batches=useQuery({queryKey:["wms",company,warehouse,"opening-lots",product?.id,batchPage],queryFn:()=>wmsApi.batches(warehouse,batchPage,product?.id),enabled:action.kind==="opening"&&!!product?.trackBatches,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const mutation=useMutation({mutationFn:async()=>{
    if(action.kind==="product") {
      const body=product?wmsUpdateProductSchema.parse({...form,version:product.version}):wmsCreateProductSchema.parse(form);
      return wmsApi.product(warehouse,body,product?.id);
    }
    if(action.kind==="batch") return wmsApi.batch(warehouse,wmsBatchSchema.parse({...batch,productId:action.product.id,productionDate:batch.productionDate||null,expiryDate:batch.expiryDate||null}));
    if(action.kind==="opening") return wmsApi.opening(warehouse,wmsOpeningSchema.parse({...opening,productId:action.product.id,batchId:opening.batchId||null,idempotencyKey:key}));
    return wmsApi.reverse(warehouse,action.movement.id,wmsReversalSchema.parse({reason,idempotencyKey:key}));
  },onSuccess:async()=>{await Promise.all([client.invalidateQueries({queryKey:["wms",company]}),client.invalidateQueries({queryKey:["sfa-checklist",company]})]);onClose();}});
  function submit(e:FormEvent) {
    e.preventDefault(); let valid=false;
    if(action.kind==="product") valid=wmsCreateProductSchema.safeParse(form).success;
    if(action.kind==="batch") valid=wmsBatchSchema.safeParse({...batch,productId:product!.id,productionDate:batch.productionDate||null,expiryDate:batch.expiryDate||null}).success&&(!product!.trackExpiry||!!batch.expiryDate);
    if(action.kind==="opening") valid=confirmed&&(!product!.trackBatches||!!opening.batchId)&&wmsOpeningSchema.safeParse({...opening,productId:product!.id,batchId:opening.batchId||null,idempotencyKey:key}).success;
    if(action.kind==="reverse") valid=confirmed&&wmsReversalSchema.safeParse({reason,idempotencyKey:key}).success;
    setInvalid(!valid); if(valid)mutation.mutate();
  }
  const title=action.kind==="product"?(product?t("wms.edit_product"):t("wms.new_product")):action.kind==="batch"?t("wms.add_lot"):action.kind==="opening"?t("wms.post_opening_stock"):t("wms.reverse_opening_stock");
  function flag(id:string,label:string,value:boolean,change:(v:boolean)=>void) {return <div className="flex items-center justify-between gap-3"><Label htmlFor={id}>{label}</Label><Switch id={id} checked={value} onCheckedChange={change} /></div>;}
  return <Dialog open onOpenChange={v=>{if(!v&&!mutation.isPending)onClose();}}><DialogContent onEscapeKeyDown={e=>{if(mutation.isPending)e.preventDefault();}} onPointerDownOutside={e=>{if(mutation.isPending)e.preventDefault();}}><DialogHeader className="text-start"><DialogTitle>{title}</DialogTitle><DialogDescription>{product?`${product.name} · ${product.code}`:action.kind==="reverse"?action.movement.reference:t("wms.operational_data_independent_of_analytical_excel_files")}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><fieldset disabled={mutation.isPending} className="min-w-0 space-y-4">
    {action.kind==="product"&&<>
      <div className="grid gap-3 sm:grid-cols-2"><Field id="product-code" label={t("wms.product_code")}><Input id="product-code" required dir="ltr" maxLength={40} value={form.code} onChange={e=>setForm({...form,code:e.target.value})} /></Field><Field id="product-barcode" label={t("wms.barcode_optional")}><Input id="product-barcode" dir="ltr" maxLength={80} value={form.barcode??""} onChange={e=>setForm({...form,barcode:e.target.value||null})}/></Field></div>
      <Field id="product-name" label={t("wms.product_name")}><Input id="product-name" required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field id="product-unit" label={t("wms.base_unit")}><Choice id="product-unit" value={form.baseUnit} onChange={v=>setForm({...form,baseUnit:v as WmsProductInput["baseUnit"],piecesPerCarton:v==="PIECE"?form.piecesPerCarton:1})} options={["PIECE","KG","LITRE"].map(value=>({value,label:unitLabel(value,t)}))}/></Field><Field id="product-carton" label={t("wms.pieces_per_carton")}><Input id="product-carton" type="number" min={1} max={1000000} step={1} disabled={form.baseUnit!=="PIECE"} value={form.piecesPerCarton} onChange={e=>setForm({...form,piecesPerCarton:Number(e.target.value)})}/></Field></div>
      <p className="text-xs text-muted-foreground">{t("wms.unit_packaging_and_tracking_lock_after_the_first_lot_concurrent_edits_are_rejected")}</p>
      {flag("track-batches",t("wms.track_lots"),form.trackBatches,v=>setForm({...form,trackBatches:v,trackExpiry:v?form.trackExpiry:false}))}
      {flag("track-expiry",t("wms.requires_expiry"),form.trackExpiry,v=>setForm({...form,trackExpiry:v,trackBatches:v?true:form.trackBatches}))}
      {flag("sensitive-handling",t("wms.sensitive_handling"),form.sensitiveHandling,v=>setForm({...form,sensitiveHandling:v}))}
      <Field id="handling-notes" label={t("wms.handling_notes_verified_instructions")}><Input id="handling-notes" maxLength={600} value={form.handlingNotes??""} onChange={e=>setForm({...form,handlingNotes:e.target.value||null})}/></Field>
      {flag("product-active",t("wms.active_product"),form.isActive,v=>setForm({...form,isActive:v}))}
    </>}
    {action.kind==="batch"&&<>
      <Field id="batch-code" label={t("wms.lot_number")}><Input id="batch-code" required maxLength={80} value={batch.code} onChange={e=>setBatch({...batch,code:e.target.value})}/></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field id="production-date" label={t("wms.production_date_if_known_d7b9319")}><Input id="production-date" type="date" min="1900-01-01" max="2199-12-31" value={batch.productionDate} onChange={e=>setBatch({...batch,productionDate:e.target.value})}/></Field><Field id="expiry-date" label={t("wms.expiry_date")}><Input id="expiry-date" type="date" required={product?.trackExpiry} min="1900-01-01" max="2199-12-31" value={batch.expiryDate} onChange={e=>setBatch({...batch,expiryDate:e.target.value})}/></Field></div>
      {flag("batch-quarantine",t("wms.quarantined_lot"),batch.isQuarantined,v=>setBatch({...batch,isQuarantined:v}))}
      <p className="text-xs text-muted-foreground">{t("wms.creating_a_lot_does_not_add_stock_missing_dates_are_not_estimated_posted_lots_cann")}</p>
    </>}
    {action.kind==="opening"&&<>
      {product?.trackBatches&&(batches.isPending?<Skeleton className="h-12"/>:batches.isError?<ErrorBox error={batches.error} retry={()=>void batches.refetch()} t={t}/>:<><Field id="opening-batch" label={t("wms.lot")}><Choice id="opening-batch" value={opening.batchId} onChange={v=>setOpening({...opening,batchId:v})} options={batches.data.items.map(b=>({value:b.id,label:`${b.code} · ${b.expiryDate??t("wms.no_expiry")}`}))}/></Field><Pager page={batchPage} hasMore={batches.data.hasMore} busy={batches.isFetching} onChange={setBatchPage} t={t}/>{!batches.data.items.length&&<p className="text-sm">{t("wms.create_a_lot_for_this_product_first")}</p>}</>)}
      <div className="grid gap-3 sm:grid-cols-2"><Field id="opening-quantity" label={t("wms.counted_physical_quantity")}><Input id="opening-quantity" required inputMode="decimal" dir="ltr" maxLength={19} value={opening.quantity} onChange={e=>setOpening({...opening,quantity:e.target.value})}/></Field><Field id="opening-unit" label={t("wms.input_unit")}><Choice id="opening-unit" value={opening.unit} onChange={v=>setOpening({...opening,unit:v})} options={[{value:"BASE",label:unitLabel(product!.baseUnit,t)},...(product!.baseUnit==="PIECE"?[{value:"CARTON",label:`${t("wms.carton")} = ${product!.piecesPerCarton} ${unitLabel("PIECE",t)}`}]:[])]}/></Field></div>
      <Field id="opening-reference" label={t("wms.opening_count_document_reference")}><Input id="opening-reference" required maxLength={80} value={opening.reference} onChange={e=>setOpening({...opening,reference:e.target.value})}/></Field>
      <Field id="opening-reason" label={t("wms.reason_and_source")}><Input id="opening-reason" required minLength={3} maxLength={300} value={opening.reason} onChange={e=>setOpening({...opening,reason:e.target.value})}/></Field>
      {flag("opening-quarantine",t("wms.quantity_held_in_quarantine"),opening.quarantined,v=>setOpening({...opening,quarantined:v}))}
      <p className="text-xs text-muted-foreground">{t("wms.expired_or_quarantined_stock_remains_physical_but_unavailable_do_not_duplicate_ope")}</p>
    </>}
    {action.kind==="reverse"&&<><p className="text-sm">{t("wms.a_full_traceable_reversal_preserves_the_original_changed_or_reserved_stock_cannot_")}</p><Field id="reversal-reason" label={t("wms.reversal_reason")}><Input id="reversal-reason" required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></Field></>}
    {["opening","reverse"].includes(action.kind)&&flag("posting-confirmation",t("wms.i_reviewed_the_quantity_and_reference_and_confirm_posting"),confirmed,setConfirmed)}
    </fieldset>{invalid&&<p role="alert" className="text-sm text-destructive">{t("wms.check_required_fields_dates_and_posting_confirmation")}</p>}{mutation.isError&&<ErrorBox error={mutation.error} t={t}/>}
    <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("wms.cancel")}</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending?t("wms.saving"):title}</Button></DialogFooter></form></DialogContent></Dialog>;
}
