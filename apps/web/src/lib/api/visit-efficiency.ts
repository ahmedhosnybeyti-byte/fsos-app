import { apiFetch } from "../api-client";
import type { VisitEfficiencyQueryRequest, VisitEfficiencyResult, VisitEfficiencyScopeValuesRequest, VisitEfficiencyValuesResult } from "../types";

// Migration #6 (ADR-001 / RIE Migration Plan) — no file/column mapping.
export const visitEfficiencyApi = {
  query: (body: VisitEfficiencyQueryRequest) => apiFetch<VisitEfficiencyResult>("/visit-efficiency/query", { method: "POST", body }),
  scopeValues: (query: VisitEfficiencyScopeValuesRequest) =>
    apiFetch<VisitEfficiencyValuesResult>("/visit-efficiency/scope-values", { query: query as unknown as Record<string, string | number | boolean | undefined> }),
};
