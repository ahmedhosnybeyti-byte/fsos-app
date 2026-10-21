import type {ProcurementCommand,ProcurementDetail,ProcurementDocument,ProcurementSummary,ProcurementSupplier,WmsPage} from "@field-sales-os/schemas";
import {apiFetch} from "../api-client";
const base=(w:string)=>`/sfa/procurement/warehouses/${encodeURIComponent(w)}`;
export const procurementApi={
 summary:(w:string)=>apiFetch<ProcurementSummary>(base(w)+"/summary"),
 list:(w:string,page:number,search:string,kind:string)=>apiFetch<WmsPage<ProcurementDocument>>(base(w)+"/requests",{query:{page,search,kind}}),
 detail:(w:string,id:string)=>apiFetch<ProcurementDetail>(base(w)+"/requests/"+encodeURIComponent(id)),
 suppliers:(w:string,page:number,search:string)=>apiFetch<WmsPage<ProcurementSupplier>>(base(w)+"/suppliers",{query:{page,search}}),
 command:(w:string,body:ProcurementCommand)=>apiFetch<{id:string;requestId:string}>(base(w)+"/commands",{method:"POST",body}),
};
