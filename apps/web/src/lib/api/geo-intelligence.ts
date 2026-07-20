import { apiFetch } from "../api-client";
import type {
  GeoIntelligenceAnalyzeRequest,
  GeoIntelligenceAnalyzeResult,
  GeoIntelligenceCompareRequest,
  GeoIntelligenceCompareResult,
  GeoIntelligenceCompareCustomersRequest,
  GeoIntelligenceCustomersRequest,
  GeoIntelligenceCustomersResult,
  GeoIntelligenceExpansionRequest,
  GeoIntelligenceExpansionResult,
  GeoIntelligenceExpansionScopeValuesRequest,
  GeoIntelligenceTalkingPointsRequest,
  GeoIntelligenceTalkingPointsResult,
  GeoIntelligenceValuesResult,
} from "../types";

// Migration #5 (ADR-001 / RIE Migration Plan) — no file/column mapping.
// customers()/analyze()/expansion() are now RIE-backed, same as Migration
// #1's compareCustomers()/compare().
export const geoIntelligenceApi = {
  // Every other GET-with-query call in this file builds the query object as
  // a fresh inline literal at the call site (see audit.ts/payments.ts etc.)
  // — TS only infers a matching index signature for a fresh object literal,
  // not for a value already typed as a named interface. This is the only
  // GET endpoint here whose caller passes an already-typed request object
  // through, hence the one explicit cast.
  customers: (query: GeoIntelligenceCustomersRequest) =>
    apiFetch<GeoIntelligenceCustomersResult>("/geo-intelligence/customers", { query: query as unknown as Record<string, string | number | boolean | undefined> }),
  compareCustomers: (query: GeoIntelligenceCompareCustomersRequest) =>
    apiFetch<GeoIntelligenceCustomersResult>("/geo-intelligence/compare/customers", { query: query as unknown as Record<string, string | number | boolean | undefined> }),
  analyze: (body: GeoIntelligenceAnalyzeRequest) =>
    apiFetch<GeoIntelligenceAnalyzeResult>("/geo-intelligence/analyze", { method: "POST", body }),
  compare: (body: GeoIntelligenceCompareRequest) =>
    apiFetch<GeoIntelligenceCompareResult>("/geo-intelligence/compare", { method: "POST", body }),
  expansionScopeValues: (query: GeoIntelligenceExpansionScopeValuesRequest) =>
    apiFetch<GeoIntelligenceValuesResult>("/geo-intelligence/expansion/scope-values", { query: query as unknown as Record<string, string | number | boolean | undefined> }),
  expansion: (body: GeoIntelligenceExpansionRequest) =>
    apiFetch<GeoIntelligenceExpansionResult>("/geo-intelligence/expansion", { method: "POST", body }),
  talkingPoints: (body: GeoIntelligenceTalkingPointsRequest) =>
    apiFetch<GeoIntelligenceTalkingPointsResult>("/geo-intelligence/talking-points", { method: "POST", body }),
};
