import { apiFetch } from "../api-client";
import type {
  TerritoryCustomerMetric,
  TerritoryCustomerPointsResult,
  TerritoryIntelligenceExecutiveResponse,
  TerritoryIntelligenceSummaryResponse,
} from "../types";

// Territory Intelligence — territories are grouped by City (see
// TerritoryIntelligenceSummaryResponse.groupedBy), pre-sorted worst-first
// (ascending healthScore) by the API. Executive endpoint is a separate,
// lazily-fetched view (see territory-intelligence/page.tsx's executiveMode)
// so a viewer who never opens Executive Mode never pays for that query.
export const territoryIntelligenceApi = {
  summary: () => apiFetch<TerritoryIntelligenceSummaryResponse>("/territory-intelligence/summary"),
  executive: () => apiFetch<TerritoryIntelligenceExecutiveResponse>("/territory-intelligence/executive"),
  // Per-customer points for the points/cluster/heat map — reuses the same 7
  // metrics as the City-level cards above, computed per customer (see
  // getCustomerPoints()'s doc comment in territory-intelligence.service.ts
  // for exactly how each metric is reinterpreted per-customer). `city`
  // omitted = company-wide.
  customerPoints: (metric: TerritoryCustomerMetric, city?: string) =>
    apiFetch<TerritoryCustomerPointsResult>("/territory-intelligence/customer-points", { query: { metric, city } }),
};
