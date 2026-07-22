import { apiFetch } from "../api-client";
import type {
  DecisionFilterField,
  DecisionFilterOptionsResult,
  DecisionQueryInput,
  DecisionQueryResult,
  DecisionTableQueryInput,
  DecisionTableResult,
} from "../types";

// Decision Analytics Studio — one main POST /query (the aggregation engine
// that also doubles as the drill-down mechanism, see decision-analytics-
// studio.schemas.ts), a GET /filter-options for the global filter bar's
// dropdown values, and a POST /table for the paginated Invoice-line detail
// table (the deepest drill level). Same api-client conventions (apiFetch,
// credentials-included cookie auth) as every other module.
export const decisionAnalyticsStudioApi = {
  query: (input: DecisionQueryInput) => apiFetch<DecisionQueryResult>("/decision-analytics-studio/query", { method: "POST", body: input }),
  filterOptions: (field: DecisionFilterField) =>
    apiFetch<DecisionFilterOptionsResult>("/decision-analytics-studio/filter-options", { query: { field } }),
  table: (input: DecisionTableQueryInput) => apiFetch<DecisionTableResult>("/decision-analytics-studio/table", { method: "POST", body: input }),
};
