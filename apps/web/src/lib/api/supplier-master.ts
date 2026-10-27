import type { WmsPage } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
export interface SupplierIdentity { id: string; code: string; name: string }
const path = (warehouse: string) => `/sfa/wms/warehouses/${encodeURIComponent(warehouse)}/suppliers`;
export const supplierMasterApi = {
  list: (warehouse: string, page: number, search: string) => apiFetch<WmsPage<SupplierIdentity>>(path(warehouse), { query: { page, search } }),
  create: (warehouse: string, body: { code: string; name: string; idempotencyKey: string }) => apiFetch<SupplierIdentity>(path(warehouse), { method: "POST", body }),
};
