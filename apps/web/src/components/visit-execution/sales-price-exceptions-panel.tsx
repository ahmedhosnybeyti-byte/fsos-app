"use client";
import Link from "next/link";
import {useRef,useState} from "react";
import {useMutation,useQuery} from "@tanstack/react-query";
import {PRICE_EXCEPTION_PERMISSIONS as P,priceExceptionCreateSchema,priceExceptionDecisionSchema,type PriceExceptionRequest,type SalesDraft} from "@field-sales-os/schemas";
import {useAuth} from "@/hooks/use-auth";
import {useTranslation} from "@/components/translation-provider";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card,CardHeader,CardTitle,CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {Skeleton} from "@/components/ui/skeleton";
import {priceExceptionsApi as api} from "@/lib/api/sales-price-exceptions";

function usePriceAuthority(){const {user}=useAuth();const role=user?.role.code;const p=role==="SALES_REP"?P.request:role==="SUPERVISOR"?P.review:role==="MANAGER"?P.approve:role==="ACCOUNTANT"?P.accounting:null;
 return {user,role,allowed:!!p&&["sfa.access",p,...(role==="ACCOUNTANT"?["accounting.read"]:role==="SALES_REP"?["visits.execute","sales.drafts.manage"]:[])].every(x=>user?.permissions?.includes(x))};}

export function SalesPriceRequestForm({draft,dirty}:{draft:SalesDraft;dirty:boolean}){
 const {allowed,role}=usePriceAuthority(),{t,locale}=useTranslation();
 const [productId,setProduct]=useState(draft.lines[0]?.productId??""),[kind,setKind]=useState<"SPECIAL_PRICE"|"DISCOUNT_PERCENT">("SPECIAL_PRICE"),[value,setValue]=useState(""),[currency,setCurrency]=useState(""),[reason,setReason]=useState("");
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[evidenceType,setType]=useState("EMAIL"),[reference,setReference]=useState(""),[invalid,setInvalid]=useState(false);
 const command=useRef<{signature:string;key:string}|null>(null);
 const create=useMutation({mutationFn:api.create});
 if(!allowed||role!=="SALES_REP")return null;
 function submit(){const b={draftId:draft.id,draftVersion:draft.version,productId,kind,value,currency:kind==="SPECIAL_PRICE"?currency:null,reason,desiredFrom:from,desiredTo:to||null,evidenceType,evidenceReference:reference};const signature=JSON.stringify(b);if(command.current?.signature!==signature)command.current={signature,key:crypto.randomUUID()};const p=priceExceptionCreateSchema.safeParse({...b,commandKey:command.current.key});setInvalid(!p.success);if(p.success)create.mutate(p.data);}
 const text=(id:string,label:"value"|"currency"|"reason"|"from"|"to"|"reference",v:string,set:(s:string)=>void,type="text")=><div className="space-y-1"><Label htmlFor={id}>{t(`price.${label}`)}</Label><Input id={id} type={type} value={v} onChange={e=>set(e.target.value)} maxLength={label==="reason"||label==="reference"?1000:25}/></div>;
 return <div className="space-y-3 border-t border-border/60 pt-4"><h3 className="font-semibold">{t("price.requestTitle")}</h3><p className="text-sm text-muted-foreground">{t("price.boundary")}</p>
  <Link className="text-sm text-primary underline" href="/dashboard/sales-price-exceptions">{t("price.queueLink")}</Link>
  {create.data?<div role="status" className="space-y-2"><p>{t("price.created")} · {create.data.id}</p><Button variant="outline" onClick={()=>{create.reset();command.current=null}}>{t("price.another")}</Button></div>:<>
   <fieldset disabled={dirty||draft.status!=="DRAFT"||!draft.lines.length||create.isPending} className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-1"><Label htmlFor="price-product">{t("draft.product")}</Label><Select dir={locale==="ar"?"rtl":"ltr"} value={productId} onValueChange={setProduct}><SelectTrigger id="price-product"><SelectValue/></SelectTrigger><SelectContent>{draft.lines.map(l=><SelectItem key={l.productId} value={l.productId}>{l.productName} · {t(`draft.${l.unit}`)}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1"><Label htmlFor="price-kind">{t("price.kind")}</Label><Select dir={locale==="ar"?"rtl":"ltr"} value={kind} onValueChange={v=>setKind(v as typeof kind)}><SelectTrigger id="price-kind"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="SPECIAL_PRICE">{t("price.SPECIAL_PRICE")}</SelectItem><SelectItem value="DISCOUNT_PERCENT">{t("price.DISCOUNT_PERCENT")}</SelectItem></SelectContent></Select></div>
    {text("price-value","value",value,setValue)}{kind==="SPECIAL_PRICE"&&text("price-currency","currency",currency,setCurrency)}
    {text("price-from","from",from,setFrom,"date")}{text("price-to","to",to,setTo,"date")}{text("price-reason","reason",reason,setReason)}
    <EvidenceFields value={evidenceType} onChange={setType} reference={reference} setReference={setReference} prefix="price-create"/>
    <Button onClick={submit}>{t(create.isPending?"draft.loading":"price.submit")}</Button>
   </fieldset>
   {dirty&&<p className="text-sm text-warning">{t("price.saveFirst")}</p>}
   {invalid&&<p role="alert" className="text-sm text-destructive">{t("price.invalid")}</p>}{create.isError&&<p role="alert" className="text-sm text-destructive">{t("price.error")}</p>}
  </>}
 </div>;
}

function EvidenceFields({value,onChange,reference,setReference,prefix}:{value:string;onChange:(s:string)=>void;reference:string;setReference:(s:string)=>void;prefix:string}){
 const {t,locale}=useTranslation();return <><div className="space-y-1"><Label htmlFor={`${prefix}-type`}>{t("price.evidenceType")}</Label><Select dir={locale==="ar"?"rtl":"ltr"} value={value} onValueChange={onChange}><SelectTrigger id={`${prefix}-type`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="EMAIL">{t("price.EMAIL")}</SelectItem><SelectItem value="COMPANY_APPROVED_MESSAGE">{t("price.COMPANY_APPROVED_MESSAGE")}</SelectItem></SelectContent></Select></div>
 <div className="space-y-1"><Label htmlFor={`${prefix}-reference`}>{t("price.reference")}</Label><Input id={`${prefix}-reference`} value={reference} onChange={e=>setReference(e.target.value)} maxLength={1000}/></div><p className="text-xs text-muted-foreground sm:col-span-2">{t("price.evidenceHint")}</p></>;
}

export function SalesPriceExceptionsScreen(){
 const {allowed,user,role}=usePriceAuthority(),{t}=useTranslation();const [cursors,setCursors]=useState<(string|undefined)[]>([undefined]),[selected,setSelected]=useState<string|null>(null),[reset,setReset]=useState(0),[decisionDirty,setDecisionDirty]=useState(false);
 const scope=["sales-price-exceptions",user?.companyId,user?.id];
 const list=useQuery({queryKey:[...scope,"list",cursors.at(-1)],queryFn:()=>api.list(cursors.at(-1)),enabled:allowed,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
 const detail=useQuery({queryKey:[...scope,"detail",selected],queryFn:()=>api.read(selected!),enabled:allowed&&!!selected,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false});
 return <div className="space-y-4"><h1 className="text-2xl font-bold">{t("price.queueTitle")}</h1><p className="text-sm text-muted-foreground">{t("price.boundary")}</p>
  <Card><CardHeader><CardTitle>{t("price.queueTitle")}</CardTitle></CardHeader><CardContent className="space-y-3">
   {!allowed?<p>{t("price.denied")}</p>:<>
    <Button variant="outline" disabled={decisionDirty||list.isFetching} onClick={()=>list.refetch()}>{t("draft.retry")}</Button>
    {list.isLoading&&<Skeleton className="h-24"/>}{list.isError&&<p role="alert" className="text-destructive">{t("price.error")}</p>}
    {list.data&&!list.data.items.length&&<p>{t("price.empty")}</p>}
    <div className="grid max-h-80 gap-3 overflow-y-auto sm:grid-cols-2">{list.data?.items.map(r=><Button key={r.id} variant={selected===r.id?"secondary":"outline"} disabled={decisionDirty} className="h-auto min-w-0 justify-start whitespace-normal text-start" onClick={()=>setSelected(r.id)}><span className="min-w-0 break-words">{r.customerName} · {r.productName} · {r.id.slice(0,8)} · <bdi dir="ltr">{r.value} {r.currency??"%"}</bdi> · {t(`price.${r.status}`)}</span></Button>)}</div>
    <div className="flex gap-2"><Button variant="outline" disabled={decisionDirty||cursors.length===1} onClick={()=>setCursors(x=>x.slice(0,-1))}>{t("draft.previous")}</Button><Button variant="outline" disabled={decisionDirty||!list.data?.nextCursor} onClick={()=>setCursors(x=>[...x,list.data!.nextCursor!])}>{t("draft.next")}</Button></div>
    {detail.isLoading&&<Skeleton className="h-32"/>}{detail.isError&&<p role="alert" className="text-destructive">{t("price.error")}</p>}
    {selected&&<Button variant="outline" disabled={detail.isFetching} onClick={async()=>{const r=await detail.refetch();if(r.isSuccess){setDecisionDirty(false);setReset(x=>x+1)}}}>{t("draft.reload")}</Button>}
    {detail.data&&<PriceRequestDetail key={`${detail.data.id}:${detail.data.version}:${reset}`} request={detail.data} role={role??""} onDirty={setDecisionDirty} onSaved={async()=>{setDecisionDirty(false);await detail.refetch();await list.refetch();}}/>}
   </>}
  </CardContent></Card>
 </div>;
}

export function PriceRequestDetail({request:r,role,onDirty,onSaved}:{request:PriceExceptionRequest;role:string;onDirty:(v:boolean)=>void;onSaved:()=>unknown}){
 const {t,locale}=useTranslation();const canReview=role==="SUPERVISOR"&&r.status==="SUBMITTED",canApprove=role==="MANAGER"&&r.status==="REVIEWED";
 const [reason,setReason]=useState(""),[reference,setReference]=useState(""),[evidenceType,setType]=useState("EMAIL"),[attested,setAttested]=useState(false),[invalid,setInvalid]=useState(false);
 const command=useRef<{signature:string;key:string}|null>(null);
 const save=useMutation({mutationFn:(b:Parameters<typeof api.decide>[2])=>api.decide(r.id,role,b),onSuccess:onSaved});
 function decide(decision:"FORWARD"|"APPROVE"|"REJECT"){const b={version:r.version,decision,reason,evidenceType,evidenceReference:reference,evidenceAttested:attested};const signature=JSON.stringify(b);if(command.current?.signature!==signature)command.current={signature,key:crypto.randomUUID()};const p=priceExceptionDecisionSchema.safeParse({...b,commandKey:command.current.key});setInvalid(!p.success);if(p.success)save.mutate(p.data);}
 return <div className="space-y-3 border-t border-border/60 pt-4">
  <p className="break-all text-xs">{r.id} · {t("price.version")}: {r.version}</p><Badge variant={r.status==="REJECTED"?"destructive":r.status==="APPROVED"?"success":"warning"}>{t(`price.${r.status}`)}</Badge>
  <p className="font-semibold">{r.customerName} · {r.customerCode} · {r.channel}</p><p>{r.productName} · {r.productCode} · {t(`draft.${r.unit}`)}</p>
  <p>{t(`price.${r.kind}`)}: <bdi dir="ltr">{r.value} {r.currency??"%"}</bdi></p><p>{t("price.beforeUnknown")}</p><p>{t("price.from")}: <bdi dir="ltr">{r.desiredFrom}</bdi> · {t("price.to")}: <bdi dir="ltr">{r.desiredTo??"—"}</bdi></p><p className="break-words">{r.reason}</p>
  <p className="text-sm text-warning">{t("price.activationBlocked")}</p>
  <h3 className="font-semibold">{t("price.history")}</h3>
  {r.events.map(e=><div key={e.version} className="space-y-1 rounded-md border border-border/60 p-3 text-sm"><p>{e.actorName} · {e.actorId} · {t(`price.${e.action as "REQUEST"|"FORWARD"|"APPROVE"|"REJECT"}`)} · {new Date(e.createdAt).toLocaleString(locale)}</p><p className="break-words">{e.reason}</p><p className="break-words">{t(`price.${e.evidenceType as "EMAIL"|"COMPANY_APPROVED_MESSAGE"}`)}: {e.evidenceReference}</p>{e.evidenceAttested&&<p>{t("price.attested")}</p>}</div>)}
  {(canReview||canApprove)&&<fieldset disabled={save.isPending} className="grid gap-3 sm:grid-cols-2" onChange={()=>onDirty(true)}>
   <div className="space-y-1"><Label htmlFor="price-decision-reason">{t("price.decisionReason")}</Label><Input id="price-decision-reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></div>
   <EvidenceFields value={evidenceType} onChange={v=>{setType(v);onDirty(true)}} reference={reference} setReference={setReference} prefix="price-decision"/>
   <Label className="flex items-start gap-2 text-sm sm:col-span-2"><input className="mt-1 h-5 w-5 accent-primary" type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>{t("price.attestation")}</Label>
   <Button disabled={!attested||save.isPending} onClick={()=>decide(canReview?"FORWARD":"APPROVE")}>{t(save.isPending?"draft.loading":canReview?"price.forward":"price.approve")}</Button>{canApprove&&<Button variant="destructive" disabled={!attested||save.isPending} onClick={()=>decide("REJECT")}>{t("price.reject")}</Button>}
  </fieldset>}
  {invalid&&<p role="alert" className="text-sm text-destructive">{t("price.invalid")}</p>}{save.isError&&<p role="alert" className="text-sm text-destructive">{t("price.error")}</p>}
 </div>;
}
