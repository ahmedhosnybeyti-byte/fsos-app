import { apiFetch } from "../api-client";
import type { SmartLoadingCustomerSearchResult, SmartLoadingRecalculateInput, SmartLoadingRecalculateResult, SmartLoadingSession } from "@field-sales-os/schemas";

export const smartLoadingApi = {
  getSession: (targetDate?: string) => apiFetch<SmartLoadingSession>(`/smart-loading/session${targetDate ? `?targetDate=${encodeURIComponent(targetDate)}` : ""}`),
  searchCustomers: (q?: string, excludeCustomerCodes?: readonly string[]) => apiFetch<SmartLoadingCustomerSearchResult>("/smart-loading/customers/search", { query: { q, excludeCustomerCodes: excludeCustomerCodes?.join(",") } }),
  recalculate: (body: SmartLoadingRecalculateInput) => apiFetch<SmartLoadingRecalculateResult>("/smart-loading/recalculate", { method: "POST", body }),
};