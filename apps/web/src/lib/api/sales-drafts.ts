import type { SalesDraft,SalesDraftSave,SalesDraftProduct,SalesDraftCheck } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
const path=(visitId:string)=>`/sfa/visits/${encodeURIComponent(visitId)}/sales-drafts`;
export const salesDraftsApi={
  list:(v:string,page=1)=>apiFetch<{items:SalesDraft[];hasMore:boolean;page:number}>(`${path(v)}?page=${page}`),
  create:(v:string,commandKey:string)=>apiFetch<SalesDraft>(path(v),{method:"POST",body:{commandKey}}),
  read:(v:string,id:string)=>apiFetch<SalesDraft>(`${path(v)}/${encodeURIComponent(id)}`),
  save:(v:string,id:string,body:SalesDraftSave)=>apiFetch<SalesDraft>(`${path(v)}/${encodeURIComponent(id)}`,{method:"PATCH",body}),
  cancel:(v:string,id:string,version:number,commandKey:string)=>apiFetch<SalesDraft>(`${path(v)}/${encodeURIComponent(id)}/cancel`,{method:"POST",body:{version,commandKey}}),
  warehouses:(v:string,page:number,search:string)=>apiFetch<{items:{id:string;name:string}[];hasMore:boolean}>(`${path(v)}/warehouses?page=${page}&search=${encodeURIComponent(search)}`),
  products:(v:string,w:string,page:number,search:string)=>apiFetch<{items:SalesDraftProduct[];hasMore:boolean}>(`${path(v)}/warehouses/${encodeURIComponent(w)}/products?page=${page}&search=${encodeURIComponent(search)}`),
  check:(v:string,id:string)=>apiFetch<SalesDraftCheck>(`${path(v)}/${encodeURIComponent(id)}/check`),
};
