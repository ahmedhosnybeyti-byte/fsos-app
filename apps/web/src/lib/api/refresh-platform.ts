import type { TriggerRefreshInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { RefreshRunData } from "../types";

// Phase 8 — Refresh Platform. Triggers/reads refresh runs; does not touch
// any existing file-upload or dataset flows.
export const refreshApi = {
  trigger: (input: TriggerRefreshInput) => apiFetch<RefreshRunData>("/companies/me/refresh", { method: "POST", body: input }),
  history: (dataSourceId?: string) =>
    apiFetch<RefreshRunData[]>("/companies/me/refresh/history", { query: dataSourceId ? { dataSourceId } : undefined }),
  get: (id: string) => apiFetch<RefreshRunData>(`/companies/me/refresh/${id}`),
};
