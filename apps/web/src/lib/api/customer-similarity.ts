import { apiFetch } from "../api-client";
import type { CustomerSimilarityQueryRequest, CustomerSimilarityResult, CustomerSimilarityScopeValuesRequest, CustomerSimilarityValuesResult } from "../types";

// Migration #2 (ADR-001 / RIE Migration Plan) — no file/column mapping.
export const customerSimilarityApi = {
  query: (body: CustomerSimilarityQueryRequest) =>
    apiFetch<CustomerSimilarityResult>("/customer-similarity/query", { method: "POST", body }),
  scopeValues: (query: CustomerSimilarityScopeValuesRequest) =>
    apiFetch<CustomerSimilarityValuesResult>("/customer-similarity/scope-values", { query: query as unknown as Record<string, string | number | boolean | undefined> }),
  categoryValues: () => apiFetch<CustomerSimilarityValuesResult>("/customer-similarity/category-values"),
};
