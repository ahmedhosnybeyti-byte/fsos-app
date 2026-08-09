"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Bot, Flame, Target, Zap, Clock, BarChart3, CircleDollarSign, ClipboardCheck, Package, ReceiptText, RefreshCw, RotateCcw, TrendingDown, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filesApi, subscriptionsApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { SubscriptionStatusCard, STATUS_LABEL } from "@/components/dashboard/subscription-status-card";
import { AssistantEntryCard } from "@/components/dashboard/assistant-entry-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/components/translation-provider";
import { MODULE_BADGE_CLASSES } from "@/lib/module-colors";
import { formatDate } from "@/lib/utils";
import { dashboardPerformanceApi, type DashboardBenchmark, type DashboardMetric, type DashboardTarget } from "@/lib/api";

// FSOS Design Constitution §15.2 (Dashboard Pattern) — this screen must
// answer, within seconds: what's happening now, the most important
// indicator, whether there's a risk, whether there's an opportunity, and
// the first action to take. §6 (Screen Design Standards) orders content
// by priority: Hero → KPIs → analysis/AI → recommendations → actions.
//
// Data sources are unchanged from before the redesign: filesApi.list and
// subscriptionsApi.mine (the latter already fetched independently by
// SubscriptionStatusCard under the same query key — React Query dedupes
// the two calls into one network request, so this adds no new API usage).
export default function DashboardOverviewPage() {
  const [benchmark, setBenchmark] = useState<DashboardBenchmark>("previous-month");
  const performanceQuery = useQuery({ queryKey: ["dashboard-performance", benchmark], queryFn: () => dashboardPerformanceApi.get(benchmark) });
  const performance = performanceQuery.data;
  const cards = performance
    ? [["المبيعات بالقيمة", performance.metrics.sales, "currency", CircleDollarSign, "text-emerald-400", false], ["التحصيل", performance.metrics.collections, "currency", ClipboardCheck, "text-violet-400", false], ["عدد الفواتير", performance.metrics.invoices, "count", ReceiptText, "text-blue-400", false], ["العملاء المشترون", performance.metrics.customers, "count", Users, "text-orange-400", false], ["الأصناف المباعة", performance.metrics.skus, "count", Package, "text-cyan-400", false], ["المرتجعات بالقيمة", performance.metrics.returns, "currency", RotateCcw, "text-red-400", true]] as const
    : [];
  if (performanceQuery.isLoading) return <DashboardPerformanceLoading />;
  if (performanceQuery.isError || !performance) return <div className="glass-card p-8 text-center text-sm text-destructive">تعذر تحميل بيانات الأداء. حاول التحديث.</div>;
  const primaryTargets = performance.targets.filter((target) => target.primary);
  const secondaryTargets = performance.targets.filter((target) => !target.primary);
  return (
    <div dir="rtl" className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div className="glass-hero relative overflow-hidden p-5 sm:p-7"><div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" /><div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><BarChart3 className="text-primary" />لوحة الأداء والنمو</h1><p className="mt-1 text-sm text-muted-foreground">متابعة الأداء الفعلي مقابل المقارنة والأهداف المرحلية</p></div><div className="flex flex-wrap items-center gap-3"><Badge variant="outline" className="h-9 px-3 text-sm">أيام البيع: {performance.sellingDays.elapsed} / {performance.sellingDays.total}</Badge><div className="flex rounded-lg border border-border bg-background/30 p-1"><Button size="sm" variant={benchmark === "previous-month" ? "default" : "ghost"} onClick={() => setBenchmark("previous-month")}>الشهر الماضي</Button><Button size="sm" variant={benchmark === "previous-quarter-average" ? "default" : "ghost"} onClick={() => setBenchmark("previous-quarter-average")}>متوسط الكوارتر السابق</Button></div><Button size="icon" variant="outline" onClick={() => performanceQuery.refetch()} disabled={performanceQuery.isFetching}><RefreshCw className={performanceQuery.isFetching ? "animate-spin" : ""} /></Button></div></div></div>
      {performance.warnings.map((warning) => <div key={warning} className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{warning}</div>)}
      <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xl font-semibold">معدلات النمو (MTD)</h2><p className="text-sm text-muted-foreground">المقارنة حسب أول {performance.sellingDays.elapsed} أيام بيع فعلية</p></div><span className="text-xs text-muted-foreground">{benchmark === "previous-month" ? "مقابل الشهر الماضي" : "مقابل متوسط الكوارتر السابق"}</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([label, metric, unit, Icon, color, lowerBetter]) => <DashboardGrowthCard key={label} label={label} metric={metric} unit={unit} Icon={Icon} color={color} lowerBetter={lowerBetter} benchmarkType={benchmark} />)}</div></section>
      {primaryTargets.length > 0 && <DashboardTargetSection title="الأداء مقابل الهدف (حتى اليوم)" targets={primaryTargets} />}
      {secondaryTargets.length > 0 && <DashboardTargetSection title="أهداف إضافية" targets={secondaryTargets} />}
    </div>
  );

  /* Legacy overview content replaced by the performance dashboard.
  const { t } = useTranslation();
  const { user } = useAuth();
  // Wrapped in an arrow function (not passed directly) — filesApi.list takes
  // an optional companyId, which isn't structurally compatible with React
  // Query's QueryFunction context-argument signature.
  const { data: files, isLoading: filesLoading } = useQuery({ queryKey: ["files"], queryFn: () => filesApi.list() });
  const { data: subscription } = useQuery({ queryKey: ["subscriptions", "me"], queryFn: subscriptionsApi.mine });

  const activeFiles = files?.length ?? 0;
  const lastFile = files && files.length > 0 ? files.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : null;

  const trialDaysLeft =
    subscription?.status === "TRIAL" && subscription.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / 86_400_000))
      : null;

  const statusLine = subscription
    ? subscription.status === "TRIAL" && trialDaysLeft !== null
      ? t("dashboard.statusTrial", { days: trialDaysLeft })
      : subscription.status === "ACTIVE"
        ? t("dashboard.statusActive")
        : subscription.status === "EXPIRED"
          ? t("dashboard.statusExpired")
          : t("dashboard.statusSuspended")
    : null;

  // Which KPI gets the "featured" treatment (§5.4 hierarchy follow-up) —
  // picked from already-known real state, risk first, never a fabricated
  // ranking: a blocked/at-risk subscription outranks the trial countdown,
  // which outranks the neutral default (active files).
  const isBlocked = subscription?.status === "EXPIRED" || subscription?.status === "SUSPENDED";
  const featuredKpi: "subscription" | "trial" | "files" = isBlocked ? "subscription" : trialDaysLeft !== null && trialDaysLeft <= 5 ? "trial" : "files";

  return (
    <div className="relative space-y-4 sm:space-y-6">
      {/* Constitution §4.1 Cinematic Background — follow-up: fixed to the
          viewport (not just a band behind the Hero) so it reads as a real
          backdrop while scrolling, not a static strip. Still page-scoped
          (rendered by this component only) and still behind every card's
          own opaque glass fill. * /}
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      {/* Hero Section — §6.4: what's happening now + the primary next
          action. glass-hero (§14.6 Hero Glass) + .hero-aurora (§4.1 Aurora
          Lighting) + a diagonal glass reflection (glass-hero::after), all
          reserved for this single primary element. Follow-up: bigger
          badge/type scale and a large, very-low-opacity watermark icon so
          the right-hand whitespace reads as considered negative space
          around a "hero," not an empty gap — no new content/data (kept
          intentionally out of scope; see the redesign follow-up thread). * /}
      <div className="glass-hero rise-in flex flex-col gap-4 p-4 sm:gap-6 sm:p-7 sm:flex-row sm:items-center sm:justify-between md:p-10">
        <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
        <Zap
          aria-hidden
          className="pointer-events-none absolute -end-6 -top-10 hidden h-56 w-56 rotate-12 text-primary/[0.05] sm:block dark:text-primary/[0.08]"
        />
        <div className="relative flex items-center gap-3 sm:gap-5">
          <span className="crystal-badge relative hidden h-20 w-20 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_36px_hsl(var(--primary)/0.45)] sm:flex">
            <Zap className="h-9 w-9" />
          </span>
          <div className="space-y-2">
            <h1 className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
              {user ? t("dashboard.greeting", { name: user.fullName.split(" ")[0] ?? user.fullName }) : t("dashboard.greetingNoName")}
            </h1>
            {statusLine && <p className="text-sm text-muted-foreground sm:text-base">{statusLine}</p>}
          </div>
        </div>
        <Button
          asChild
          size="lg"
          className="relative h-11 w-fit shrink-0 px-5 text-sm sm:h-12 sm:px-8 sm:text-base shadow-[0_0_32px_-6px_hsl(var(--primary)/0.55)] hover:shadow-[0_0_44px_-6px_hsl(var(--primary)/0.7)] motion-safe:hover:-translate-y-0.5"
        >
          <Link href="/dashboard/assistant">{t("dashboard.heroCta")}</Link>
        </Button>
      </div>

      {/* KPI Row — §5.4: name, value, readable in two seconds. Trend/% change
          is intentionally omitted — see kpi-card.tsx's comment for why. * /}
      <div className="rise-in rise-d1 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filesLoading ? (
          <>
            <Skeleton className="h-[92px]" />
            <Skeleton className="h-[92px]" />
            <Skeleton className="h-[92px]" />
            <Skeleton className="h-[92px]" />
          </>
        ) : (
          <>
            <KpiCard
              icon={FileSpreadsheet}
              label={t("dashboard.kpiActiveFiles")}
              value={String(activeFiles)}
              glow="ai"
              tagLabel={featuredKpi === "files" ? "AI" : undefined}
              featured={featuredKpi === "files"}
            />
            <KpiCard
              icon={Clock}
              label={t("dashboard.kpiLastUpload")}
              value={lastFile ? formatDate(lastFile.createdAt) : t("dashboard.kpiLastUploadNone")}
            />
            {subscription && (
              <KpiCard
                icon={Bot}
                label={t("dashboard.kpiSubscription")}
                value={STATUS_LABEL[subscription.status]}
                glow={subscription.status === "ACTIVE" ? "success" : subscription.status === "TRIAL" ? "warning" : "critical"}
                tagLabel={isBlocked ? "حرج" : undefined}
                featured={featuredKpi === "subscription"}
              />
            )}
            {trialDaysLeft !== null && (
              <KpiCard
                icon={Target}
                label={t("dashboard.kpiTrialDays")}
                value={`${trialDaysLeft} ${t("dashboard.kpiTrialDaysUnit")}`}
                glow="warning"
                tagLabel={featuredKpi === "trial" ? "تنبيه" : undefined}
                featured={featuredKpi === "trial"}
              />
            )}
          </>
        )}
      </div>

      {/* Murshidak entry + subscription detail — §6.5: AI integrated into the
          screen, not a separate window. Follow-up: "مرشدك يستحق يكون بطل
          الشاشة" — AssistantEntryCard now takes 2/3 of the row's width
          (md:col-span-2 of 3) instead of an even 50/50 split, so it wins
          visual weight without moving out of its existing section/order. * /}
      <div className="rise-in rise-d2 grid gap-4 sm:gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <AssistantEntryCard />
        </div>
        <SubscriptionStatusCard />
      </div>

      {/* Files — §5.11 Empty States: message + reason + action + visual.
          Passive tier in the card hierarchy: no glow, no lift, slightly
          quieter than the primary cards above it. * /}
      <div className="glass-card rise-in rise-d3 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            {t("dashboard.filesCardTitle")}
          </h3>
          <Link href="/dashboard/files" className="text-sm text-primary hover:underline">
            {t("dashboard.filesCardManage")}
          </Link>
        </div>
        <div className="mt-4">
          {filesLoading && <Skeleton className="h-16" />}
          {!filesLoading && (!files || files.length === 0) && (
            <DashboardEmptyState
              icon={FileSpreadsheet}
              title={t("dashboard.filesEmptyTitle")}
              reason={t("dashboard.filesEmptyReason")}
              actionLabel={t("dashboard.filesEmptyAction")}
              actionHref="/dashboard/files"
            />
          )}
          {files && files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file) => (
                <Badge key={file.id} variant="secondary">
                  {file.datasetType} · {file.fileName}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions — §15.2's "first action to take", as direct shortcuts
          to real, existing routes (same hrefs as the sidebar). * /}
      <div className="rise-in rise-d4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("dashboard.quickActionsTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionTile href="/dashboard/files" icon={FileSpreadsheet} label={t("dashboard.quickActionFiles")} colorKey="files" />
          <QuickActionTile href="/dashboard/assistant" icon={Bot} label={t("dashboard.quickActionAssistant")} colorKey="assistant" />
          <QuickActionTile href="/dashboard/heatmap" icon={Flame} label={t("dashboard.quickActionHeatmap")} colorKey="heatmap" />
          <QuickActionTile href="/dashboard/sales-growth" icon={Target} label={t("dashboard.quickActionSgi")} colorKey="sgi" />
        </div>
      </div>
    </div>
  );
}
  */
}

function QuickActionTile({
  href,
  icon: Icon,
  label,
  colorKey,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  colorKey: keyof typeof MODULE_BADGE_CLASSES;
}) {
  return (
    <Link href={href} className="glass-card card-lift flex items-center gap-3 p-4 hover:bg-secondary/40">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${MODULE_BADGE_CLASSES[colorKey]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function dashboardFormat(value: number | null, unit = "count") {
  if (value === null) return "غير متاح";
  return unit === "currency" ? `${Math.round(value).toLocaleString("ar-SA")} ر.س` : Math.round(value).toLocaleString("ar-SA");
}

function DashboardGrowthCard({ label, metric, unit, Icon, color, lowerBetter, benchmarkType }: { label: string; metric: DashboardMetric; unit: string; Icon: LucideIcon; color: string; lowerBetter: boolean; benchmarkType: DashboardBenchmark }) {
  const positive = metric.growthPct !== null && (lowerBetter ? metric.growthPct <= 0 : metric.growthPct >= 0);
  const Trend = positive ? TrendingUp : TrendingDown;
  const values = metric.sparkline;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${30 - (value / max) * 26}`).join(" ");
  const benchmarkLabel = benchmarkType === "previous-month" ? "الفترة المرجعية" : "متوسط آخر 3 أشهر";
  return <div className="glass-card min-h-48 p-4"><div className="flex items-center justify-between"><span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-background/50 ${color}`}><Icon className="h-4 w-4" /></span>{metric.growthPct !== null && <Badge variant={positive ? "success" : "destructive"} className="gap-1"><Trend className="h-3 w-3" />{Math.abs(metric.growthPct).toFixed(1)}%</Badge>}</div><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{dashboardFormat(metric.current, unit)}</p><p className="mt-1 text-xs text-muted-foreground">{benchmarkLabel}: <span className="font-medium text-foreground">{dashboardFormat(metric.benchmark, unit)}</span></p>{values.length > 0 ? <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={`mt-5 h-8 w-full drop-shadow-[0_0_3px_currentColor] ${color}`}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.25" vectorEffect="non-scaling-stroke" /></svg> : <div className="mt-5 h-8" />}</div>;
}

function DashboardTargetSection({ title, targets }: { title: string; targets: DashboardTarget[] }) {
  return <section><h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Target className="h-5 w-5 text-primary" />{title}</h2><div className="grid gap-4 xl:grid-cols-2">{targets.map((target) => <DashboardTargetCard key={target.key} target={target} />)}</div></section>;
}

function DashboardTargetCard({ target }: { target: DashboardTarget }) {
  const ahead = target.aheadBehind !== null && target.aheadBehind >= 0;
  const achievement = target.progressPct;
  const state = achievement === null ? { variant: "secondary" as const, label: "غير متاح", text: "text-muted-foreground", bar: "bg-muted" } : achievement >= 100 ? { variant: "success" as const, label: "محقق / متقدم", text: "text-emerald-400", bar: "bg-emerald-500" } : achievement >= 90 ? { variant: "warning" as const, label: "قريب من المخطط", text: "text-amber-400", bar: "bg-amber-500" } : { variant: "destructive" as const, label: "متأخر عن المسار", text: "text-destructive", bar: "bg-destructive" };
  const progress = Math.min(100, Math.max(0, target.progressPct ?? 0));
  return <div className="glass-card border-primary/20 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{target.label}</h3><p className="mt-1 text-sm text-muted-foreground">الهدف الشهري: {dashboardFormat(target.monthlyTarget, target.unit)}</p></div><Badge variant={state.variant}>{state.label}</Badge></div><div className="mt-5 grid grid-cols-3 divide-x divide-x-reverse divide-border"><DashboardStat label="المحقق الفعلي" value={dashboardFormat(target.actualMtd, target.unit)} /><DashboardStat label="الهدف المرحلي" value={dashboardFormat(target.targetMtd, target.unit)} /><DashboardStat label="الفرق" value={target.aheadBehind === null ? "غير متاح" : `${ahead ? "+" : ""}${dashboardFormat(target.aheadBehind, target.unit)}`} className={state.text} /></div><div className="mt-5"><div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>نسبة الإنجاز المرحلي</span><span>{target.progressPct === null ? "غير متاح" : `${target.progressPct.toFixed(0)}%`}</span></div><div className="h-3 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${state.bar}`} style={{ width: `${progress}%` }} /></div></div><div className="mt-5 grid gap-2 sm:grid-cols-3"><DashboardMini label="المتبقي من الهدف" value={dashboardFormat(target.remainingMonthlyTarget, target.unit)} /><DashboardMini label="المطلوب يوميًا" value={dashboardFormat(target.requiredDailyVelocity, target.unit)} /><DashboardMini label="توقع نهاية الشهر" value={dashboardFormat(target.runRateForecast, target.unit)} /></div></div>;
}
function DashboardStat({ label, value, className }: { label: string; value: string; className?: string }) { return <div className="px-3 first:pr-0 last:pl-0"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 text-lg font-bold tabular-nums ${className ?? ""}`}>{value}</p></div>; }
function DashboardMini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background/25 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{value}</p></div>; }
function DashboardPerformanceLoading() { return <div className="space-y-6"><Skeleton className="h-36" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-48" />)}</div><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>; }
