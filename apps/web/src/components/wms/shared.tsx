"use client";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "@/components/translation-provider";
import { cartonAndPieceParts,cartonQuantity } from "./carton-quantity";
export function stockQuantity(value:string,factor:number|undefined,baseUnit:string,t:Text) {
  if(baseUnit!=="PIECE")return "—";
  const parts=cartonAndPieceParts(value,factor);
  if(!parts)return `${cartonQuantity(value,factor)} ${t("wms.carton")}`;
  if(parts.cartons==="0")return `${parts.pieces} ${t("wms.piece")}`;
  if(parts.pieces==="0")return `${parts.cartons} ${t("wms.carton")}`;
  return `${parts.cartons} ${t("wms.carton")} + ${parts.pieces} ${t("wms.piece")}`;
}
export function inputQuantity(value:string,unit:string,factor:number|undefined,baseUnit:string,t:Text) { return unit==="CARTON"?`${quantity(value)} ${t("wms.carton")}`:stockQuantity(value,factor,baseUnit,t); }
export type Text = (key: TranslationKey, params?: Record<string, string | number>) => string;
export function unitLabel(unit:string,t:Text) { return unit==="PIECE"?t("wms.piece"):unit==="KG"?t("wms.kg"):t("wms.litre"); }
export function quantity(value:string = "0") { return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1"); }
export function Field({id,label,children}:{id:string;label:string;children:ReactNode}) { return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>; }
export function Choice({id,value,onChange,options,disabled=false}:{id:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];disabled?:boolean}) {
  const {locale}=useTranslation();
  return <Select dir={locale==="ar"?"rtl":"ltr"} value={value||undefined} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>;
}
export function Pager({page,hasMore,busy,onChange,t}:{page:number;hasMore:boolean;busy:boolean;onChange:(v:number)=>void;t:Text}) {
  return <div className="mt-4 flex items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={busy||page<=1} onClick={()=>onChange(page-1)}>{t("wms.previous")}</Button><span className="text-xs text-muted-foreground">{t("wms.page")} {page}</span><Button type="button" variant="outline" size="sm" disabled={busy||!hasMore||page>=1000} onClick={()=>onChange(page+1)}>{t("wms.next")}</Button></div>;
}
export function Search({id,value,onChange,onSearch,t,embedded=false}:{id:string;value:string;onChange:(v:string)=>void;onSearch:()=>void;t:Text;embedded?:boolean}) {
  if(embedded)return <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Label htmlFor={id}>{t("wms.search_name_or_code")}</Label><Input id={id} maxLength={80} value={value} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();onSearch();}}}/></div><Button type="button" variant="outline" onClick={onSearch}>{t("wms.search")}</Button></div>;
  return <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();onSearch();}}><div className="min-w-0 flex-1"><Label htmlFor={id}>{t("wms.search_name_or_code")}</Label><Input id={id} maxLength={80} value={value} onChange={e=>onChange(e.target.value)} /></div><Button type="submit" variant="outline">{t("wms.search")}</Button></form>;
}
export function ErrorBox({error,retry,t}:{error?:unknown;retry?:()=>void;t:Text}) {
  const code=error instanceof ApiError?error.message:"";
  const message:Record<string,TranslationKey>={
    WMS_PROCUREMENT_SEPARATE_APPROVER:"procurement.separate",
    WMS_PROCUREMENT_EXCEEDS_REMAINING:"procurement.over",
    WMS_PROCUREMENT_ALREADY_CONVERTED:"procurement.converted",
    WMS_HELD_OWNERSHIP:"wms.this_quantity_belongs_to_a_quarantine_document_resolve_it_through_its_original_doc",
    WMS_QUARANTINE_EXCEEDS_REMAINING:"wms.quantity_exceeds_the_quarantine_document_remainder_refresh_and_review_the_quantity",
    WMS_QUARANTINE_RELEASE_BLOCKED:"wms.release_is_blocked_by_quality_expiry_or_inactive_product_state",
    WMS_COUNT_STALE:"wms.lot_stock_or_state_changed_after_counting_cancel_the_draft_and_recount_using_refre",
    WMS_COUNT_COMMITTED_STOCK:"wms.count_is_below_reserved_plus_quarantined_stock_review_count_reservations_and_quali",
    WMS_RETURN_EXCEEDS_SOURCE:"wms.return_exceeds_the_source_quantity_remaining_after_earlier_returns",
    WMS_CUSTODY_INSUFFICIENT:"wms.remaining_accepted_custody_is_insufficient_for_this_return",
    WMS_PROPOSAL_REQUIRED:"wms.record_the_loading_proposal_and_source_unit_first",
    WMS_PROPOSAL_ALREADY_CONVERTED:"wms.this_proposal_already_has_a_loading_request_review_the_existing_request",
    WMS_PROPOSAL_CONFLICT:"wms.content_and_date_already_exist_with_different_units_or_warehouse_review_the_origin",
    WMS_EXPIRED_MUST_BE_QUARANTINED:"wms.expired_goods_cannot_enter_available_stock_explicitly_quarantine_or_reject_them",
    WMS_RECEIPT_HAS_RETURNS:"wms.a_receipt_with_a_posted_supplier_return_cannot_be_reversed",
    WMS_DOCUMENT_STALE:"wms.document_changed_concurrently_refresh_it_and_reopen_the_action",
    WMS_INVALID_TRANSITION:"wms.document_status_or_recipient_identity_does_not_allow_this_action",
    WMS_INSUFFICIENT_STOCK:"wms.insufficient_eligible_stock_review_lots_reservations_and_shelf_life_policy",
    WMS_QUALITY_OR_STOCK_BLOCKED:"wms.lot_fails_expiry_quality_or_stock_requirements_these_rules_cannot_be_overridden",
    WMS_ALLOCATION_LIMIT:"wms.request_requires_more_than_100_lots_split_it_into_smaller_requests",
    WMS_BATCH_METADATA_CONFLICT:"wms.lot_metadata_differs_from_its_recorded_values_check_its_code_and_dates",
    WMS_OVER_PICK:"wms.actual_pick_cannot_exceed_the_lot_reservation",
    WMS_DISCREPANCY_REASON_REQUIRED:"wms.enter_a_reason_for_the_picking_discrepancy",
    WMS_PRODUCT_MAPPING_REQUIRED:"wms.proposal_code_has_no_active_operational_product_mapping",
    WMS_OPENING_EXISTS:"wms.an_opening_is_already_posted_for_this_lot_review_its_movement_before_correcting",
    WMS_DUPLICATE_REFERENCE:"wms.code_barcode_or_movement_reference_already_exists",
    WMS_IDEMPOTENCY_CONFLICT:"wms.request_key_was_used_with_different_values_review_the_ledger_before_creating_a_new",
    WMS_PRODUCT_STALE:"wms.product_changed_concurrently_refresh_the_list_and_reopen_the_editor",
    WMS_PACKAGING_LOCKED:"wms.packaging_and_tracking_are_locked_once_lots_exist",
    WMS_FRACTIONAL_PIECE:"wms.converted_piece_quantity_must_be_a_whole_number",
    WMS_ALREADY_REVERSED:"wms.this_movement_is_already_reversed",
    WMS_REVERSAL_STOCK_CHANGED:"wms.cannot_reverse_changed_or_reserved_stock_a_later_approved_correction_workflow_is_r",
    WMS_EXPIRY_REQUIRED:"wms.this_product_requires_an_expiry_date",
    WMS_FUTURE_PRODUCTION:"wms.cannot_post_stock_with_a_future_production_date",
  };
  return <div role="alert" className="space-y-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive"><p>{message[code]?t(message[code]):error instanceof ApiError&&[403,404].includes(error.status)?t("wms.warehouse_access_is_unavailable_check_mode_permissions_and_assignments"):t("wms.request_could_not_complete_check_input_and_connection_review_the_ledger_before_rep")}</p>{retry&&<Button variant="outline" size="sm" onClick={retry}>{t("wms.retry")}</Button>}</div>;
}

export function HandlingNote({sensitive,note,t}:{sensitive?:boolean;note?:string|null;t:Text}){return sensitive||note?<p className="break-words text-xs text-warning">{t("wms.sensitive_handling")}{note?": "+note:""}</p>:null;}
