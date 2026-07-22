import { apiFetch } from "../api-client";
import type { TerritoryIntelligenceExecutiveResponse, TerritoryIntelligenceSummaryResponse } from "../types";

// Territory Intelligence — territories are grouped by City (see
// TerritoryIntelligenceSummaryResponse.groupedBy), pre-sorted worst-first
// (ascending healthScore) by the API. Executive endpoint is a separate,
// lazily-fetched view (see territory-intelligence/page.tsx's executiveMode)
// so a viewer who never opens Executive Mode never pays for that query.
export const territoryIntelligenceApi = {
  summary: () => apiFetch<TerritoryIntelligenceSummaryResponse>("/territory-intelligence/summary"),
  executive: () => apiFetch<TerritoryIntelligenceExecutiveResponse>("/territory-intelligence/executive"),
};
