import { apiFetch } from "../api-client";
import type { TeamPerformanceCoachRequest, TeamPerformanceCoachResult, TeamPerformanceQueryRequest, TeamPerformanceResult } from "../types";

export const teamPerformanceApi = {
  query: (body: TeamPerformanceQueryRequest) => apiFetch<TeamPerformanceResult>("/team-performance/query", { method: "POST", body }),
  coach: (body: TeamPerformanceCoachRequest) => apiFetch<TeamPerformanceCoachResult>("/team-performance/coach", { method: "POST", body }),
};
