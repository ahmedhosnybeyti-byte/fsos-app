import { apiFetch } from "../api-client";
import type {LoadingRecipientSummary,LoadingRecipientDetail} from "@field-sales-os/schemas";
import type { SmartLoadingCustomerSearchResult, SmartLoadingHierarchyOptions, SmartLoadingManagementLoadingRiskResponse, SmartLoadingManagementLostOpportunitiesResponse, SmartLoadingRecalculateInput, SmartLoadingRecalculateResult, SmartLoadingSession, SmartLoadingWarehouseRequestInput, WmsPage, WmsWarehouse } from "@field-sales-os/schemas";

export const smartLoadingApi = {
  recipientLoads:(page:number)=>apiFetch<WmsPage<LoadingRecipientSummary>>("/smart-loading/warehouse-requests/mine",{query:{page}}),
  recipientLoad:(warehouse:string,id:string)=>apiFetch<LoadingRecipientDetail>(`/smart-loading/warehouse-requests/warehouses/${encodeURIComponent(warehouse)}/loads/${encodeURIComponent(id)}`),
  recipientDecision:(warehouse:string,id:string,body:{version:number;confirmed:boolean;note:string;idempotencyKey:string})=>apiFetch<{id:string;status:string;version:number}>(`/smart-loading/warehouse-requests/warehouses/${encodeURIComponent(warehouse)}/loads/${encodeURIComponent(id)}/decision`,{method:"POST",body}),
  requestWarehouses:(page:number,search:string)=>apiFetch<WmsPage<WmsWarehouse>>("/smart-loading/warehouse-requests/warehouses",{query:{page,search}}),
  sendWarehouseRequest:(warehouse:string,body:SmartLoadingWarehouseRequestInput)=>apiFetch<{id:string;status:string}>(`/smart-loading/warehouse-requests/warehouses/${encodeURIComponent(warehouse)}`,{method:"POST",body}),
  getSession: (targetDate?: string, staleDaysThreshold?: number, salesRepId?: string, managerId?: string, supervisorId?: string) => apiFetch<SmartLoadingSession>("/smart-loading/session", { query: { targetDate, staleDaysThreshold, salesRepId, managerId, supervisorId } }),
  getHierarchyOptions: (managerId?: string, supervisorId?: string) => apiFetch<SmartLoadingHierarchyOptions>("/smart-loading/hierarchy-options", { query: { managerId, supervisorId } }),
  getManagementLoadingRisk: (targetDate: string) => apiFetch<SmartLoadingManagementLoadingRiskResponse>("/smart-loading/management-risks/loading", { query: { targetDate } }),
  getManagementLostOpportunities: (targetDate: string, scope: { managerId?: string; supervisorId?: string; salesRepId?: string }, limit = 100, offset = 0) => apiFetch<SmartLoadingManagementLostOpportunitiesResponse>("/smart-loading/management-risks/lost-opportunities", { query: { targetDate, ...scope, limit, offset } }),
  searchCustomers: (q?: string, excludeCustomerCodes?: readonly string[]) => apiFetch<SmartLoadingCustomerSearchResult>("/smart-loading/customers/search", { query: { q, excludeCustomerCodes: excludeCustomerCodes?.join(",") } }),
  recalculate: (body: SmartLoadingRecalculateInput, signal?: AbortSignal) => apiFetch<SmartLoadingRecalculateResult>("/smart-loading/recalculate", { method: "POST", body, signal }),
};
