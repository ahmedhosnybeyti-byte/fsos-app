import type { UpdateCompanyInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Company, Paginated } from "../types";

export const companiesApi = {
  me: () => apiFetch<Company>("/companies/me"),
  updateMe: (input: { name?: string }) => apiFetch<Company>("/companies/me", { method: "PATCH", body: input }),
  list: (page: number, pageSize = 20) =>
    apiFetch<Paginated<Company>>("/companies", { query: { page, pageSize } }),
  get: (id: string) => apiFetch<Company>(`/companies/${id}`),
  update: (id: string, input: UpdateCompanyInput) => apiFetch<Company>(`/companies/${id}`, { method: "PATCH", body: input }),
};
