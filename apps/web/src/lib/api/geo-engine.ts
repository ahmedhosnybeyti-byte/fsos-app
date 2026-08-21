import { apiFetch } from "../api-client";
import type { GeoQueryInput, GeoQueryResult, GeoTableQueryInput, GeoTableResult } from "../types";

// Geo Intelligence Engine. Filter-option dropdown values are deliberately
// fetched from decisionAnalyticsStudioApi.filterOptions instead of a
// duplicate endpoint here (see geo-engine.controller.ts's comment — same
// field set, same entities, explicit "reuse existing services" instruction
// from the client spec).
export const geoEngineApi = {
  query: (input: GeoQueryInput) => apiFetch<GeoQueryResult>("/geo-engine/query", { method: "POST", body: input }),
  // Phase 3 — Invoice-line detail table ("Invoice" step of the drill chain).
  table: (input: GeoTableQueryInput) => apiFetch<GeoTableResult>("/geo-engine/table", { method: "POST", body: input }),
};
