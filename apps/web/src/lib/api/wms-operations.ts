import type {WmsOperation,WmsPage,WmsReceipt,WmsLoad,WmsDocumentSummary,WmsFefoResult,WmsCustomerPolicy,WmsReturnKind,WmsReturnSource,WmsReturnSummary,WmsReturnDocument} from "@field-sales-os/schemas";
import {apiFetch} from "../api-client";
const base=(w:string)=>`/sfa/wms/warehouses/${encodeURIComponent(w)}`;
export const wmsOperationsApi={
  returnSources:(w:string,kind:WmsReturnKind,page:number,search:string)=>apiFetch<WmsPage<Omit<WmsReturnSource,"lines">>>(base(w)+"/return-sources/"+kind,{query:{page,search}}),
  returnSource:(w:string,kind:WmsReturnKind,id:string)=>apiFetch<WmsReturnSource>(base(w)+"/return-sources/"+kind+"/"+encodeURIComponent(id)),
  returns:(w:string,kind:WmsReturnKind,page:number,search:string)=>apiFetch<WmsPage<WmsReturnSummary>>(base(w)+"/returns/"+kind,{query:{page,search}}),
  returnDocument:(w:string,id:string)=>apiFetch<WmsReturnDocument>(base(w)+"/return-documents/"+encodeURIComponent(id)),
  custody:(w:string,page:number)=>apiFetch<WmsPage<{recipientId:string;recipientName:string;productName:string;batchCode:string;baseUnit:string;quantity:string}>>(base(w)+"/custody",{query:{page}}),
  command:(w:string,operation:WmsOperation,input:unknown)=>apiFetch<{id:string;status:string}>(base(w)+"/commands",{method:"POST",body:{operation,input}}),
  list:(w:string,kind:"receipts"|"loads",page:number,search:string)=>apiFetch<WmsPage<WmsDocumentSummary>>(base(w)+"/"+kind,{query:{page,search}}),
  receipt:(w:string,id:string)=>apiFetch<WmsReceipt>(base(w)+"/receipts/"+encodeURIComponent(id)),
  load:(w:string,id:string)=>apiFetch<WmsLoad>(base(w)+"/loads/"+encodeURIComponent(id)),
  recipients:(w:string,page:number,search:string)=>apiFetch<WmsPage<{id:string;fullName:string}>>(base(w)+"/recipients",{query:{page,search}}),
  fefo:(w:string,productId:string,quantity:string,targetDate:string,customerCode?:string)=>apiFetch<WmsFefoResult>(base(w)+"/fefo",{query:{productId,quantity,targetDate,customerCode}}),
  policies:(w:string,page:number,search:string)=>apiFetch<WmsPage<WmsCustomerPolicy>>(base(w)+"/customer-policies",{query:{page,search}}),
  policy:(w:string,body:WmsCustomerPolicy)=>apiFetch(base(w)+"/customer-policies",{method:"POST",body}),
};
