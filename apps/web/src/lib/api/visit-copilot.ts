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
type RepScope = { salesRepId?: string };

export const visitCopilotApi = {
  supervisedSalesReps: () => apiFetch<Array<{ employeeCode: string; fullName: string }>>("/visit-copilot/sales-reps"),
  dailyBrief: (params: PeriodParams & PlanDateParams & RepScope, signal?: AbortSignal) =>
    apiFetch<VisitCopilotDailyBrief>("/visit-copilot/daily-brief", {
      query: { period: params.period, from: params.from, to: params.to, date: params.date, salesRepId: params.salesRepId },
      signal,
    }),

  plan: (body: VisitCopilotPlanRequest & RepScope) => apiFetch<VisitCopilotPlanResult>("/visit-copilot/plan", { method: "POST", body, query: { salesRepId: body.salesRepId } }),

  briefing: (params: PeriodParams & { customerCode: string; vanStock: boolean; locale?: "ar" | "en" } & RepScope) =>
    apiFetch<VisitCopilotBriefing>(`/visit-copilot/briefing/${encodeURIComponent(params.customerCode)}`, {
      query: { period: params.period, from: params.from, to: params.to, vanStock: params.vanStock, locale: params.locale, salesRepId: params.salesRepId },
    }),

  // Chat body carries exactly one of customerCode / prospectId (Phase 2).
  chat: (body: VisitCopilotChatRequest & RepScope) => apiFetch<VisitCopilotChatResponse>("/visit-copilot/chat", { method: "POST", body, query: { salesRepId: body.salesRepId } }),

  // ——— Phase 2: Customer Discovery ———
  discovery: (params: PeriodParams & PlanDateParams & { minimumScore?: number } & RepScope, signal?: AbortSignal) =>
    apiFetch<VisitCopilotDiscoveryResult>("/visit-copilot/discovery", {
      query: { period: params.period, from: params.from, to: params.to, date: params.date, minimumScore: params.minimumScore, salesRepId: params.salesRepId },
      signal,
    }),

  googleSearch: (body: VisitCopilotGoogleSearchRequest & RepScope) =>
    apiFetch<VisitCopilotGoogleSearchResult>("/visit-copilot/discovery/search", { method: "POST", body, query: { salesRepId: body.salesRepId } }),

  discoveryLimit: (salesRepId?: string) => apiFetch<VisitCopilotDiscoveryLimit>("/visit-copilot/discovery/limit", { query: { salesRepId } }),

  resetDiscoveryDailyLimit: (userId: string) =>
    apiFetch<{ success: true; resetAt: string; dailyLimit: number; remaining: number }>(`/visit-copilot/admin/users/${encodeURIComponent(userId)}/reset-discovery-daily-limit`, { method: "POST" }),

  prospectStatus: (params: { id: string; status: VisitCopilotProspectStatus } & RepScope) =>
    apiFetch<VisitCopilotProspect>(`/visit-copilot/prospects/${encodeURIComponent(params.id)}/status`, {
      method: "PATCH",
      body: { status: params.status }, query: { salesRepId: params.salesRepId },
    }),

  createProspectVisit: (body: { prospectId: string; scheduledFor: string }) =>
    apiFetch("/prospect-visits", { method: "POST", body }),

  routeOpportunities: (params: PeriodParams & RepScope) =>
    apiFetch<VisitCopilotRouteOpportunities>("/visit-copilot/route-opportunities", {
      query: { period: params.period, from: params.from, to: params.to, salesRepId: params.salesRepId },
    }),

  // Same shape as the customer briefing + isProspect: true.
  prospectBriefing: (params: PeriodParams & { id: string; vanStock: boolean } & RepScope) =>
    apiFetch<VisitCopilotBriefing>(`/visit-copilot/prospect-briefing/${encodeURIComponent(params.id)}`, {
      query: { period: params.period, from: params.from, to: params.to, vanStock: params.vanStock, salesRepId: params.salesRepId },
    }),

  // "ملخص اليوم 360°" (2026-07-28) — no scope param; role scoping is
  // entirely server-derived (see visit-copilot.controller.ts).
  daily360Summary: (params: PeriodParams & PlanDateParams & { locale?: "ar" | "en" } & RepScope) =>
    apiFetch<VisitCopilot360Summary>("/visit-copilot/daily-360-summary", {
      query: { period: params.period, from: params.from, to: params.to, date: params.date, locale: params.locale, salesRepId: params.salesRepId },
    }),

  lostOpportunityExclusions: () =>
    apiFetch<Array<{ id: string; scopeType: string; customerCode: string | null; productCode: string; reason: string | null }>>("/visit-copilot/lost-opportunity-exclusions"),
  createLostOpportunityExclusion: (body: CreateLostOpportunityExclusion) =>
    apiFetch<{ id: string }>("/visit-copilot/lost-opportunity-exclusions", { method: "POST", body }),
  revokeLostOpportunityExclusion: (id: string) =>
    apiFetch<{ id: string }>(`/visit-copilot/lost-opportunity-exclusions/${encodeURIComponent(id)}/revoke`, { method: "POST" }),
};
