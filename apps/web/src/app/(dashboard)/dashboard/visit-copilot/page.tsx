"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CheckSquare,
  Compass,
  Lightbulb,
  LocateFixed,
  Map,
  Search,
  Send,
  Sparkles,
  Square,
  Target,
  TrendingDown,
  TrendingUp,
  Undo2,
  User,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { visitCopilotApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "@/components/translation-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type {
  VisitCopilotChatMessage,
  VisitCopilotPeriod,
  VisitCopilotPlanMode,
  VisitCopilotPlanResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// AI Visit Copilot — Phases 1 + 2 (frontend only, 2026-07-19).
// Decision-support screen for the rep in the field, NOT a report screen:
// daily brief on load, two one-tap plan orderings (geographic vs. sales
// priority), then a per-customer Visit Mode (briefing scannable in <10s +
// contextual chat). Everything AI-worded (goal/opportunity/actions/
// warnings/reason) arrives as ready-made Arabic strings from the server
// and is rendered as-is. Phase 2 adds opt-in Customer Discovery: a header
// toggle reveals a Leaflet map of existing customers + scored prospects,
// a route-fit suggestion card appears after /plan (suggestion only — it
// never modifies the plan), and prospects reuse Visit Mode via the
// prospect briefing. Built mobile-first: single column, big touch targets.
const MAX_HISTORY_SENT = 10;

// The map (and the whole Leaflet chunk behind it) costs nothing until the
// rep actually opens Discovery — ssr:false dynamic import, per spec.
const DiscoveryMap = dynamic(() => import("@/components/visit-copilot/discovery-map").then((m) => m.DiscoveryMap), {
  ssr: false,
  loading: MapLoadingFallback,
});

function MapLoadingFallback() {
  // Rendered inside the provider tree, so the hook is safe here even
  // though next/dynamic's `loading` option looks like plain config.
  const { t } = useTranslation();
  return (
    <div className="flex h-[60vh] w-full items-center justify-center rounded-lg border border-border text-sm text-muted-foreground">
      {t("copilot.mapLoading")}
    </div>
  );
}

const GOOGLE_SEARCH_RADIUS_METERS = 3000;

const PERIODS: { value: VisitCopilotPeriod; labelKey: "copilot.period1m" | "copilot.period3m" | "copilot.period6m" | "copilot.period12m" | "copilot.periodCustom" }[] = [
  { value: "1m", labelKey: "copilot.period1m" },
  { value: "3m", labelKey: "copilot.period3m" },
  { value: "6m", labelKey: "copilot.period6m" },
  { value: "12m", labelKey: "copilot.period12m" },
  { value: "custom", labelKey: "copilot.periodCustom" },
];

// >=70 act now (green) / 40-69 worth attention (amber) / <40 routine (muted).
function priorityBadgeClass(score: number): string {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300";
  if (score >= 40) return "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

export default function VisitCopilotPage() {
  const { t } = useTranslation();

  // Global controls — period + van-stock apply to the brief, the briefing
  // and the chat alike, so they live at page level.
  const [period, setPeriod] = useState<VisitCopilotPeriod>("3m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vanStock, setVanStock] = useState(false);

  const queryClient = useQueryClient();

  // Visit Mode target — exactly one of these is set at a time (customer
  // from the plan list, or prospect from the Discovery map).
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  // A successful /plan call overrides the brief's customer order + travel
  // estimates until the period changes (the plan was computed for it).
  const [plan, setPlan] = useState<VisitCopilotPlanResult | null>(null);
  // Discovery never auto-opens — only the header button (or the route
  // suggestion card) flips this, and it stays open across Visit Mode
  // round-trips so back returns to the same map.
  const [showDiscovery, setShowDiscovery] = useState(false);

  const [chatMessages, setChatMessages] = useState<VisitCopilotChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [doneActions, setDoneActions] = useState<Set<number>>(new Set());

  const customPeriodReady = period !== "custom" || (!!from && !!to);
  const periodParams = {
    period,
    from: period === "custom" && from ? from : undefined,
    to: period === "custom" && to ? to : undefined,
  };

  const briefQuery = useQuery({
    queryKey: ["visit-copilot", "daily-brief", period, from, to, vanStock],
    queryFn: () => visitCopilotApi.dailyBrief(periodParams),
    enabled: customPeriodReady,
  });

  const planMutation = useMutation({
    mutationFn: visitCopilotApi.plan,
    onSuccess: (data) => setPlan(data),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("copilot.planError")),
  });

  const briefingQuery = useQuery({
    queryKey: ["visit-copilot", "briefing", selectedCode, period, from, to, vanStock],
    queryFn: () => visitCopilotApi.briefing({ customerCode: selectedCode!, ...periodParams, vanStock }),
    enabled: !!selectedCode && customPeriodReady,
  });

  const chatMutation = useMutation({
    mutationFn: visitCopilotApi.chat,
    onSuccess: (data) => setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("copilot.chatError")),
  });

  // ——— Phase 2: Discovery queries/mutations ———
  const discoveryQuery = useQuery({
    queryKey: ["visit-copilot", "discovery", period, from, to],
    queryFn: () => visitCopilotApi.discovery(periodParams),
    enabled: showDiscovery && customPeriodReady,
  });

  // Fetched once a plan exists; renders as a suggestion card only and
  // never touches the plan itself.
  const routeOppQuery = useQuery({
    queryKey: ["visit-copilot", "route-opportunities", period, from, to],
    queryFn: () => visitCopilotApi.routeOpportunities(periodParams),
    enabled: !!plan && customPeriodReady,
  });

  const prospectBriefingQuery = useQuery({
    queryKey: ["visit-copilot", "prospect-briefing", selectedProspectId, period, from, to, vanStock],
    queryFn: () => visitCopilotApi.prospectBriefing({ id: selectedProspectId!, ...periodParams, vanStock }),
    enabled: !!selectedProspectId && customPeriodReady,
  });

  const statusMutation = useMutation({
    mutationFn: visitCopilotApi.prospectStatus,
    onSuccess: (_data, variables) => {
      toast.success(t(variables.status === "VISITED" ? "copilot.markedVisited" : "copilot.ignoredToast"));
      queryClient.invalidateQueries({ queryKey: ["visit-copilot", "discovery"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("copilot.statusError")),
  });

  const googleSearchMutation = useMutation({
    mutationFn: visitCopilotApi.googleSearch,
    onSuccess: (data) => {
      // disabled:true means no Places API key server-side — surface the
      // server's own message and skip the refetch (nothing changed).
      if (data.disabled) {
        toast.warning(data.message || t("copilot.googleSearchDisabled"));
        return;
      }
      toast.success(t("copilot.googleSearchResult", { found: data.found, newCount: data.newCount }));
      queryClient.invalidateQueries({ queryKey: ["visit-copilot", "discovery"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("copilot.discoveryLoadError")),
  });

  // The plan ordering was computed for a specific period — invalidate it
  // whenever the period inputs change.
  function changePeriod(next: VisitCopilotPeriod) {
    setPeriod(next);
    setPlan(null);
  }
  function changeFrom(next: string) {
    setFrom(next);
    setPlan(null);
  }
  function changeTo(next: string) {
    setTo(next);
    setPlan(null);
  }

  function openVisit(customerCode: string) {
    setSelectedCode(customerCode);
    setSelectedProspectId(null);
    setChatMessages([]);
    setDoneActions(new Set());
  }

  // Prospect Mode = the same Visit Mode UI fed by the prospect briefing.
  // Discovery state (showDiscovery + cached map data) is untouched, so
  // "back" lands on the exact list/map the rep left.
  function openProspectVisit(prospectId: string) {
    setSelectedProspectId(prospectId);
    setSelectedCode(null);
    setChatMessages([]);
    setDoneActions(new Set());
  }

  function closeVisit() {
    setSelectedCode(null);
    setSelectedProspectId(null);
  }

  function buildPlan(mode: VisitCopilotPlanMode) {
    if (!customPeriodReady || planMutation.isPending) return;
    planMutation.mutate({ mode, ...periodParams });
  }

  // "Search around me": GPS first; if geolocation is missing/denied, fall
  // back to the center of the customer markers already on the map.
  function searchGoogleAround() {
    if (googleSearchMutation.isPending) return;
    const fallback = () => {
      const data = discoveryQuery.data;
      const points = data && data.customers.length > 0 ? data.customers : data?.prospects ?? [];
      if (points.length === 0) {
        toast.error(t("copilot.geoUnavailable"));
        return;
      }
      toast.warning(t("copilot.geoFallbackNotice"));
      const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
      const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length;
      googleSearchMutation.mutate({ lat, lon, radiusMeters: GOOGLE_SEARCH_RADIUS_METERS });
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      fallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        googleSearchMutation.mutate({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          radiusMeters: GOOGLE_SEARCH_RADIUS_METERS,
        }),
      fallback,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function sendChat(text: string) {
    const trimmed = text.trim();
    // The chat body carries exactly ONE of customerCode / prospectId.
    const target = selectedProspectId
      ? { prospectId: selectedProspectId }
      : selectedCode
        ? { customerCode: selectedCode }
        : null;
    if (!trimmed || !target || chatMutation.isPending) return;
    const history = chatMessages.slice(-MAX_HISTORY_SENT).map(({ role, content }) => ({ role, content }));
    setChatMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setChatInput("");
    chatMutation.mutate({ ...target, ...periodParams, vanStock, message: trimmed, history });
  }

  function toggleAction(index: number) {
    setDoneActions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const brief = briefQuery.data;
  const customers = plan?.customers ?? brief?.customers ?? [];
  const distanceKm = plan?.estimatedDistanceKm ?? brief?.estimatedDistanceKm;
  const durationMin = plan?.estimatedDurationMin ?? brief?.estimatedDurationMin;
  // Visit Mode reads whichever briefing matches the current target.
  const inVisitMode = selectedCode !== null || selectedProspectId !== null;
  const activeBriefingQuery = selectedProspectId ? prospectBriefingQuery : briefingQuery;
  const briefing = activeBriefingQuery.data;
  const trendUp = (briefing?.sales.trendPct ?? 0) >= 0;
  const routeOpp = routeOppQuery.data;
  const showOppCard = !!plan && !!routeOpp && !routeOpp.disabled && routeOpp.highCount + routeOpp.mediumCount > 0;

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="crystal-badge h-11 w-11 bg-ai/15 text-ai drop-shadow-[0_0_20px_hsl(var(--ai)/0.4)]">
              <Compass className="h-5 w-5" />
            </span>
            {t("copilot.title")}
          </h1>
          <p className="text-muted-foreground">{t("copilot.subtitle")}</p>
        </div>
        {/* Persistent Discovery toggle — never auto-opens the section. */}
        <Button
          variant={showDiscovery ? "default" : "secondary"}
          className="h-11 gap-2"
          onClick={() => setShowDiscovery((v) => !v)}
        >
          <Search className="h-4 w-4" />
          {t("copilot.discoverButton")}
        </Button>
      </div>

      {/* Global controls — small, always visible (they also drive Visit Mode). */}
      <div className="glass-card rise-in rise-d1 flex flex-wrap items-end gap-4 p-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">{t("copilot.periodLabel")}</Label>
          <Select value={period} onValueChange={(v) => changePeriod(v as VisitCopilotPeriod)}>
            <SelectTrigger className="h-11 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {t(p.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <>
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("copilot.fromLabel")}</Label>
              <Input type="date" value={from} onChange={(e) => changeFrom(e.target.value)} className="h-11 w-40" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("copilot.toLabel")}</Label>
              <Input type="date" value={to} onChange={(e) => changeTo(e.target.value)} className="h-11 w-40" />
            </div>
          </>
        )}
        <label className="flex h-11 items-center gap-2 text-sm">
          <Switch checked={vanStock} onCheckedChange={setVanStock} />
          {t("copilot.vanStockLabel")}
        </label>
        {!customPeriodReady && <p className="w-full text-xs text-muted-foreground">{t("copilot.customPeriodHint")}</p>}
      </div>

      {!inVisitMode ? (
        <>
          {/* ——— Phase 2: Discovery section (opt-in via the header button) ——— */}
          {showDiscovery && (
            <div className="glass-card rise-in space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Search className="h-4 w-4 text-ai" />
                  {t("copilot.discoveryTitle")}
                </h2>
                <Button
                  variant="secondary"
                  className="h-11 gap-2"
                  onClick={searchGoogleAround}
                  disabled={googleSearchMutation.isPending || discoveryQuery.isLoading}
                >
                  {googleSearchMutation.isPending ? <Spinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
                  {t("copilot.googleSearchButton")}
                </Button>
              </div>

              {discoveryQuery.isLoading ? (
                <Skeleton className="h-[60vh]" />
              ) : discoveryQuery.isError ? (
                <p className="text-sm text-destructive">
                  {discoveryQuery.error instanceof ApiError ? discoveryQuery.error.message : t("copilot.discoveryLoadError")}
                </p>
              ) : discoveryQuery.data ? (
                <>
                  {discoveryQuery.data.warnings.length > 0 && (
                    <div className="space-y-1">
                      {discoveryQuery.data.warnings.map((w, i) => (
                        <p key={i} className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {w}
                        </p>
                      ))}
                    </div>
                  )}
                  <DiscoveryMap
                    customers={discoveryQuery.data.customers}
                    prospects={discoveryQuery.data.prospects}
                    onStartVisit={openProspectVisit}
                    onIgnore={(id) => statusMutation.mutate({ id, status: "IGNORED" })}
                  />
                </>
              ) : null}
            </div>
          )}

          {/* ——— Daily Brief header ——— */}
          {briefQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-64" />
            </div>
          ) : briefQuery.isError ? (
            <p className="text-sm text-destructive">
              {briefQuery.error instanceof ApiError ? briefQuery.error.message : t("copilot.briefLoadError")}
            </p>
          ) : brief ? (
            <>
              <div className="glass-hero rise-in relative p-5">
                <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
                <div className="relative space-y-4">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-semibold">{brief.weekday}</span>
                    <span className="text-sm text-muted-foreground">{brief.date}</span>
                  </div>
                  {!brief.isWorkingDay && <p className="text-xs text-muted-foreground">{t("copilot.notWorkingDay")}</p>}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <BriefStat label={t("copilot.visitsLabel")} value={brief.visitCount.toLocaleString()} />
                    <BriefStat
                      label={t("copilot.dailyTargetLabel")}
                      value={brief.dailyTargetSales !== null ? brief.dailyTargetSales.toLocaleString() : t("copilot.noTarget")}
                      muted={brief.dailyTargetSales === null}
                    />
                    <BriefStat label={t("copilot.expectedSalesLabel")} value={brief.expectedSalesTotal.toLocaleString()} />
                    <BriefStat
                      label={t("copilot.distanceLabel")}
                      value={distanceKm !== undefined ? t("copilot.kmValue", { value: distanceKm.toLocaleString() }) : "—"}
                    />
                    <BriefStat
                      label={t("copilot.durationLabel")}
                      value={durationMin !== undefined ? t("copilot.minValue", { value: durationMin.toLocaleString() }) : "—"}
                    />
                  </div>

                  {brief.warnings.length > 0 && (
                    <div className="space-y-1">
                      {brief.warnings.map((w, i) => (
                        <p key={i} className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Two ways to order the day — everything ends in an action. */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      size="lg"
                      variant={plan?.mode === "route" ? "default" : "secondary"}
                      className="h-12"
                      onClick={() => buildPlan("route")}
                      disabled={planMutation.isPending || !customPeriodReady}
                    >
                      {planMutation.isPending && planMutation.variables?.mode === "route" ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <Map className="h-4 w-4" />
                      )}
                      {t("copilot.planRoute")}
                    </Button>
                    <Button
                      size="lg"
                      variant={plan?.mode === "priority" ? "default" : "secondary"}
                      className="h-12"
                      onClick={() => buildPlan("priority")}
                      disabled={planMutation.isPending || !customPeriodReady}
                    >
                      {planMutation.isPending && planMutation.variables?.mode === "priority" ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      {t("copilot.planPriority")}
                    </Button>
                  </div>
                </div>
              </div>

              {/* ——— Phase 2: route-fit suggestion (after a plan exists).
                   Suggestion only — it NEVER modifies the plan. ——— */}
              {showOppCard && routeOpp && (
                <div className="glass-card glow-ai rise-in space-y-2 p-4">
                  <p className="flex items-start gap-2 text-sm font-medium">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
                    {t("copilot.oppFound", { high: routeOpp.highCount, medium: routeOpp.mediumCount })}
                  </p>
                  {routeOpp.best.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("copilot.oppBest", {
                        value: routeOpp.totalExpectedValue.toLocaleString(),
                        minutes: routeOpp.best.reduce((sum, b) => sum + b.addedMinutes, 0).toLocaleString(),
                        km: routeOpp.best.reduce((sum, b) => sum + b.addedKm, 0).toLocaleString(),
                      })}
                    </p>
                  )}
                  <Button variant="secondary" className="h-11 gap-2" onClick={() => setShowDiscovery(true)}>
                    <Map className="h-4 w-4" />
                    {t("copilot.oppShowMap")}
                  </Button>
                </div>
              )}

              {/* ——— Customer list ——— */}
              <div className="glass-card rise-in rise-d1 p-4">
                <h2 className="mb-3 text-sm font-semibold">{t("copilot.customersTitle")}</h2>
                {customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("copilot.noCustomers")}</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {customers.map((c) => (
                      <li key={c.customerCode}>
                        <button
                          onClick={() => openVisit(c.customerCode)}
                          className="flex w-full items-center gap-3 px-1 py-3 text-start transition-colors hover:bg-secondary/50"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                            {c.visitSequence}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c.customerName}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t("copilot.avgOrder", { value: c.avgOrderValue.toLocaleString() })}
                            </span>
                          </span>
                          <Badge variant="secondary" className="shrink-0">
                            {c.channel}
                          </Badge>
                          <span
                            className={cn(
                              "flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                              priorityBadgeClass(c.priorityScore),
                            )}
                          >
                            {Math.round(c.priorityScore)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </>
      ) : (
        /* ——— Visit Mode (customer or prospect) ——— */
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={closeVisit} className="h-11 gap-2 px-3">
            <Undo2 className="h-4 w-4" />
            {t("copilot.back")}
          </Button>

          {activeBriefingQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-56" />
              <Skeleton className="h-40" />
            </div>
          ) : activeBriefingQuery.isError ? (
            <p className="text-sm text-destructive">
              {activeBriefingQuery.error instanceof ApiError
                ? activeBriefingQuery.error.message
                : t("copilot.briefingLoadError")}
            </p>
          ) : briefing ? (
            <div className="glass-card rise-in space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="text-lg font-semibold">{briefing.customerName}</h2>
                {briefing.isProspect ? (
                  <Badge className="bg-ai/15 text-ai hover:bg-ai/15">{t("copilot.prospectBadge")}</Badge>
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">{briefing.customerCode}</span>
                )}
              </div>

              {/* Scannable in <10s: 4 big numbers. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <BigNumber
                  label={t("copilot.salesLabel")}
                  value={briefing.sales.total.toLocaleString()}
                  caption={t("copilot.invoiceCount", { count: briefing.sales.invoiceCount })}
                />
                <BigNumber
                  label={t("copilot.returnsLabel")}
                  value={briefing.returns.total.toLocaleString()}
                  caption={t("copilot.returnRate", { value: briefing.returns.rate.toLocaleString() })}
                />
                <BigNumber label={t("copilot.pendingLabel")} value={briefing.collections.pending.toLocaleString()} />
                <div className="rounded-lg bg-background/60 p-3">
                  <p className="text-xs text-muted-foreground">{t("copilot.trendLabel")}</p>
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-1 text-xl font-bold",
                      trendUp ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300",
                    )}
                  >
                    {trendUp ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {Math.abs(briefing.sales.trendPct).toLocaleString()}%
                  </p>
                </div>
              </div>

              {briefing.topProducts.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("copilot.topProductsTitle")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {briefing.topProducts.map((p) => (
                      <Badge key={p.productCode} variant="secondary" className="font-normal">
                        {p.productName} · {p.value.toLocaleString()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* The two decision lines — server-worded, rendered as-is. */}
              <div className="space-y-2">
                <p className="glow-ai flex items-start gap-2 rounded-lg p-3 text-sm font-medium">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
                  {briefing.suggestedGoal}
                </p>
                <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
                  {briefing.topOpportunity}
                </p>
              </div>

              {briefing.actions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("copilot.actionsTitle")}</p>
                  <ul className="space-y-1">
                    {briefing.actions.map((action, i) => (
                      <li key={i}>
                        {/* Tap-to-tick checklist — purely local state, a field aid, nothing is saved. */}
                        <button
                          onClick={() => toggleAction(i)}
                          className="flex w-full items-start gap-2 rounded-md px-1 py-2 text-start text-sm transition-colors hover:bg-secondary/50"
                        >
                          {doneActions.has(i) ? (
                            <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                          ) : (
                            <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className={cn(doneActions.has(i) && "text-muted-foreground line-through")}>{action}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {briefing.warnings.length > 0 && (
                <div className="space-y-1">
                  {briefing.warnings.map((w, i) => (
                    <p key={i} className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Prospect Mode extra: mark this prospect as visited. */}
              {briefing.isProspect && selectedProspectId && (
                <Button
                  variant="secondary"
                  className="h-11 gap-2"
                  onClick={() => statusMutation.mutate({ id: selectedProspectId, status: "VISITED" })}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  {t("copilot.markVisited")}
                </Button>
              )}
            </div>
          ) : null}

          {/* ——— Contextual chat ——— */}
          <div className="glass-card glow-ai rise-in rise-d1 flex flex-col p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="crystal-badge h-7 w-7 bg-ai/15 text-ai">
                <Bot className="h-3.5 w-3.5" />
              </span>
              {t("copilot.chatTitle")}
            </h3>

            {chatMessages.length > 0 && (
              <div className="mb-3 max-h-80 space-y-3 overflow-y-auto">
                {chatMessages.map((m, i) => (
                  <div key={i} className={cn("rise-in flex gap-2", m.role === "user" && "flex-row-reverse")}>
                    <span
                      className={cn(
                        "crystal-badge h-6 w-6 shrink-0",
                        m.role === "user" ? "bg-primary/15 text-primary" : "bg-ai/15 text-ai",
                      )}
                    >
                      {m.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                    </span>
                    <p
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
                        m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background/60",
                      )}
                    >
                      {m.content}
                    </p>
                  </div>
                ))}
                {chatMutation.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="h-3.5 w-3.5" /> {t("copilot.thinking")}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat(chatInput);
                  }
                }}
                placeholder={t("copilot.chatPlaceholder")}
                disabled={chatMutation.isPending}
                className="h-11 bg-card/80 backdrop-blur-sm"
              />
              <Button
                onClick={() => sendChat(chatInput)}
                disabled={chatMutation.isPending || !chatInput.trim()}
                className="h-11 w-11 shrink-0 bg-ai p-0 hover:bg-ai/90"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", muted && "text-sm font-normal text-muted-foreground")}>{value}</p>
    </div>
  );
}

function BigNumber({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-lg bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
