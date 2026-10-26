import type {PriceExceptionCreate,PriceExceptionDecision,PriceExceptionRequest} from "@field-sales-os/schemas";
import {apiFetch} from "../api-client";
const base="/sfa/sales-price-exceptions";
export const priceExceptionsApi={
 list:(cursor?:string)=>apiFetch<{items:PriceExceptionRequest[];nextCursor:string|null}>(base,{query:{cursor}}),
 read:(id:string)=>apiFetch<PriceExceptionRequest>(`${base}/${encodeURIComponent(id)}`),
 create:(body:PriceExceptionCreate)=>apiFetch<PriceExceptionRequest>(base,{method:"POST",body}),
 decide:(id:string,role:string,body:PriceExceptionDecision)=>apiFetch<PriceExceptionRequest>(`${base}/${encodeURIComponent(id)}/${role==="SUPERVISOR"?"review":"decision"}`,{method:"POST",body}),
};
