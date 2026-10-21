import type { WmsPage, WmsQuarantineCandidate, WmsQuarantineDocument, WmsQuarantineEvent, WmsQuarantineHoldInput, WmsQuarantineStepInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
const path=(w:string)=>`/sfa/wms/warehouses/${encodeURIComponent(w)}/quarantines`;
export const wmsQuarantineApi={
 candidates:(w:string,page:number,search:string)=>apiFetch<WmsPage<WmsQuarantineCandidate>>(`${path(w)}/candidates`,{query:{page,search}}),
 list:(w:string,page:number)=>apiFetch<WmsPage<WmsQuarantineDocument>>(path(w),{query:{page}}),
 detail:(w:string,id:string)=>apiFetch<WmsQuarantineDocument>(`${path(w)}/${encodeURIComponent(id)}`),
 events:(w:string,id:string,page:number)=>apiFetch<WmsPage<WmsQuarantineEvent>>(`${path(w)}/${encodeURIComponent(id)}/events`,{query:{page}}),
 hold:(w:string,body:WmsQuarantineHoldInput)=>apiFetch<{id:string}>(path(w),{method:"POST",body}),
 step:(w:string,id:string,operation:"release"|"write-off",body:WmsQuarantineStepInput)=>apiFetch(`${path(w)}/${encodeURIComponent(id)}/${operation}`,{method:"POST",body}),
};
