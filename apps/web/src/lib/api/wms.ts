import type { WmsAccessUser, WmsBatch, WmsBatchInput, WmsMovement, WmsOpeningInput, WmsPage, WmsProduct, WmsProductInput, WmsReversalInput, WmsSummary, WmsWarehouse } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
const path=(warehouse:string)=>`/sfa/wms/warehouses/${encodeURIComponent(warehouse)}`;
export const wmsApi={
  warehouses:(page:number,search:string)=>apiFetch<WmsPage<WmsWarehouse>>("/sfa/wms/warehouses",{query:{page,search}}),
  summary:(w:string,horizon:number)=>apiFetch<WmsSummary>(`${path(w)}/summary`,{query:{horizon}}),
  products:(w:string,page:number,search:string)=>apiFetch<WmsPage<WmsProduct>>(`${path(w)}/products`,{query:{page,search}}),
  batches:(w:string,page:number,productId?:string,nearExpiry=false,horizon=30)=>apiFetch<WmsPage<WmsBatch>>(`${path(w)}/batches`,{query:{page,productId,nearExpiry:String(nearExpiry),horizon}}),
  movements:(w:string,page:number)=>apiFetch<WmsPage<WmsMovement>>(`${path(w)}/movements`,{query:{page}}),
  product:(w:string,body:WmsProductInput & {version?:number},id?:string)=>apiFetch<{id:string}>(`${path(w)}/products${id?`/${encodeURIComponent(id)}`:""}`,{method:id?"PATCH":"POST",body}),
  batch:(w:string,body:WmsBatchInput)=>apiFetch<{id:string}>(`${path(w)}/batches`,{method:"POST",body}),
  opening:(w:string,body:WmsOpeningInput)=>apiFetch<{id:string}>(`${path(w)}/openings`,{method:"POST",body}),
  reverse:(w:string,id:string,body:WmsReversalInput)=>apiFetch<{id:string}>(`${path(w)}/movements/${encodeURIComponent(id)}/reverse`,{method:"POST",body}),
  users:(w:string,page:number,search:string)=>apiFetch<WmsPage<WmsAccessUser>>(`${path(w)}/access`,{query:{page,search}}),
  access:(w:string,userId:string,granted:boolean)=>apiFetch(`${path(w)}/access`,{method:"POST",body:{userId,granted}}),
};
