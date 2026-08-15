import type { CreateLostOpportunityExclusion } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type {
  VisitCopilot360Summary,
  VisitCopilotBriefing,
  VisitCopilotChatRequest,
  VisitCopilotChatResponse,
  VisitCopilotDailyBrief,
  VisitCopilotDiscoveryResult,
  VisitCopilotDiscoveryLimit,
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

// Flexible plan date (2026-07-30) — separate from PeriodParams (the
// historical Analysis Scope). Omitted = today, resolved server-side.
interface PlanDateParams {
  date?: string;
}

export const visitCopilotApi = {
  dailyBrief: (params: PeriodParams & PlanDateParams, signal?: AbortSignal) =>
    apiFetch<VisitCopilotDailyBrief>("/visit-copilot/daily-brief", {
      query: { period: params.period, from: params.from, to: params.to, date: params.date },
      signal,
    }),

  plan: (body: VisitCopilotPlanRequest) => apiFetch<VisitCopilotPlanResult>("/visit-copilot/plan", { method: "POST", body }),

  briefing: (params: PeriodParams & { customerCode: string; vanStock: boolean; locale?: "ar" | "en" }) =>
    apiFetch<VisitCopilotBriefing>(`/visit-copilot/briefing/${encodeURIComponent(params.customerCode)}`, {
      query: { period: params.period, from: params.from, to: params.to, vanStock: params.vanStock, locale: params.locale },
    }),

  // Chat body carries exactly one of customerCode / prospectId (Phase 2).
  chat: (body: VisitCopilotChatRequest) => apiFetch<VisitCopilotChatResponse>("/visit-copilot/chat", { method: "POST", body }),

  // ——— Phase 2: Customer Discovery ———
  discovery: (params: PeriodParams & PlanDateParams & { minimumScore?: number }, signal?: AbortSignal) =>
    apiFetch<VisitCopilotDiscoveryResult>("/visit-copilot/discovery", {
      query: { period: params.period, from: params.from, to: params.to, date: params.date, minimumScore: params.minimumScore },
      signal,
    }),

  googleSearch: (body: VisitCopilotGoogleSearchRequest) =>
    apiFetch<VisitCopilotGoogleSearchResult>("/visit-copilot/discovery/search", { method: "POST", body }),

  discoveryLimit: () => apiFetch<VisitCopilotDiscoveryLimit>("/visit-copilot/discovery/limit"),

  resetDiscoveryDailyLimit: (userId: string) =>
    apiFetch<{ success: true; resetAt: string; dailyLimit: number; remaining: number }>(`/visit-copilot/admin/users/${encodeURIComponent(userId)}/reset-discovery-daily-limit`, { method: "POST" }),

  prospectStatus: (params: { id: string; status: VisitCopilotProspectStatus }) =>
    apiFetch<VisitCopilotProspect>(`/visit-copilot/prospects/${encodeURIComponent(params.id)}/status`, {
      method: "PATCH",
      body: { status: params.status },
    }),

  createProspectVisit: (body: { prospectId: string; scheduledFor: string }) =>
    apiFetch("/prospect-visits", { method: "POST", body }),

  routeOpportunities: (params: PeriodParams) =>
    apiFetch<VisitCopilotRouteOpportunities>("/visit-copilot/route-opportunities", {
      query: { period: params.period, from: params.from, to: params.to },
    }),

  // Same shape as the customer briefing + isProspect: true.
  prospectBriefing: (params: PeriodParams & { id: string; vanStock: boolean }) =>
    apiFetch<VisitCopilotBriefing>(`/visit-copilot/prospect-briefing/${encodeURIComponent(params.id)}`, {
      query: { period: params.period, from: params.from, to: params.to, vanStock: params.vanStock },
    }),

  // "ملخص اليوم 360°" (2026-07-28) — no scope param; role scoping is
  // entirely server-derived (see visit-copilot.controller.ts).
  daily360Summary: (params: PeriodParams & PlanDateParams & { locale?: "ar" | "en" }) =>
    apiFetch<VisitCopilot360Summary>("/visit-copilot/daily-360-summary", {
      query: { period: params.period, from: params.from, to: params.to, date: params.date, locale: params.locale },
    }),

  lostOpportunityExclusions: () =>
    apiFetch<Array<{ id: string; scopeType: string; customerCode: string | null; productCode: string; reason: string | null }>>("/visit-copilot/lost-opportunity-exclusions"),
  createLostOpportunityExclusion: (body: CreateLostOpportunityExclusion) =>
    apiFetch<{ id: string }>("/visit-copilot/lost-opportunity-exclusions", { method: "POST", body }),
  revokeLostOpportunityExclusion: (id: string) =>
    apiFetch<{ id: string }>(`/visit-copilot/lost-opportunity-exclusions/${encodeURIComponent(id)}/revoke`, { method: "POST" }),
};
