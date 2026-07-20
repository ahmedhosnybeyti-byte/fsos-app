import { apiFetch } from "../api-client";
import type { CaptureCustomerLocationRequest, CustomerLocationRecord } from "../types";

export const customerLocationsApi = {
  capture: (body: CaptureCustomerLocationRequest) => apiFetch<{ id: string }>("/customer-locations", { method: "POST", body }),
  // COMPANY_ADMIN/MANAGER export view — latest captured coordinate per
  // customer, company-wide (see customer-location.service.ts).
  list: () => apiFetch<CustomerLocationRecord[]>("/customer-locations"),
};
