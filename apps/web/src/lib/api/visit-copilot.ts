import { apiFetch } from "../api-client";
import type {
  VisitCopilotBriefing,
  VisitCopilotChatRequest,
  VisitCopilotChatResponse,
  VisitCopilotDailyBrief,
  VisitCopilotDiscoveryResult,
  VisitCopilotGoogleSearchRequest,
  VisitCopilotGoogleSearchResult,
  VisitCopilotPeriod,
  VisitCopilotPlanRequest,
  VisitCopilotPlanResult,
  VisitCopilotProspect,
  VisitCopilotProspectStatus,
  VisitCopilotRouteOpportunities,
} from "../types";

// AI Visit Copilot (Phases 1 + 2) — the backend is built in parallel against
// the same contract; keep these paths/shapes in lockstep with lib/types.ts.
interface PeriodParams {
  period: VisitCopilotPeriod;
  // Only sent when period === "custom" (YYYY-MM-DD).
  from?: string;
  to?: string;
}

export const visitCopilotApi = {
  dailyBrief: (params: PeriodParams) =>
    apiFetch<VisitCopilotDailyBrief>("/visit-copilot/daily-brief", {
      query: { period: params.period, from: params.from, to: params.to },
    }),

  plan: (body: VisitCopilotPlanRequest) => apiFetch<VisitCopilotPlanResult>("/visit-copilot/plan", { method: "POST", body }),

  briefing: (params: PeriodParams & { customerCode: string; vanStock: boolean }) =>
    apiFetch<VisitCopilotBriefing>(`/visit-copilot/briefing/${encodeURIComponent(params.customerCode)}`, {
      query: { period: params.period, from: params.from, to: params.to, vanStock: params.vanStock },
    }),

  // Chat body carries exactly one of customerCode / prospectId (Phase 2).
  chat: (body: VisitCopilotChatRequest) => apiFetch<VisitCopilotChatResponse>("/visit-copilot/chat", { method: "POST", body }),

  // ——— Phase 2: Customer Discovery ———
  discovery: (params: PeriodParams) =>
    apiFetch<VisitCopilotDiscoveryResult>("/visit-copilot/discovery", {
      query: { period: params.period, from: params.from, to: params.to },
    }),

  googleSearch: (body: VisitCopilotGoogleSearchRequest) =>
    apiFetch<VisitCopilotGoogleSearchResult>("/visit-copilot/discovery/google-search", { method: "POST", body }),

  prospectStatus: (params: { id: string; status: VisitCopilotProspectStatus }) =>
    apiFetch<VisitCopilotProspect>(`/visit-copilot/prospects/${encodeURIComponent(params.id)}/status`, {
      method: "PATCH",
      body: { status: params.status },
    }),

  routeOpportunities: (params: PeriodParams) =>
    apiFetch<VisitCopilotRouteOpportunities>("/visit-copilot/route-opportunities", {
      query: { period: params.period, from: params.from, to: params.to },
    }),

  // Same shape as the customer briefing + isProspect: true.
  prospectBriefing: (params: PeriodParams & { id: string; vanStock: boolean }) =>
    apiFetch<VisitCopilotBriefing>(`/visit-copilot/prospect-briefing/${encodeURIComponent(params.id)}`, {
      query: { period: params.period, from: params.from, to: params.to, vanStock: params.vanStock },
    }),
};
