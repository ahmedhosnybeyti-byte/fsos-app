"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
export type Text=(ar:string,en:string)=>string;
export function unitLabel(unit:string,t:Text) { return unit==="PIECE"?t("قطعة","piece"):unit==="KG"?t("كجم","kg"):t("لتر","litre"); }
export function quantity(value:string = "0") { return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1"); }
export function Field({id,label,children}:{id:string;label:string;children:ReactNode}) { return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>; }
export function Choice({id,value,onChange,options,disabled=false}:{id:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];disabled?:boolean}) {
  return <Select value={value||undefined} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
export function Pager({page,hasMore,busy,onChange,t}:{page:number;hasMore:boolean;busy:boolean;onChange:(v:number)=>void;t:Text}) {
  return <div className="mt-4 flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={busy||page<=1} onClick={()=>onChange(page-1)}>{t("السابق","Previous")}</Button><span className="text-xs text-muted-foreground">{t("صفحة","Page")} {page}</span><Button variant="outline" size="sm" disabled={busy||!hasMore||page>=1000} onClick={()=>onChange(page+1)}>{t("التالي","Next")}</Button></div>;
}
export function Search({id,value,onChange,onSearch,t}:{id:string;value:string;onChange:(v:string)=>void;onSearch:()=>void;t:Text}) {
  return <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();onSearch();}}><div className="min-w-0 flex-1"><Label htmlFor={id}>{t("بحث بالاسم أو الرمز","Search name or code")}</Label><Input id={id} maxLength={80} value={value} onChange={e=>onChange(e.target.value)} /></div><Button type="submit" variant="outline">{t("بحث","Search")}</Button></form>;
}
export function ErrorBox({error,retry,t}:{error?:unknown;retry?:()=>void;t:Text}) {
  const code=error instanceof ApiError?error.message:"";
  const message:Record<string,[string,string]>={
    WMS_OPENING_EXISTS:["يوجد رصيد افتتاحي مرحّل لهذه التشغيلة. راجع الحركة قبل أي تصحيح.","An opening is already posted for this lot. Review its movement before correcting."],
    WMS_DUPLICATE_REFERENCE:["الكود أو الباركود أو مرجع الحركة مستخدم بالفعل.","Code, barcode or movement reference already exists."],
    WMS_IDEMPOTENCY_CONFLICT:["تم استخدام مفتاح الطلب بقيم مختلفة. راجع سجل الحركات قبل إنشاء طلب جديد.","Request key was used with different values. Review the ledger before creating a new request."],
    WMS_PRODUCT_STALE:["تم تعديل الصنف بالتزامن. حدّث القائمة ثم افتح التعديل مجددًا.","Product changed concurrently. Refresh the list and reopen the editor."],
    WMS_PACKAGING_LOCKED:["لا يمكن تغيير التعبئة أو التتبع بعد إنشاء تشغيلات للصنف.","Packaging and tracking are locked once lots exist."],
    WMS_FRACTIONAL_PIECE:["الكمية بعد التحويل يجب أن تكون قطعًا كاملة.","Converted piece quantity must be a whole number."],
    WMS_ALREADY_REVERSED:["تم عكس هذه الحركة بالفعل.","This movement is already reversed."],
    WMS_REVERSAL_STOCK_CHANGED:["لا يمكن العكس لأن الرصيد تغير أو حُجز. يلزم إجراء تصحيح معتمد لاحقًا.","Cannot reverse changed or reserved stock. A later approved correction workflow is required."],
    WMS_EXPIRY_REQUIRED:["الصنف يتطلب تاريخ انتهاء.","This product requires an expiry date."],
    WMS_FUTURE_PRODUCTION:["لا يمكن ترحيل مخزون بتاريخ إنتاج مستقبلي.","Cannot post stock with a future production date."],
  };
  return <div role="alert" className="space-y-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive"><p>{message[code]?t(...message[code]):error instanceof ApiError&&[403,404].includes(error.status)?t("لا يتوفر الوصول إلى هذا المستودع. تحقق من الوضع والصلاحيات والنطاق.","Warehouse access is unavailable. Check mode, permissions and assignments."):t("تعذر إكمال الطلب. تحقق من المدخلات والاتصال؛ راجع سجل الحركات قبل إعادة الترحيل.","Request could not complete. Check input and connection; review the ledger before reposting.")}</p>{retry&&<Button variant="outline" size="sm" onClick={retry}>{t("إعادة المحاولة","Retry")}</Button>}</div>;
}
