import type { WmsCountCandidate, WmsCountDocument, WmsCountDraftInput, WmsCountStepInput, WmsCountSummary, WmsPage } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
const path = (w: string) => `/sfa/wms/warehouses/${encodeURIComponent(w)}/counts`;
export const wmsCountsApi = {
  candidates: (w: string, page: number, search: string) => apiFetch<WmsPage<WmsCountCandidate>>(`${path(w)}/candidates`, { query: { page, search } }),
  list: (w: string, page: number) => apiFetch<WmsPage<WmsCountSummary>>(path(w), { query: { page } }),
  detail: (w: string, id: string) => apiFetch<WmsCountDocument>(`${path(w)}/${encodeURIComponent(id)}`),
  create: (w: string, body: WmsCountDraftInput) => apiFetch<{ id: string }>(path(w), { method: "POST", body }),
  step: (w: string, id: string, action: "approve" | "cancel", body: WmsCountStepInput) => apiFetch(`${path(w)}/${encodeURIComponent(id)}/${action}`, { method: "POST", body }),
};
