import { apiFetch } from "../api-client";
import type { SmartLoadingCustomerSearchResult, SmartLoadingRecalculateInput, SmartLoadingRecalculateResult, SmartLoadingSession } from "@field-sales-os/schemas";

export const smartLoadingApi = {
  getSession: (targetDate?: string, staleDaysThreshold?: number) => apiFetch<SmartLoadingSession>("/smart-loading/session", { query: { targetDate, staleDaysThreshold } }),
  searchCustomers: (q?: string, excludeCustomerCodes?: readonly string[]) => apiFetch<SmartLoadingCustomerSearchResult>("/smart-loading/customers/search", { query: { q, excludeCustomerCodes: excludeCustomerCodes?.join(",") } }),
  recalculate: (body: SmartLoadingRecalculateInput, signal?: AbortSignal) => apiFetch<SmartLoadingRecalculateResult>("/smart-loading/recalculate", { method: "POST", body, signal }),
};
