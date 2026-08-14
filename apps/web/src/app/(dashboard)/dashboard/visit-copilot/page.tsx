"use client";

import { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
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
import { ApiError, isTrialFeatureLocked } from "@/lib/api-client";
import { useTranslation } from "@/components/translation-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Daily360SummaryModal } from "@/components/visit-copilot/daily-360-summary-modal";
import type {
  VisitCopilotChatMessage,
  VisitCopilotDiscoveryCustomer,
  VisitCopilotPeriod,
  VisitCopilotPlanMode,
  VisitCopilotPlanResult,
  VisitCopilotProspect,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Flexible plan date (2026-07-30, explicit product request) — helpers kept
// local to this page since nothing else needs "today in YYYY-MM-DD" or
// "is this date in the future" outside Visit Copilot's own plan/list view.
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function isFuturePlanDate(dateIso: string): boolean {
  return dateIso > todayIsoDate();
}
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
const GoogleProspectScanMap = dynamic(() => import("@/components/visit-copilot/google-prospect-scan-map").then((m) => m.GoogleProspectScanMap), {
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

// useSearchParams() requires a Suspense boundary above it in the App
// Router (same pattern as dashboard/assistant/page.tsx's ?context= deep
// link) — this wrapper is that boundary. The actual page lives in
// VisitCopilotScreen below.
export default function VisitCopilotPage() {
  return (
    <Suspense fallback={null}>
      <VisitCopilotScreen />
    </Suspense>
  );
}

function VisitCopilotScreen() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  // Scan orchestration remains backend work. This view-only seam is set by a
  // future Prospect Scan flow and intentionally keeps the two map datasets apart.
  const scanLat = Number(searchParams.get("scanLat"));
  const scanLon = Number(searchParams.get("scanLon"));
  const isProspectScanMode = searchParams.get("mapMode") === "prospect-scan" && Number.isFinite(scanLat) && Number.isFinite(scanLon);
  const hasGoogleMapsUiKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  // Flexible plan date (2026-07-30, explicit product request): defaults to
  // today on every fresh entry, but if the screen was opened from a link
  // or context carrying an explicit ?date=YYYY-MM-DD, that date wins over
  // today — read once at mount via useState's lazy initializer, same as
  // any other "seed from URL" pattern; the date picker below is still the
  // single source of truth for changes after that.
  const [planDate, setPlanDate] = useState<string>(() => {
    const fromUrl = searchParams.get("date");
    return fromUrl && ISO_DATE_RE.test(fromUrl) ? fromUrl : todayIsoDate();
  });
  // Pre-Planning Mode vs. Today Execution Mode — the one flag every
  // execution-blocking check in this screen reads.
  const isPlanningMode = isFuturePlanDate(planDate);

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
  const [minimumProspectScore, setMinimumProspectScore] = useState("");
  const [prospectSort, setProspectSort] = useState<"PROSPECT_SCORE" | "CATALOG_FIT">("PROSPECT_SCORE");
  const [scheduledProspectDates, setScheduledProspectDates] = useState<Record<string, string>>({});
  const [collapsedProspectGroups, setCollapsedProspectGroups] = useState<Set<string>>(new Set());
  const [expandedProspects, setExpandedProspects] = useState<Set<string>>(new Set());
  const [latestGoogleProspects, setLatestGoogleProspects] = useState<VisitCopilotProspect[]>([]);

  const [chatMessages, setChatMessages] = useState<VisitCopilotChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [doneActions, setDoneActions] = useState<Set<number>>(new Set());

  // "ملخص اليوم 360°" (2026-07-28) — its own modal, opened on demand; the
  // query inside Daily360SummaryModal only runs while this is true, and the
  // button itself is disabled while a fetch is already in flight to
  // prevent double-click/repeat generation (see the Button below).
  const [show360Summary, setShow360Summary] = useState(false);

  const customPeriodReady = period !== "custom" || (!!from && !!to);
  const periodParams = {
    period,
    from: period === "custom" && from ? from : undefined,
    to: period === "custom" && to ? to : undefined,
  };

  // planDate is part of the query key (React Query keys off it), so
  // changing the date automatically supersedes any in-flight daily-brief
  // request for the old date — React Query never applies a stale response
  // to the current key once the key has moved on, which is what satisfies
  // "cancel/ignore any previous request when the date changes."
  const briefQuery = useQuery({
    queryKey: ["visit-copilot", "daily-brief", period, from, to, vanStock, planDate],
    queryFn: ({ signal }) => visitCopilotApi.dailyBrief({ ...periodParams, date: planDate }, signal),
    enabled: customPeriodReady,
  });

  // The map is driven only by the freshly resolved daily route, never by
  // customer data retained from a previous date.
  const dailyRouteCustomers = briefQuery.data?.date === planDate ? briefQuery.data.customers : undefined;
  const dailyRouteCustomerCodes = useMemo(
    () => dailyRouteCustomers?.map((customer) => customer.customerCode) ?? [],
    [dailyRouteCustomers],
  );
  const mapCustomers = useMemo<VisitCopilotDiscoveryCustomer[]>(
    () =>
      (dailyRouteCustomers ?? [])
        .filter((customer) => customer.lat !== null && customer.lon !== null)
        .map((customer) => ({
          customerCode: customer.customerCode,
          name: customer.customerName,
          lat: customer.lat!,
          lon: customer.lon!,
          channel: customer.channel ?? "",
          status: "existing",
        })),
    [dailyRouteCustomers],
  );

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
    onSuccess: (data) => {
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      // Local Decision Layer resolved a DIFFERENT customer than the one the
      // request was scoped to (message named another customer by code/name)
      // — move Visit Mode's own selected-customer state to match, so the
      // briefing panel/header/map reflect who the chat is now about instead
      // of silently drifting from the reply text.
      if (data.activeCustomerCode && data.activeCustomerCode !== selectedCode) {
        setSelectedCode(data.activeCustomerCode);
      }
    },
    onError: (error) =>
      toast.error(
        isTrialFeatureLocked(error)
          ? ((locale === "ar" ? error.messageAr : error.message) ?? error.message)
          : error instanceof ApiError
            ? error.message
            : t("copilot.chatError"),
      ),
  });

  // ——— Phase 2: Discovery queries/mutations ———
  const discoveryQuery = useQuery({
    // Keep the Discovery map on the same selected daily route as the brief.
    // Including planDate in both the key and request discards stale markers
    // when the rep switches dates.
    queryKey: ["visit-copilot", "discovery", period, from, to, planDate, dailyRouteCustomerCodes, minimumProspectScore],
    queryFn: ({ signal }) => visitCopilotApi.discovery({ ...periodParams, date: planDate, minimumScore: minimumProspectScore === "" ? undefined : Number(minimumProspectScore) }, signal),
    // Wait for daily-brief for this date before fetching map data. React
    // Query aborts either request through the forwarded signal on fast date
    // changes, so an old route cannot repopulate the map.
    enabled: showDiscovery && customPeriodReady && dailyRouteCustomers !== undefined && dailyRouteCustomers.length > 0,
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

  const prospectVisitMutation = useMutation({
    mutationFn: visitCopilotApi.createProspectVisit,
    onSuccess: () => toast.success(t("copilot.prospectVisitAdded")),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("copilot.prospectVisitError")),
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
      setLatestGoogleProspects(data.prospects.filter((prospect) => prospect.source === "GOOGLE"));
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
  // Changing the plan date is a full context switch — the old plan
  // ordering, any open Visit Mode target, and the in-progress chat all
  // belonged to the previous date and would be misleading if left showing
  // under the new one. briefQuery/discoveryQuery/routeOppQuery all key off
  // planDate already, so React Query drops the stale in-flight request for
  // the old date on its own once the key changes.
  function changePlanDate(next: string) {
    setPlanDate(next);
    setPlan(null);
    setSelectedCode(null);
    setSelectedProspectId(null);
    setChatMessages([]);
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
    planMutation.mutate({ mode, ...periodParams, date: planDate });
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
  const discoveryProspects = useMemo(() => {
    const rows = new globalThis.Map<string, VisitCopilotProspect>((discoveryQuery.data?.prospects ?? []).map((prospect) => [prospect.id, prospect]));
    latestGoogleProspects.forEach((prospect) => rows.set(prospect.id, prospect));
    return [...rows.values()].sort((a, b) => prospectSort === "CATALOG_FIT"
      ? (b.catalogFitScore ?? -1) - (a.catalogFitScore ?? -1)
      : b.priorityScore - a.priorityScore);
  }, [discoveryQuery.data?.prospects, latestGoogleProspects, prospectSort]);
  const prospectGroups = useMemo(() => {
    const groups = [{ key: "HOTELS", label: t("copilot.businessHotels"), prospects: [] as typeof discoveryProspects }, { key: "RESTAURANTS", label: t("copilot.businessRestaurants"), prospects: [] as typeof discoveryProspects }, { key: "CAFES", label: t("copilot.businessCafes"), prospects: [] as typeof discoveryProspects }, { key: "OTHER", label: t("copilot.businessOther"), prospects: [] as typeof discoveryProspects }];
    for (const prospect of discoveryProspects) groups[prospect.businessType === "hotel" ? 0 : prospect.businessType === "restaurant" ? 1 : prospect.businessType === "cafe" || prospect.businessType === "coffee_shop" ? 2 : 3]!.prospects.push(prospect);
    return groups.filter((group) => group.prospects.length > 0);
  }, [discoveryProspects, t]);

  function createProspectVisit(prospectId: string, scheduledFor: string) {
    if (!scheduledFor || prospectVisitMutation.isPending) return;
    prospectVisitMutation.mutate({ prospectId, scheduledFor });
  }

  return (
    <div className="relative space-y-6 max-md:space-y-3">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="crystal-badge h-11 w-11 bg-ai/15 text-ai drop-shadow-[0_0_20px_hsl(var(--ai)/0.4)]">
              <Compass className="h-5 w-5" />
            </span>
            {t("copilot.title")}
            {/* Today Execution Mode vs. Pre-Planning Mode — the one visible,
                unambiguous marker required whenever the selected plan date
                isn't today (see planDate/isPlanningMode above). */}
            {isPlanningMode ? (
              <Badge className="gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:bg-amber-400/15 dark:text-amber-300">
                <CalendarClock className="h-3.5 w-3.5" />
                {t("copilot.planningModeBadge")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {t("copilot.executionModeBadge")}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">{t("copilot.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:w-full">
          {/* "ملخص اليوم 360°" — visible and reachable from the top of the
              screen at all times, per the acceptance criteria. */}
          <Button
            variant="secondary"
            className="glow-ai h-11 gap-2 max-md:h-10 max-md:flex-1 max-md:px-3 max-md:text-xs"
            onClick={() => setShow360Summary(true)}
            disabled={show360Summary}
          >
            <Sparkles className="h-4 w-4 text-ai" />
            {t("copilot.summary360Button")}
          </Button>
          {/* Persistent Discovery toggle — never auto-opens the section. */}
          <Button
            variant={showDiscovery ? "default" : "secondary"}
            className="h-11 gap-2 max-md:h-10 max-md:flex-1 max-md:px-3 max-md:text-xs"
            onClick={() => {
              setShowDiscovery(true);
              searchGoogleAround();
            }}
          >
            <Search className="h-4 w-4" />
            {t("copilot.discoverButton")}
          </Button>
        </div>
      </div>

      <Daily360SummaryModal
        open={show360Summary}
        onOpenChange={setShow360Summary}
        period={period}
        selectedDate={planDate}
        from={period === "custom" && from ? from : undefined}
        to={period === "custom" && to ? to : undefined}
      />

      {/* Global controls — small, always visible (they also drive Visit Mode). */}
      <div className="glass-card rise-in rise-d1 flex flex-wrap items-end gap-4 p-4 max-md:gap-2.5 max-md:p-3">
        <div className="grid gap-1.5 max-md:min-w-[140px] max-md:flex-1">
          <Label className="text-xs">{t("copilot.planDateLabel")}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={planDate}
              onChange={(e) => e.target.value && changePlanDate(e.target.value)}
              className="h-11 w-40 max-md:h-10 max-md:w-full"
            />
            {planDate !== todayIsoDate() && (
              <Button type="button" variant="ghost" size="sm" className="h-11" onClick={() => changePlanDate(todayIsoDate())}>
                {t("copilot.planDateToday")}
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-1.5 max-md:min-w-[140px] max-md:flex-1">
          <Label className="text-xs">{t("copilot.periodLabel")}</Label>
          <Select value={period} onValueChange={(v) => changePeriod(v as VisitCopilotPeriod)}>
            <SelectTrigger className="h-11 w-40 max-md:h-10 max-md:w-full">
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
            <div className="grid gap-1.5 max-md:min-w-[140px] max-md:flex-1">
              <Label className="text-xs">{t("copilot.fromLabel")}</Label>
              <Input type="date" value={from} onChange={(e) => changeFrom(e.target.value)} className="h-11 w-40 max-md:h-10 max-md:w-full" />
            </div>
            <div className="grid gap-1.5 max-md:min-w-[140px] max-md:flex-1">
              <Label className="text-xs">{t("copilot.toLabel")}</Label>
              <Input type="date" value={to} onChange={(e) => changeTo(e.target.value)} className="h-11 w-40 max-md:h-10 max-md:w-full" />
            </div>
          </>
        )}
        <label className="flex h-11 items-center gap-2 text-sm max-md:h-10 max-md:text-xs">
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
                  className="h-11 gap-2 max-md:h-10 max-md:flex-1 max-md:px-3 max-md:text-xs"
                  onClick={searchGoogleAround}
                  disabled={googleSearchMutation.isPending || discoveryQuery.isLoading}
                >
                  {googleSearchMutation.isPending ? <Spinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
                  {t("copilot.googleSearchButton")}
                </Button>
              </div>

              {dailyRouteCustomers?.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("copilot.noCustomersForDate", { weekday: briefQuery.data?.weekday ?? "" })}</p>
              ) : discoveryQuery.isLoading ? (
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
                  {isProspectScanMode && hasGoogleMapsUiKey ? (
                    <GoogleProspectScanMap
                      scanCenter={{ lat: scanLat, lng: scanLon }}
                      prospects={discoveryQuery.data.prospects.filter((prospect) => prospect.source === "GOOGLE")}
                    />
                  ) : (
                    <DiscoveryMap
                      customers={mapCustomers}
                      prospects={discoveryQuery.data.prospects.filter((prospect) => prospect.source !== "GOOGLE")}
                      onStartVisit={openProspectVisit}
                      onIgnore={(id) => statusMutation.mutate({ id, status: "IGNORED" })}
                    />
                  )}
                  <div className="space-y-3 border-t pt-3">
                    <div className="flex flex-wrap gap-2">
                      <Input className="w-40" type="number" min="0" max="100" placeholder={t("copilot.minProspectScore")} value={minimumProspectScore} onChange={(event) => setMinimumProspectScore(event.target.value)} />
                      <Select value={prospectSort} onValueChange={(value) => setProspectSort(value as "PROSPECT_SCORE" | "CATALOG_FIT")}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PROSPECT_SCORE">{t("copilot.sortProspectScore")}</SelectItem>
                          <SelectItem value="CATALOG_FIT">{t("copilot.sortCatalogFit")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => setCollapsedProspectGroups(new Set(prospectGroups.map((group) => group.key)))}>{t("copilot.collapseAll")}</Button>
                      <Button size="sm" variant="outline" onClick={() => setCollapsedProspectGroups(new Set())}>{t("copilot.expandAll")}</Button>
                    </div>
                    {prospectGroups.map((group) => (
                      <div key={group.key} className="space-y-2">
                        <button className="w-full text-left text-sm font-semibold" onClick={() => setCollapsedProspectGroups((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>{group.label} ({group.prospects.length})</button>
                        {!collapsedProspectGroups.has(group.key) && group.prospects.map((prospect) => {
                    const scheduledFor = scheduledProspectDates[prospect.id] ?? "";
                    const expanded = expandedProspects.has(prospect.id);
                      return (
                        <div key={prospect.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            {prospect.photo?.url && <div className="w-16 shrink-0"><img src={prospect.photo.url} alt={prospect.name} loading="lazy" className="h-16 w-16 rounded-md object-cover" />{prospect.photo.attribution && <p className="mt-1 text-[10px] text-muted-foreground">{t("copilot.photoAttribution", { attribution: prospect.photo.attribution })}</p>}</div>}
                            <div>
                              <p className="font-semibold">{prospect.name}</p>
                              <p className="text-xs text-muted-foreground">{prospect.businessType ?? t("copilot.businessTypeUnavailable")}</p>
                              {prospect.address && <p className="text-xs text-muted-foreground">{prospect.address}</p>}
                              {prospect.distanceKm !== null && prospect.distanceKm !== undefined && <p className="text-xs text-muted-foreground">{prospect.distanceKm.toFixed(1)} km</p>}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Badge>{t("copilot.prospectScore", { value: prospect.priorityScore.toFixed(0) })}</Badge>
                              <Badge variant="outline">{t("copilot.analysisConfidence", { value: prospect.scoreConfidence?.toFixed(0) ?? "—" })}</Badge>
                              <Badge variant="secondary">{t("copilot.catalogFit", { value: prospect.catalogFitScore === null || prospect.catalogFitScore === undefined ? t("copilot.notCalculated") : `${prospect.catalogFitScore.toFixed(0)}/100` })}</Badge>
                              {prospect.commercialTier && <Badge variant="outline">{prospect.commercialTier}</Badge>}
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{prospect.reason}</p>
                          {prospect.nearbyBestSellers !== undefined ? (
                            <div className="mt-2 space-y-1 text-xs">
                              <p className="font-medium">{t("copilot.topSellingNearby")}</p>
                              {prospect.nearbyBestSellers.length > 0 ? prospect.nearbyBestSellers.map((product) => <p key={product.productCode}><span className="font-medium">{product.productName}</span>{` ${t("copilot.soldToNearbyCustomers", { count: product.nearbyCustomerCount })}`}</p>) : <p>{t("copilot.notEnoughLocalSalesData")}</p>}
                              {prospect.nearbyBestSellers.length > 0 && <p className="text-muted-foreground">{t("copilot.basedOnNearbyCustomers", { count: prospect.nearbySalesCustomerCount ?? 0 })}</p>}
                            </div>
                          ) : prospect.productFit && prospect.productFit.length > 0 && (
                            <div className="mt-2 space-y-1 text-xs">
                              <p className="font-medium">{t("copilot.salesOpportunity")}</p>
                              {prospect.productFit.slice(0, 3).map((product) => <p key={product.productCode}><span className="font-medium">{product.productName}</span>{product.reasons.length ? ` — ${product.reasons.join("، ")}` : ""}</p>)}
                            </div>
                          )}
                          {expanded && <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground"><p>{prospect.address || t("copilot.addressUnavailable")}</p><p>{t("copilot.dataSource", { source: prospect.source === "GOOGLE" ? "Google" : "OpenStreetMap" })}</p><p>{t("copilot.whyThisProspect", { reason: prospect.reason })}</p>{prospect.productFit?.flatMap((product) => product.reasons).slice(0, 3).map((reason, index) => <p key={`${reason}-${index}`}>• {reason}</p>)}</div>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${prospect.lat},${prospect.lon}`)}${prospect.source === "GOOGLE" && prospect.externalKey ? `&query_place_id=${encodeURIComponent(prospect.externalKey)}` : ""}`, "_blank", "noopener,noreferrer")}>{t("copilot.directions")}</Button>
                            {prospect.phone && <Button size="sm" variant="outline" onClick={() => window.location.href = `tel:${prospect.phone}`}>{t("copilot.call")}</Button>}
                            <Button size="sm" variant="outline" onClick={() => setExpandedProspects((current) => { const next = new Set(current); if (next.has(prospect.id)) next.delete(prospect.id); else next.add(prospect.id); return next; })}>{expanded ? t("copilot.hideDetails") : t("copilot.details")}</Button>
                            <Button size="sm" onClick={() => createProspectVisit(prospect.id, todayIsoDate())} disabled={prospectVisitMutation.isPending}>{t("copilot.addToday")}</Button>
                            <Input className="w-40" type="date" min={todayIsoDate()} value={scheduledFor} onChange={(event) => setScheduledProspectDates((current) => ({ ...current, [prospect.id]: event.target.value }))} />
                            <Button size="sm" variant="secondary" onClick={() => createProspectVisit(prospect.id, scheduledFor)} disabled={!scheduledFor || prospectVisitMutation.isPending}>{t("copilot.scheduleLater")}</Button>
                          </div>
                        </div>
                      );
                        })}
                      </div>
                    ))}
                  </div>
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
              <div className="glass-hero rise-in relative p-5 max-md:p-3">
                <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
                <div className="relative space-y-4 max-md:space-y-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-semibold max-md:text-base">{brief.weekday}</span>
                    <span className="text-sm text-muted-foreground">{brief.date}</span>
                  </div>
                  {!brief.isWorkingDay && <p className="text-xs text-muted-foreground">{t("copilot.notWorkingDay")}</p>}

                  {/* Pre-Planning Mode notice — required whenever the
                      selected date is in the future: honest framing that
                      this list is a projection from the recurring weekly
                      visit pattern (Customers.VisitDay), not a dated
                      assignment, and that no real visit can be logged yet. */}
                  {isPlanningMode && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                      <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {t("copilot.planningModeNotice")}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 max-md:gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
                      className="h-12 max-md:h-10 max-md:text-xs"
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
                      className="h-12 max-md:h-10 max-md:text-xs"
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
                  <Button variant="secondary" className="h-11 gap-2 max-md:h-10 max-md:flex-1 max-md:px-3 max-md:text-xs" onClick={() => setShowDiscovery(true)}>
                    <Map className="h-4 w-4" />
                    {t("copilot.oppShowMap")}
                  </Button>
                </div>
              )}

              {/* ——— Customer list ——— */}
              <div className="glass-card rise-in rise-d1 p-4 max-md:p-3">
                <h2 className="mb-3 text-sm font-semibold max-md:mb-2">{t("copilot.customersTitle")}</h2>
                {customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {isPlanningMode ? t("copilot.noCustomersForDate", { weekday: brief?.weekday ?? "" }) : t("copilot.noCustomers")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {customers.map((c) => (
                      <li key={c.customerCode}>
                        <button
                          onClick={() => openVisit(c.customerCode)}
                          className="flex w-full items-center gap-3 px-1 py-3 text-start transition-colors hover:bg-secondary/50 max-md:gap-2 max-md:py-2"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold max-md:h-7 max-md:w-7 max-md:text-xs">
                            {c.visitSequence}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium max-md:text-[13px]">{c.customerName}</span>
                            <span className="block text-xs text-muted-foreground">
                              {t("copilot.avgOrder", { value: c.avgOrderValue.toLocaleString() })}
                            </span>
                          </span>
                          <Badge variant="secondary" className="shrink-0">
                            {c.channel}
                          </Badge>
                          <span
                            className={cn(
                              "flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold max-md:h-7 max-md:w-8 max-md:text-[11px]",
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
                <div className="rounded-lg bg-background/60 p-3 max-md:p-2">
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
                {briefing.diagnosis && (
                  <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">
                    <p className="font-medium">التشخيص: {briefing.diagnosis.diagnosis}</p>
                    {briefing.diagnosis.confidence && <p className="mt-1 text-xs text-muted-foreground">الثقة: {briefing.diagnosis.confidence}</p>}
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {briefing.diagnosis.evidence.map((evidence, index) => <li key={index}>• {evidence}</li>)}
                    </ul>
                  </div>
                )}
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

              {/* Prospect Mode extra: mark this prospect as visited — the
                  one "log an actual visit" action in this screen, so it's
                  the one gated by Pre-Planning Mode (requirement: view/
                  analyze/prepare stay available, but no real visit can be
                  started or logged for a date that hasn't happened yet). */}
              {briefing.isProspect && selectedProspectId && (
                isPlanningMode ? (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t("copilot.startVisitBlockedFuture")}
                  </p>
                ) : (
                  <Button
                    variant="secondary"
                    className="h-11 gap-2 max-md:h-10 max-md:flex-1 max-md:px-3 max-md:text-xs"
                    onClick={() => statusMutation.mutate({ id: selectedProspectId, status: "VISITED" })}
                    disabled={statusMutation.isPending}
                  >
                    {statusMutation.isPending ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {t("copilot.markVisited")}
                  </Button>
                )
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
    <div className="rounded-lg bg-background/60 p-3 max-md:p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold max-md:text-base", muted && "text-sm font-normal text-muted-foreground")}>{value}</p>
    </div>
  );
}

function BigNumber({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-lg bg-background/60 p-3 max-md:p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
