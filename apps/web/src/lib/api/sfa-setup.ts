import type { CompanyOperatingMode, CompanySetupChecklist, CreateWarehouseInput, SfaWarehouse, SfaWarehousePage, UpdateWarehouseInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";

export const sfaSetupApi = {
  mode: () => apiFetch<{ operatingMode: CompanyOperatingMode }>("/companies/me/operating-settings"),
  checklist: () => apiFetch<CompanySetupChecklist>("/sfa/setup-checklist"),
  warehouses: (page: number, search = "") => apiFetch<SfaWarehousePage>("/sfa/warehouses", { query: { page, pageSize: 20, search } }),
  create: (body: CreateWarehouseInput) => apiFetch<SfaWarehouse>("/sfa/warehouses", { method: "POST", body }),
  update: (id: string, body: UpdateWarehouseInput) => apiFetch<SfaWarehouse>(`/sfa/warehouses/${encodeURIComponent(id)}`, { method: "PATCH", body }),
};
