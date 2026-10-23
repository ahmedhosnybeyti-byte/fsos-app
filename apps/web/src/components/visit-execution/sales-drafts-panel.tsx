"use client";
import { ProductCategoryGroups } from "@/components/products/product-category-groups";
import { useEffect,useRef,useState } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { SALES_DRAFT_PERMISSION,salesDraftSaveSchema,type SalesDraft,type SalesDraftProduct,type SalesDraftSave,type VisitExecution } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { salesDraftsApi } from "@/lib/api/sales-drafts";
import { SalesDraftCheckResults } from "./sales-draft-check-results";
import { SalesPriceRequestForm } from "./sales-price-exceptions-panel";

export function SalesDraftsPanel({visit}:{visit:VisitExecution}){
 const {user}=useAuth(),{t}=useTranslation(),client=useQueryClient();
 const allowed=user?.role.code==="SALES_REP"&&["sfa.access","visits.execute",SALES_DRAFT_PERMISSION].every(p=>user.permissions?.includes(p));
 const scope=["sales-drafts",user?.companyId,user?.id,visit.id];
 const [page,setPage]=useState(1),[selected,setSelected]=useState<string|null>(null),[dirty,setDirty]=useState(false),[reset,setReset]=useState(0);
 const [notice,setNotice]=useState<"DRAFT"|"CANCELLED"|null>(null);
 const createKey=useRef("");
 const list=useQuery({queryKey:[...scope,"list",page],queryFn:()=>salesDraftsApi.list(visit.id,page),enabled:!!allowed,retry:false,refetchOnWindowFocus:false});
 useEffect(()=>{if(!selected&&list.data?.items[0])setSelected(list.data.items[0].id)},[selected,list.data]);
 const detail=useQuery({queryKey:[...scope,"detail",selected],queryFn:()=>salesDraftsApi.read(visit.id,selected!),enabled:!!allowed&&!!selected,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
 const create=useMutation({mutationFn:()=>{if(!createKey.current)createKey.current=crypto.randomUUID();return salesDraftsApi.create(visit.id,createKey.current)},onSuccess:async d=>{
   createKey.current="";setNotice(null);setSelected(d.id);client.setQueryData([...scope,"detail",d.id],d);await client.invalidateQueries({queryKey:[...scope,"list"]});
 }});
 const saved=async(d:SalesDraft)=>{setDirty(false);setNotice(d.status);client.setQueryData([...scope,"detail",d.id],d);await client.invalidateQueries({queryKey:[...scope,"list"]});await client.invalidateQueries({queryKey:[...scope,"detail",d.id]});};
 return <Card><CardHeader><CardTitle>{t("draft.title")}</CardTitle></CardHeader><CardContent className="space-y-4">
  <p className="text-sm text-muted-foreground">{t("draft.boundary")}</p>
  {notice&&<p role="status" className="text-sm text-success">{t(notice==="CANCELLED"?"draft.CANCELLED":"draft.saved")}</p>}
  {!allowed?<p className="text-sm text-muted-foreground">{t("draft.denied")}</p>:<>
   {visit.status==="COMPLETED"&&<p role="status" className="text-sm text-muted-foreground">{t("draft.closed")}</p>}
   {visit.status==="OPEN"&&<Button disabled={dirty||create.isPending||list.isLoading} onClick={()=>create.mutate()}>{t(create.isPending?"draft.loading":"draft.create")}</Button>}
   {(list.isError||create.isError)&&<div role="alert" className="space-y-2 text-sm text-destructive"><p>{t("draft.error")}</p>{list.isError&&<Button variant="outline" onClick={()=>list.refetch()}>{t("draft.retry")}</Button>}</div>}
   {list.isLoading?<Skeleton className="h-20"/>:list.data?.items.length?<div className="flex flex-wrap gap-2">{list.data.items.map(d=><Button key={d.id} variant={selected===d.id?"secondary":"outline"} disabled={dirty||create.isPending} aria-pressed={selected===d.id} onClick={()=>setSelected(d.id)}>{t("draft.open")} · {d.id.slice(0,8)} · {t(`draft.${d.status}`)}</Button>)}</div>:list.data&&<p className="text-sm text-muted-foreground">{t("draft.empty")}</p>}
   {(page>1||list.data?.hasMore)&&<div className="flex gap-2"><Button variant="outline" disabled={page===1||dirty} onClick={()=>setPage(p=>p-1)}>{t("draft.previous")}</Button><Button variant="outline" disabled={!list.data?.hasMore||dirty} onClick={()=>setPage(p=>p+1)}>{t("draft.next")}</Button></div>}
   {selected&&detail.isLoading&&<Skeleton className="h-64"/>}
   {selected&&detail.isError&&<div className="space-y-2"><p role="alert" className="text-sm text-destructive">{t("draft.error")}</p><Button variant="outline" onClick={()=>detail.refetch()}>{t("draft.retry")}</Button></div>}
   {detail.data&&<SalesDraftEditor key={`${detail.data.id}:${detail.data.version}:${reset}`} draft={detail.data} visitClosed={visit.status!=="OPEN"} scope={scope} onDirty={setDirty} onSaved={saved} onReload={async()=>{const r=await detail.refetch();if(r.isSuccess){setDirty(false);setReset(p=>p+1)}}}/>}
  </>}
 </CardContent></Card>;
}

type Line=SalesDraftSave["lines"][number]&{productCode:string;productName:string;baseUnit:string;category?:string|null};
export function SalesDraftEditor({draft,visitClosed,scope,onDirty,onSaved,onReload}:{draft:SalesDraft;visitClosed:boolean;scope:(string|null|undefined)[];onDirty:(dirty:boolean)=>void;onSaved:(d:SalesDraft)=>unknown;onReload:()=>unknown}){
 const {t,locale}=useTranslation();
 const [lines,setLines]=useState<Line[]>(draft.lines.map(l=>({...l}))),[warehouse,setWarehouse]=useState(draft.warehouseId),[notes,setNotes]=useState(draft.notes);
 const [invalid,setInvalid]=useState(false),[cancelConfirm,setCancelConfirm]=useState(false);
 const [productInput,setProductInput]=useState(""),[productSearch,setProductSearch]=useState(""),[productPage,setProductPage]=useState(1);
 const [warehouseInput,setWarehouseInput]=useState(""),[warehouseSearch,setWarehouseSearch]=useState(""),[warehousePage,setWarehousePage]=useState(1);
 const command=useRef<{signature:string;key:string}|null>(null),cancelKey=useRef("");
 const body={warehouseId:warehouse,notes,lines:lines.map(({productId,quantity,unit})=>({productId,quantity,unit}))};
 const initial={warehouseId:draft.warehouseId,notes:draft.notes,lines:draft.lines.map(({productId,quantity,unit})=>({productId,quantity,unit}))};
 const dirty=JSON.stringify(body)!==JSON.stringify(initial),editable=draft.editable&&!visitClosed;
 useEffect(()=>{onDirty(dirty);if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler)},[dirty,onDirty]);
 const warehouses=useQuery({queryKey:[...scope,"warehouses",warehouseSearch,warehousePage],queryFn:()=>salesDraftsApi.warehouses(draft.visitId,warehousePage,warehouseSearch),enabled:editable,retry:false,refetchOnWindowFocus:false});
 const products=useQuery({queryKey:[...scope,"products",warehouse,productSearch,productPage],queryFn:()=>salesDraftsApi.products(draft.visitId,warehouse!,productPage,productSearch),enabled:editable&&!!warehouse,retry:false,refetchOnWindowFocus:false});
 const save=useMutation({mutationFn:(b:SalesDraftSave)=>salesDraftsApi.save(draft.visitId,draft.id,b),onSuccess:onSaved});
 const cancel=useMutation({mutationFn:()=>{if(!cancelKey.current)cancelKey.current=crypto.randomUUID();return salesDraftsApi.cancel(draft.visitId,draft.id,draft.version,cancelKey.current)},onSuccess:onSaved});
 const check=useMutation({mutationFn:()=>salesDraftsApi.check(draft.visitId,draft.id)});
 const busy=save.isPending||cancel.isPending;
 function submit(){const signature=JSON.stringify({...body,version:draft.version});if(command.current?.signature!==signature)command.current={signature,key:crypto.randomUUID()};const p=salesDraftSaveSchema.safeParse({...body,version:draft.version,commandKey:command.current.key});setInvalid(!p.success);if(p.success)save.mutate(p.data)}
 function add(p:SalesDraftProduct){if(lines.length<20&&!lines.some(l=>l.productId===p.id))setLines([...lines,{productId:p.id,productCode:p.code,productName:p.name,category:p.category,baseUnit:p.baseUnit,quantity:"1",unit:"BASE"}]);}
 return <div className="space-y-4 border-t border-border/60 pt-4">
  <div className="flex flex-wrap items-center gap-3"><Badge>{t(`draft.${draft.status}`)}</Badge><p className="min-w-0 break-all text-xs text-muted-foreground">{t("draft.id")}: {draft.id}</p></div>
  <p className="text-sm font-semibold">{draft.customerName} · {draft.customerCode} · {draft.repName}</p>
  <div className="rounded-md border border-border/60 p-3 text-sm"><p>{t("draft.price")}: {t("draft.unavailable")}</p><p className="mt-1 text-xs text-muted-foreground">{t("draft.priceHint")}</p><p className="mt-2 text-xs text-muted-foreground">{t("draft.taxCredit")}</p></div>
  <fieldset disabled={!editable||busy} className="space-y-4">
   <div className="space-y-2"><Label htmlFor="draft-warehouse">{t("draft.warehouse")}</Label>
    {editable?<><div className="flex gap-2"><Input aria-label={t("draft.warehouseSearch")} value={warehouseInput} onChange={e=>setWarehouseInput(e.target.value)}/><Button variant="outline" onClick={()=>{setWarehouseSearch(warehouseInput);setWarehousePage(1)}}>{t("draft.warehouseSearch")}</Button></div>
     <Select dir={locale==="ar"?"rtl":"ltr"} value={warehouse??""} onValueChange={v=>{setWarehouse(v);setProductPage(1);check.reset()}}><SelectTrigger id="draft-warehouse"><SelectValue placeholder={t("draft.chooseWarehouse")}/></SelectTrigger><SelectContent>{warehouse&& !warehouses.data?.items.some(w=>w.id===warehouse)&&<SelectItem value={warehouse}>{draft.warehouseName??warehouse}</SelectItem>}{warehouses.data?.items.map(w=><SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>
     {warehouses.isLoading&&<Skeleton className="h-10"/>}{warehouses.isError&&<p role="alert" className="text-sm text-destructive">{t("draft.error")}</p>}{warehouses.data&&!warehouses.data.items.length&&<p className="text-sm text-muted-foreground">{t("draft.noWarehouses")}</p>}
     {(warehousePage>1||warehouses.data?.hasMore)&&<div className="flex gap-2"><Button variant="outline" disabled={warehousePage===1} onClick={()=>setWarehousePage(p=>p-1)}>{t("draft.previous")}</Button><Button variant="outline" disabled={!warehouses.data?.hasMore} onClick={()=>setWarehousePage(p=>p+1)}>{t("draft.next")}</Button></div>}
    </>:<p>{draft.warehouseName??t("draft.chooseWarehouse")}</p>}
   </div>
   {editable&&warehouse&&<div className="space-y-3"><div className="flex gap-2"><Input aria-label={t("draft.productSearch")} value={productInput} onChange={e=>setProductInput(e.target.value)}/><Button variant="outline" onClick={()=>{setProductSearch(productInput);setProductPage(1)}}>{t("draft.productSearch")}</Button></div>
    {products.isLoading&&<Skeleton className="h-24"/>}{products.isError&&<div><p role="alert" className="text-sm text-destructive">{t("draft.error")}</p><Button variant="outline" onClick={()=>products.refetch()}>{t("draft.retry")}</Button></div>}
    {products.data&&!products.data.items.length&&<p className="text-sm text-muted-foreground">{t("draft.noProducts")}</p>}
    <ProductCategoryGroups items={products.data?.items} search={productSearch} contentClassName="grid gap-2 sm:grid-cols-2" renderItem={p=><div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 p-3"><p className="min-w-0 break-words text-sm">{p.name} <span className="text-xs text-muted-foreground">{p.code}</span></p><Button variant="outline" disabled={lines.length>=20||lines.some(l=>l.productId===p.id)} aria-label={`${t("draft.add")} ${p.name}`} onClick={()=>add(p)}>{t("draft.add")}</Button></div>}/>
    {(productPage>1||products.data?.hasMore)&&<div className="flex gap-2"><Button variant="outline" disabled={productPage===1} onClick={()=>setProductPage(p=>p-1)}>{t("draft.previous")}</Button><Button variant="outline" disabled={!products.data?.hasMore} onClick={()=>setProductPage(p=>p+1)}>{t("draft.next")}</Button></div>}
   </div>}
   <div className="space-y-3"><h3 className="font-semibold">{t("draft.lines")} ({lines.length}/20)</h3><p className="text-xs text-muted-foreground">{t("draft.limit")}</p>{!lines.length&&<p className="text-sm text-muted-foreground">{t("draft.noLines")}</p>}
    {<ProductCategoryGroups items={lines}  renderItem={(l,i)=><div key={l.productId} className="space-y-3 rounded-md border border-border/60 p-3"><p className="break-words text-sm font-semibold">{l.productName} · {l.productCode}</p><div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1"><Label htmlFor={`draft-quantity-${i}`}>{t("draft.quantity")}</Label><Input id={`draft-quantity-${i}`} inputMode="decimal" dir="ltr" maxLength={25} value={l.quantity} onChange={e=>setLines(lines.map((x,n)=>n===i?{...x,quantity:e.target.value}:x))}/></div><div className="space-y-1"><Label htmlFor={`draft-unit-${i}`}>{t("draft.unit")}</Label><Select dir={locale==="ar"?"rtl":"ltr"} value={l.unit} onValueChange={unit=>setLines(lines.map((x,n)=>n===i?{...x,unit:unit as Line["unit"]}:x))}><SelectTrigger id={`draft-unit-${i}`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="BASE">{t("draft.BASE")} ({["PIECE","KG","LITRE"].includes(l.baseUnit)?t(`draft.${l.baseUnit as "PIECE"|"KG"|"LITRE"}`):l.baseUnit})</SelectItem>{l.baseUnit==="PIECE"&&<SelectItem value="CARTON">{t("draft.CARTON")}</SelectItem>}</SelectContent></Select></div>{editable&&<Button variant="ghost" className="self-end" onClick={()=>setLines(lines.filter((_,n)=>n!==i))}>{t("draft.remove")}</Button>}</div>
     {!dirty&&draft.lines[i]&&<p className="text-xs text-muted-foreground">{t("draft.baseQuantity")}: {draft.lines[i].quantityBase} ({["PIECE","KG","LITRE"].includes(l.baseUnit)?t(`draft.${l.baseUnit as "PIECE"|"KG"|"LITRE"}`):l.baseUnit}) · {t("draft.factor")}: {draft.lines[i].conversionFactor}</p>}
    </div>}/>}
   </div>
   <div className="space-y-2"><Label htmlFor="draft-notes">{t("draft.notes")}</Label><Input id="draft-notes" value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)}/></div>
  </fieldset>
  {dirty&&<p role="status" className="text-sm text-warning">{t("draft.dirty")}</p>}{invalid&&<p role="alert" className="text-sm text-destructive">{t("draft.invalid")}</p>}
  {(save.isError||cancel.isError)&&<p role="alert" className="text-sm text-destructive">{t("draft.error")}</p>}
  <div className="flex flex-wrap gap-2">{editable&&<><Button disabled={busy} onClick={submit}>{t(save.isPending?"draft.loading":"draft.save")}</Button><Button variant="outline" disabled={busy} onClick={()=>setCancelConfirm(true)}>{t("draft.cancel")}</Button></>}<Button variant="outline" disabled={busy} onClick={()=>onReload()}>{t("draft.reload")}</Button></div>
  {editable&&cancelConfirm&&<div className="space-y-3 rounded-md border border-border/60 p-3"><p>{t("draft.cancelAsk")}</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={busy} onClick={()=>cancel.mutate()}>{t("draft.confirmCancel")}</Button><Button variant="outline" disabled={busy} onClick={()=>setCancelConfirm(false)}>{t("draft.keep")}</Button></div></div>}
  <div className="space-y-3 border-t border-border/60 pt-4"><p className="text-xs text-muted-foreground">{t("draft.checkHint")}</p><Button variant="outline" disabled={dirty||busy||check.isPending||!draft.lines.length} onClick={()=>check.mutate()}>{t(check.isPending?"draft.loading":"draft.check")}</Button>
   {check.isError&&<p role="alert" className="text-sm text-destructive">{t("draft.checkError")}</p>}
   {check.data&&!dirty&&<SalesDraftCheckResults draft={draft} check={check.data}/>}
  </div>
  <SalesPriceRequestForm draft={draft} dirty={dirty}/>
 </div>;
}


