"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Clock, RefreshCw, Settings2, Target } from "lucide-react";
import { toast } from "sonner";
import { sgiApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { buildAssistantDeepLink, toSgiContext } from "@/lib/sgi-context";
import type { SgiSituation } from "@/lib/types";
import { useTranslation } from "@/components/translation-provider";
import { PriorityCenter } from "./priority-tree";

// Sales Growth Intelligence (SGI) Phase 1 — "How to Increase Your Sales",
// trimmed to the 3 sections the product owner picked for v1 (see
// docs/SGI_ROADMAP.md): Monthly Goal, today's biggest win-back opportunities
// (a lost or declining customer IS a revenue-recovery opportunity), and
// today's risks (money not collected, a rep falling behind pace, a customer
// gone fully dormant). The other 7 sections from the full vision brief and
// Phases 2-5 (playbooks, Executive Coach, Sales Memory, voice) are deferred.
//
// Migration #8 (ADR-001 / RIE Migration Plan) — the file/column mapping
// form (sales file + collection file pickers, 7 ColumnSelects) is gone.
// Sales/collection data now resolves automatically via RieFacade; the only
// remaining input is the date window. TARGET_BEHIND still reads Prisma
// Target unchanged (explicit product decision — see PROJECT_LOG.md), so
// the Targets screen itself is untouched by this migration.
//
// Config UI (date window + recalculate button) is COMPANY_ADMIN / MANAGER
// only, matching the backend's @Auth gate on POST /sgi/recalculate — this
// sets numbers every rep gets judged against, same reasoning as
// targets.controller.ts. Every role can view the latest computed situations,
// narrowed server-side to their own team (see sgi.service.ts's getLatest).
//
// Architecture: this page is a pure, thin CONSUMER of SgiService — it holds
// zero business logic (no situation detection, no scoring, no thresholds,
// no summarization). It only renders whatever /sgi/latest already
// computed, INCLUDING its opening "briefing" sentence, which SgiService
// generates itself (see sgi.service.ts's buildBriefing) — not this page,
// not the Assistant. For admins it offers two ways to refresh the data:
// the no-form "تحديث الآن" (recalculate-now, freshly computes "this month
// vs last month" — the everyday path) and an explicit date-window form
// (recalculate, only needed to pick a custom period). The Assistant chat is
// the other consumer of the exact same SgiService — see
// assistant.service.ts's get_sales_growth_situations tool, which relays the
// same `briefing` field rather than composing its own. "ناقشني" hands a
// situation's context to the Assistant as a typed SGIContext object (see
// lib/sgi-context.ts) through a generic /dashboard/assistant?context=...
// deep link — the same reusable mechanism any future SGI consumer (Customer
// 360, Daily Mission, Visit Planning, Voice) can use. Still zero business
// logic added here.
//
// The situations themselves render via <PriorityCenter> (priority-tree.tsx)
// — a hierarchical "Priority Center" (Sector -> Rep -> Priorities for
// admins/managers, Rep -> Priorities for supervisors, a flat list for
// reps). Same rule applies there: pure presentation over SgiService's
// already-computed situations, no new logic.

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function SalesGrowthPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canConfigure = user?.role.code === "COMPANY_ADMIN" || user?.role.code === "MANAGER";

  const latestQuery = useQuery({ queryKey: ["sgi", "latest"], queryFn: sgiApi.latest });

  // The date-window form is collapsed by default once a result exists — it
  // only needs to appear for first-time setup (handled below via
  // `formVisible`) or when an admin explicitly asks to pick a custom period.
  const [showSetupForm, setShowSetupForm] = useState(false);

  const [periodMonth, setPeriodMonth] = useState(currentPeriodMonth());
  const [dateFrom, setDateFrom] = useState(`${currentPeriodMonth()}-01`);
  const [dateTo, setDateTo] = useState(todayIsoDate());
  const [priorDateFrom, setPriorDateFrom] = useState("");
  const [priorDateTo, setPriorDateTo] = useState("");

  const recalculateMutation = useMutation({
    mutationFn: sgiApi.recalculate,
    onSuccess: (data) => {
      // Refetch through the real GET /sgi/latest path instead of hand-
      // seeding the cache with the raw recalculate response — the raw
      // response is the unfiltered, company-wide result and is missing
      // fields getLatest() computes separately (repDirectory, and a
      // viewer-scoped briefing), so seeding it directly used to leave the
      // Priority Center without rep/supervisor names until the next
      // natural refetch.
      queryClient.invalidateQueries({ queryKey: ["sgi", "latest"] });
      toast.success(t("sgi.toastRecalculateSuccess", { count: data.situations.length, highCount: data.summary.highSeverityCount }));
      setShowSetupForm(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("sgi.toastRecalculateError")),
  });

  // Day-to-day refresh — no form, freshly computes "this month so far vs.
  // last month" server-side (see sgi.controller.ts's recalculate-now). This
  // is the button admins actually use after the first setup.
  const recalculateNowMutation = useMutation({
    mutationFn: sgiApi.recalculateNow,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgi", "latest"] });
      toast.success(t("sgi.toastRecalculateNowSuccess", { count: data.situations.length, highCount: data.summary.highSeverityCount }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("sgi.toastRecalculateNowError")),
  });

  const canRecalculate = !!periodMonth && !!dateFrom && !!dateTo && !!priorDateFrom && !!priorDateTo;

  function handleRecalculate() {
    recalculateMutation.mutate({ periodMonth, dateFrom, dateTo, priorDateFrom, priorDateTo });
  }

  const result = latestQuery.data;

  // First-time setup: no result yet, so the form must show — there's
  // nothing else to render. After that, it only reappears if the admin
  // explicitly asks to pick a custom period (showSetupForm).
  const formVisible = canConfigure && (showSetupForm || (!latestQuery.isLoading && !result));

  // Hands this situation's context to the Assistant chat so "ناقشني" opens
  // a reactive conversation about the exact same decision, without the
  // user retyping it. Builds the shared SGIContext object (toSgiContext)
  // and navigates through the generic deep link (buildAssistantDeepLink) —
  // the same mechanism any future module can use, not something specific
  // to this screen. Still zero business logic: purely reshaping and
  // navigating with data SgiService already computed.
  function discussSituation(s: SgiSituation) {
    const context = toSgiContext(s, "sales-growth", result?.generatedAt ?? new Date().toISOString());
    router.push(buildAssistantDeepLink(context));
  }

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="crystal-badge h-11 w-11 bg-primary/15 text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <Target className="h-5 w-5" />
          </span>
          {t("sgi.title")}
        </h1>
        <p className="text-muted-foreground">{t("sgi.subtitle")}</p>
      </div>

      {formVisible && (
        <Card className="glass-card rise-in rise-d1">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{result ? t("sgi.setupCardTitleCustomPeriod") : t("sgi.setupCardTitleFirstTime")}</CardTitle>
            {result && (
              <Button variant="ghost" size="sm" onClick={() => setShowSetupForm(false)}>
                {t("sgi.cancel")}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3 sm:max-w-2xl">
              <div className="grid gap-2">
                <Label>{t("sgi.targetMonthLabel")}</Label>
                <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{t("sgi.dateFromLabel")}</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{t("sgi.dateToLabel")}</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{t("sgi.priorDateFromLabel")}</Label>
                <Input type="date" value={priorDateFrom} onChange={(e) => setPriorDateFrom(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{t("sgi.priorDateToLabel")}</Label>
                <Input type="date" value={priorDateTo} onChange={(e) => setPriorDateTo(e.target.value)} />
              </div>
            </div>

            <Button disabled={!canRecalculate || recalculateMutation.isPending} onClick={handleRecalculate}>
              {recalculateMutation.isPending ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t("sgi.calculateNow")}
            </Button>
          </CardContent>
        </Card>
      )}

      {latestQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : latestQuery.isError ? (
        <Card className="glass-card">
          <CardContent className="py-8 text-center text-sm text-destructive">{t("sgi.loadErrorMessage")}</CardContent>
        </Card>
      ) : !result ? (
        !formVisible ? (
          <Card className="glass-card">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("sgi.emptyStateMessage")}</CardContent>
          </Card>
        ) : null
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {t("sgi.lastUpdatedPrefix", { date: new Date(result.generatedAt).toLocaleString("ar-EG") })}
              {result.scopedToOwnTeam && t("sgi.scopedToOwnTeamSuffix")}
            </p>
            {canConfigure && !showSetupForm && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => recalculateNowMutation.mutate()} disabled={recalculateNowMutation.isPending}>
                  {recalculateNowMutation.isPending ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {t("sgi.refreshNow")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowSetupForm(true)}>
                  <Settings2 className="h-3.5 w-3.5" /> {t("sgi.customPeriod")}
                </Button>
              </div>
            )}
          </div>

          {/* Conversational opener — SgiService's own briefing text
              (result.briefing), rendered as-is. No summarization happens
              in this component; see sgi.service.ts's buildBriefing. This is
              the screen's single primary AI insight, so it gets the Hero
              Glass treatment (Crystal AI Design Language) reserved for one
              element per screen. */}
          <div className="glass-hero rise-in relative flex items-start gap-3 p-5 sm:p-6">
            <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
            <span className="crystal-badge relative h-9 w-9 shrink-0 bg-ai/15 text-ai">
              <Bot className="h-4 w-4" />
            </span>
            <p className="relative whitespace-pre-wrap pt-1 text-sm leading-relaxed">{result.briefing}</p>
          </div>

          {result.warnings.length > 0 && (
            <div className="glow-warning space-y-1 rounded-md p-3 text-sm text-muted-foreground">
              {result.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {/* Section 1: Monthly Goal */}
          <Card className="glass-card rise-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="crystal-badge h-7 w-7 bg-primary/15 text-primary">
                  <Target className="h-4 w-4" />
                </span>
                {t("sgi.monthlyGoalTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.summary.monthlyGoal.targetTotal === null ? (
                <p className="text-sm text-muted-foreground">
                  {t("sgi.noTargetsMessage", { month: result.periodMonth, amount: formatAmount(result.summary.monthlyGoal.actualTotal) })}
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">
                      {t("sgi.progressOf", {
                        actual: formatAmount(result.summary.monthlyGoal.actualTotal),
                        target: formatAmount(result.summary.monthlyGoal.targetTotal),
                      })}
                    </span>
                    <span className="text-muted-foreground">{result.summary.monthlyGoal.progressPct}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${
                        (result.summary.monthlyGoal.progressPct ?? 0) >= 90
                          ? "bg-success"
                          : (result.summary.monthlyGoal.progressPct ?? 0) >= 60
                            ? "bg-warning"
                            : "bg-destructive"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, result.summary.monthlyGoal.progressPct ?? 0))}%` }}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Priority Center — hierarchical Sector/Rep/Priorities
              navigation (see priority-tree.tsx). Same underlying situations,
              just organized the way a manager/supervisor/rep actually
              thinks. glow-ai marks this as the screen's core AI-generated
              recommendation surface (Crystal AI Design Language). */}
          <Card className="glass-card glow-ai rise-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="crystal-badge h-7 w-7 bg-ai/15 text-ai">
                  <Bot className="h-4 w-4" />
                </span>
                {t("sgi.priorityCenterTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PriorityCenter situations={result.situations} repDirectory={result.repDirectory} roleCode={user?.role.code ?? ""} onDiscuss={discussSituation} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
