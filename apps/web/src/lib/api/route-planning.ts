import { apiFetch } from "../api-client";
import type { RoutePlanningScopeValuesRequest, RoutePlanningSplitRequest, RoutePlanningSplitResult, RoutePlanningValuesResult } from "../types";

// Migration #4 (ADR-001 / RIE Migration Plan) — distinctValues() stays
// UNCHANGED (legacy, file+column based): New Customer / Geo Intelligence
// (not yet migrated) still depends on it. scopeValues()/split() are now
// RIE-backed with no file/column mapping.
export const routePlanningApi = {
  distinctValues: (fileId: string, column: string) =>
    apiFetch<{ values: string[] }>("/route-planning/distinct-values", { query: { fileId, column } }),
  scopeValues: (query: RoutePlanningScopeValuesRequest) =>
    apiFetch<RoutePlanningValuesResult>("/route-planning/scope-values", { query: query as unknown as Record<string, string | number | boolean | undefined> }),
  split: (body: RoutePlanningSplitRequest) =>
    apiFetch<RoutePlanningSplitResult>("/route-planning/split", { method: "POST", body }),
};
