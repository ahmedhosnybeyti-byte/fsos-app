import type { RecordManualPaymentInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Paginated, Payment } from "../types";

export const paymentsApi = {
  mine: (page: number, pageSize = 20) => apiFetch<Paginated<Payment>>("/payments/me", { query: { page, pageSize } }),
  list: (page: number, pageSize = 20) => apiFetch<Paginated<Payment>>("/payments", { query: { page, pageSize } }),
  record: (companyId: string, input: RecordManualPaymentInput) =>
    apiFetch<Payment>(`/payments/companies/${companyId}`, { method: "POST", body: input }),
};
