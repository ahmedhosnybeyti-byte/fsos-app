import { apiFetch } from "../api-client";
import type { RoutePlanningSplitRequest, RoutePlanningSplitResult } from "../types";

export const routePlanningApi = {
  distinctValues: (fileId: string, column: string) =>
    apiFetch<{ values: string[] }>("/route-planning/distinct-values", { query: { fileId, column } }),
  split: (body: RoutePlanningSplitRequest) =>
    apiFetch<RoutePlanningSplitResult>("/route-planning/split", { method: "POST", body }),
};
