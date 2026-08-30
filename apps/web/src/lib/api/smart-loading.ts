import { apiFetch } from "../api-client";
import type { SmartLoadingCustomerSearchResult, SmartLoadingHierarchyOptions, SmartLoadingManagementLoadingRiskResponse, SmartLoadingRecalculateInput, SmartLoadingRecalculateResult, SmartLoadingSession } from "@field-sales-os/schemas";

export const smartLoadingApi = {
  getSession: (targetDate?: string, staleDaysThreshold?: number, salesRepId?: string, managerId?: string, supervisorId?: string) => apiFetch<SmartLoadingSession>("/smart-loading/session", { query: { targetDate, staleDaysThreshold, salesRepId, managerId, supervisorId } }),
  getHierarchyOptions: (managerId?: string, supervisorId?: string) => apiFetch<SmartLoadingHierarchyOptions>("/smart-loading/hierarchy-options", { query: { managerId, supervisorId } }),
  getManagementLoadingRisk: (targetDate: string) => apiFetch<SmartLoadingManagementLoadingRiskResponse>("/smart-loading/management-risks/loading", { query: { targetDate } }),
  searchCustomers: (q?: string, excludeCustomerCodes?: readonly string[]) => apiFetch<SmartLoadingCustomerSearchResult>("/smart-loading/customers/search", { query: { q, excludeCustomerCodes: excludeCustomerCodes?.join(",") } }),
  recalculate: (body: SmartLoadingRecalculateInput, signal?: AbortSignal) => apiFetch<SmartLoadingRecalculateResult>("/smart-loading/recalculate", { method: "POST", body, signal }),
};
