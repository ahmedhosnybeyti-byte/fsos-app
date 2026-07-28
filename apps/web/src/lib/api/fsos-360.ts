import { apiFetch } from "../api-client";
import type { Fsos360FilterOptionsResult, Fsos360QueryInput, Fsos360QueryResult } from "../types";

export const fsos360Api = {
  query: (input: Fsos360QueryInput) => apiFetch<Fsos360QueryResult>("/fsos-360/query", { method: "POST", body: input }),
  filterOptions: (input: { field: "customer" | "product" | "brand" | "category" | "sales-rep"; query: string; page: number; pageSize: number; context: Fsos360QueryInput }) => apiFetch<Fsos360FilterOptionsResult>("/fsos-360/filter-options", { method: "POST", body: input }),
  capabilities: () => apiFetch<Record<string, unknown>>("/fsos-360/capabilities"),
};
