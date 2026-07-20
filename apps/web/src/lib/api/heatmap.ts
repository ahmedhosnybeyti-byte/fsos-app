import { apiFetch } from "../api-client";
import type {
  HeatmapDecisionRequest,
  HeatmapDecisionResult,
  HeatmapInterpretRequest,
  HeatmapInterpretResult,
  HeatmapQueryRequest,
  HeatmapQueryResult,
  HeatmapScopeValuesRequest,
  HeatmapValuesResult,
} from "../types";

// Migration #3 (ADR-001 / RIE Migration Plan) — no file/column mapping.
// Scope-value and category-value dropdowns get their own dedicated
// endpoints now instead of reusing routePlanningApi.distinctValues.
export const heatmapApi = {
  query: (body: HeatmapQueryRequest) => apiFetch<HeatmapQueryResult>("/heatmap/query", { method: "POST", body }),
  scopeValues: (query: HeatmapScopeValuesRequest) =>
    apiFetch<HeatmapValuesResult>("/heatmap/scope-values", { query: query as unknown as Record<string, string | number | boolean | undefined> }),
  categoryValues: () => apiFetch<HeatmapValuesResult>("/heatmap/category-values"),
  interpret: (body: HeatmapInterpretRequest) => apiFetch<HeatmapInterpretResult>("/heatmap/interpret", { method: "POST", body }),
  decisionSummary: (body: HeatmapDecisionRequest) => apiFetch<HeatmapDecisionResult>("/heatmap/decision-summary", { method: "POST", body }),
};
