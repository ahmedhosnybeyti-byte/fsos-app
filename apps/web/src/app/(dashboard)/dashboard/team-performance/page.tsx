"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueries } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, TrendingDown, TrendingUp, Users, Wand2, CircleDollarSign, ClipboardCheck, ReceiptText, Package, RotateCcw, Target } from "lucide-react";
import { toast } from "sonner";
import { teamPerformanceApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceGrowthCard, PerformanceTargetCard } from "@/components/dashboard/performance-cards";
import { dashboardPerformanceApi, type DashboardBenchmark, type DashboardMetric, type DashboardPerformance, type DashboardTarget } from "@/lib/api/dashboard-performance";
import { buildTeamExecutiveDiagnosis, generateTeamExecutivePptx } from "@/lib/export/team-performance-executive-pptx";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { TeamPerformanceCoachResult, TeamPerformanceRepRow, TeamPerformanceResult } from "@/lib/types";

// Team Performance — strategic point 3's second half.
//
// Migration #7 (ADR-001 / RIE Migration Plan) — no file/column mapping
// anymore. Sales/collection/returns are resolved automatically via
// RieFacade (Invoice Items joined to Invoices for sales, Collections,
// Returns; rep identity via RouteID -> Routes.SalesRepID -> Employees;
// supervisor grouping via Employees.DirectManagerID) — only the date range
// and optional comparison window remain as inputs. A category with no
// Dataset uploaded is omitted (not zeroed), per explicit product decision
// — see CategoryAvailabilityBadges below.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
type DiagnosticMetric = "sales" | "collections" | "invoices" | "customers" | "skus" | "returns";

function diagnosticHint(key: DiagnosticMetric, metrics: Record<DiagnosticMetric, { growthPct: number | null }>) {
  const value = metrics[key].growthPct;
  return value === null ? "البيانات المتاحة لا تكفي لتحديد إشارة موثوقة." : `${value < 0 ? "تراجع" : "نمو"} ${Math.abs(value).toFixed(1)}% — اضغط لعرض الدليل والتشخيص.`;
}

export default function TeamPerformancePage() {
  const { t, locale } = useTranslation();
  const { user } = useAuth();

  const initialPeriod = useMemo(() => { const now = new Date(); const pad = (n: number) => String(n).padStart(2, "0"); const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now), priorFrom: iso(prior), priorTo: iso(new Date(prior.getFullYear(), prior.getMonth(), Math.min(now.getDate(), new Date(prior.getFullYear(), prior.getMonth() + 1, 0).getDate()))) }; }, []);
  const [dateFrom, setDateFrom] = useState(initialPeriod.from);
  const [dateTo, setDateTo] = useState(initialPeriod.to);
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [priorDateFrom, setPriorDateFrom] = useState(initialPeriod.priorFrom);
  const [priorDateTo, setPriorDateTo] = useState(initialPeriod.priorTo);

  const [result, setResult] = useState<TeamPerformanceResult | null>(null);
  const [mode, setMode] = useState<"focus" | "compare">("focus");
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [showAdditionalTargets, setShowAdditionalTargets] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<DashboardBenchmark>("previous-month");
  const [comparisonPreset, setComparisonPreset] = useState<DashboardBenchmark | null>("previous-month");
  const [appliedPeriod, setAppliedPeriod] = useState<{ dateFrom?: string; dateTo?: string; comparisonFrom?: string; comparisonTo?: string }>({ dateFrom: initialPeriod.from, dateTo: initialPeriod.to, comparisonFrom: initialPeriod.priorFrom, comparisonTo: initialPeriod.priorTo });
  const isSupervisor = user?.role.code === "SUPERVISOR";
  const scopedRouteIds = useMemo(() => result ? result.reps.filter((row) => {
    const supervisorMatches = isSupervisor || !selectedSupervisors.length || selectedSupervisors.includes(row.supervisorEmail ?? "__unassigned__");
    return supervisorMatches && (!selectedReps.length || selectedReps.includes(row.repEmail));
  }).flatMap((row) => row.routeIds) : [], [result, isSupervisor, selectedSupervisors, selectedReps]);
  const dashboardQuery = useQuery({ queryKey: ["team-performance-dashboard", benchmark, scopedRouteIds.join(","), appliedPeriod.dateFrom, appliedPeriod.dateTo, appliedPeriod.comparisonFrom, appliedPeriod.comparisonTo], queryFn: () => dashboardPerformanceApi.get(benchmark, scopedRouteIds, appliedPeriod) });

  const queryMutation = useMutation({
    mutationFn: teamPerformanceApi.query,
    onSuccess: (data) => {
      setResult(data);
      const supervisorIds = Array.from(new Set(data.reps.map((row) => row.supervisorEmail ?? "__unassigned__")));
      setSelectedSupervisors(isSupervisor ? [] : supervisorIds);
      setSelectedReps(isSupervisor ? data.reps.map((row) => row.repEmail) : []);
      setDiagnostic(null);
      toast.success(t("teamPerformance.repCount", { count: data.reps.length }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("teamPerformance.loadError")),
  });

  const canQuery = !!dateFrom && !!dateTo && (!compareEnabled || (!!priorDateFrom && !!priorDateTo));

  function handleQuery() {
    setAppliedPeriod({ dateFrom, dateTo, comparisonFrom: compareEnabled ? priorDateFrom : undefined, comparisonTo: compareEnabled ? priorDateTo : undefined });
    queryMutation.mutate({
      dateFrom,
      dateTo,
      priorDateFrom: compareEnabled ? priorDateFrom : undefined,
      priorDateTo: compareEnabled ? priorDateTo : undefined,
    });
  }
  useEffect(() => { handleQuery(); }, []);

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <Users className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("teamPerformance.title")}</h1>
          <p className="text-muted-foreground">
            {user?.role.code === "SUPERVISOR" ? t("teamPerformance.descriptionSupervisor") : t("teamPerformance.descriptionManager")}
          </p>
        </div>
      </div>

      <TeamPerformanceWorkspace result={result} dashboard={dashboardQuery.data} loading={dashboardQuery.isLoading} benchmark={benchmark} onBenchmark={(value) => { setBenchmark(value); setComparisonPreset(value); const current = new Date(`${dateFrom}T00:00:00Z`); const iso = (d: Date) => d.toISOString().slice(0, 10); const from = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - (value === "previous-month" ? 1 : 3), 1)); const to = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 0)); setPriorDateFrom(iso(from)); setPriorDateTo(iso(to)); setCompareEnabled(true); }} dateFrom={dateFrom} dateTo={dateTo} priorDateFrom={priorDateFrom} priorDateTo={priorDateTo} onDateFrom={setDateFrom} onDateTo={setDateTo} onPriorDateFrom={(value) => { setPriorDateFrom(value); setComparisonPreset(null); }} onPriorDateTo={(value) => { setPriorDateTo(value); setComparisonPreset(null); }} compareEnabled={compareEnabled} onCompareEnabled={(value) => { setCompareEnabled(value); if (!value) { setPriorDateFrom(""); setPriorDateTo(""); setComparisonPreset(null); } }} onRun={handleQuery} running={queryMutation.isPending} mode={mode} onMode={setMode} selectedSupervisors={selectedSupervisors} onSelectedSupervisors={setSelectedSupervisors} selectedReps={selectedReps} onSelectedReps={setSelectedReps} comparisonPreset={comparisonPreset} companyName={user?.company?.name ?? "Murshidak"} locale={locale} isSupervisor={isSupervisor} />

      {false && dashboardQuery.data && result && <>
      {/* @ts-ignore legacy view retained temporarily but intentionally not rendered */}
      {dashboardQuery.data && <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("performance.growthTitle")}</h2><p className="text-sm text-muted-foreground">{t("performance.comparisonDays", { count: dashboardQuery.data.sellingDays.elapsed })}</p></div><div className="flex rounded-lg border border-border bg-background/30 p-1"><Button size="sm" variant={benchmark === "previous-month" ? "default" : "ghost"} onClick={() => setBenchmark("previous-month")}>{t("performance.previousMonth")}</Button><Button size="sm" variant={benchmark === "previous-quarter-average" ? "default" : "ghost"} onClick={() => setBenchmark("previous-quarter-average")}>{t("performance.previousQuarter")}</Button></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[["sales", t("performance.sales"), "currency", CircleDollarSign, "text-emerald-400", false], ["collections", t("performance.collections"), "currency", ClipboardCheck, "text-violet-400", false], ["invoices", t("performance.invoices"), "count", ReceiptText, "text-blue-400", false], ["customers", t("performance.customers"), "count", Users, "text-orange-400", false], ["skus", t("performance.skus"), "count", Package, "text-cyan-400", false], ["returns", t("performance.returns"), "currency", RotateCcw, "text-red-400", true]].map(([key, label, unit, Icon, color, lowerBetter]) => <PerformanceGrowthCard key={String(key)} label={String(label)} metric={dashboardQuery.data.metrics[key as keyof typeof dashboardQuery.data.metrics]} unit={String(unit)} Icon={Icon as typeof CircleDollarSign} color={String(color)} lowerBetter={Boolean(lowerBetter)} benchmarkType={benchmark} hint={diagnosticHint(key as DiagnosticMetric, dashboardQuery.data.metrics)} onClick={() => setDiagnostic(String(key))} />)}</div><div><h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Target className="h-5 w-5 text-primary" />{t("performance.primaryTargets")}</h2><div className="grid gap-4 xl:grid-cols-2">{dashboardQuery.data.targets.filter((target) => target.primary).map((target) => <PerformanceTargetCard key={target.key} target={target} />)}</div></div></section>}

      {/* @ts-ignore legacy view retained temporarily but intentionally not rendered */}
      {result && <TeamPerformanceIntelligence result={result} mode={mode} onModeChange={setMode} selectedSupervisor={selectedSupervisor} onSupervisorChange={setSelectedSupervisor} selectedReps={selectedReps} onSelectedRepsChange={setSelectedReps} showAdditionalTargets={showAdditionalTargets} onShowAdditionalTargets={setShowAdditionalTargets} diagnostic={diagnostic} onDiagnostic={setDiagnostic} />}
      <Card className="glass-card rise-in rise-d1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <Users className="h-4 w-4" />
            </span>
            {t("teamPerformance.settingsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">{dateFrom} — {dateTo}</p>

          <div className="space-y-2">
            <Button variant="outline" size="sm" onClick={() => setCompareEnabled((v) => !v)}>
              {compareEnabled ? t("teamPerformance.compareDisableButton") : t("teamPerformance.compareEnableButton")}
            </Button>
            {compareEnabled && <p className="text-xs text-muted-foreground">{priorDateFrom} — {priorDateTo}</p>}
          </div>

          <Button disabled={!canQuery || queryMutation.isPending} onClick={handleQuery}>
            {queryMutation.isPending && <Spinner />}
            {t("teamPerformance.showPerformanceButton")}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* @ts-ignore legacy view retained temporarily but intentionally not rendered */}
          <div className="rise-in flex flex-wrap items-center justify-between gap-2">
            {/* @ts-ignore legacy view retained temporarily but intentionally not rendered */}
            <CategoryAvailabilityBadges categoriesAvailable={result.categoriesAvailable} />
            {/* @ts-ignore legacy view retained temporarily but intentionally not rendered */}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => exportResultToExcel(result.reps, t)}>
              <Download className="h-3.5 w-3.5" />
              {t("teamPerformance.exportExcelButton")}
            </Button>
          </div>
        </>
      )}
      </>}
    </div>
  );
}

function TeamPerformanceWorkspace({ result, dashboard, loading, benchmark, onBenchmark, dateFrom, dateTo, priorDateFrom, priorDateTo, onDateFrom, onDateTo, onPriorDateFrom, onPriorDateTo, compareEnabled, onCompareEnabled, onRun, running, mode, onMode, selectedSupervisors, onSelectedSupervisors, selectedReps, onSelectedReps, comparisonPreset, companyName, locale, isSupervisor }: { result: TeamPerformanceResult | null; dashboard: DashboardPerformance | undefined; loading: boolean; benchmark: DashboardBenchmark; onBenchmark: (x: DashboardBenchmark) => void; dateFrom: string; dateTo: string; priorDateFrom: string; priorDateTo: string; onDateFrom: (x: string) => void; onDateTo: (x: string) => void; onPriorDateFrom: (x: string) => void; onPriorDateTo: (x: string) => void; compareEnabled: boolean; onCompareEnabled: (x: boolean) => void; onRun: () => void; running: boolean; mode: "focus" | "compare"; onMode: (x: "focus" | "compare") => void; selectedSupervisors: string[]; onSelectedSupervisors: (x: string[]) => void; selectedReps: string[]; onSelectedReps: (x: string[]) => void; comparisonPreset: DashboardBenchmark | null; companyName: string; locale: "ar" | "en"; isSupervisor: boolean }) {
  const { t } = useTranslation(); const [diagnostic, setDiagnostic] = useState<string | null>(null); const [additional, setAdditional] = useState(false); const [exporting, setExporting] = useState(false);
  const reps = result?.reps ?? [];
  const supervisors = Array.from(new Map(reps.map((r) => [r.supervisorEmail ?? "__unassigned__", r.supervisorName ?? t("teamPerformance.noSupervisor")])).entries()).map(([id, name]) => ({ id, name }));
  const available = reps.filter((r) => isSupervisor || !selectedSupervisors.length || selectedSupervisors.includes(r.supervisorEmail ?? "__unassigned__"));
  const focused = selectedReps.length ? available.filter((r) => selectedReps.includes(r.repEmail)) : available;
  const supervisorEntities = supervisors.filter((supervisor) => selectedSupervisors.includes(supervisor.id)).map((supervisor) => ({ repEmail: supervisor.id, repName: supervisor.name, routeIds: reps.filter((r) => (r.supervisorEmail ?? "__unassigned__") === supervisor.id).flatMap((r) => r.routeIds) } as TeamPerformanceRepRow));
  const cards = [["sales", t("performance.sales"), "currency", CircleDollarSign, "text-emerald-400", false], ["collections", t("performance.collections"), "currency", ClipboardCheck, "text-violet-400", false], ["invoices", t("performance.invoices"), "count", ReceiptText, "text-blue-400", false], ["customers", t("performance.customers"), "count", Users, "text-orange-400", false], ["skus", t("performance.skus"), "count", Package, "text-cyan-400", false], ["returns", t("performance.returns"), "currency", RotateCcw, "text-red-400", true]] as const;
  const exportDeck = async () => { if (!dashboard) return; setExporting(true); try { const scopeLabel = selectedReps.length === 1 ? (focused[0]?.repName ?? companyName) : companyName; const slides = await generateTeamExecutivePptx({ companyName, scopeLabel, currentPeriod: { from: dateFrom, to: dateTo }, referencePeriod: compareEnabled ? { from: priorDateFrom, to: priorDateTo } : undefined, dashboard, reps: mode === "compare" ? (selectedReps.length ? focused : supervisorEntities) : focused, compareMode: mode === "compare", locale }); toast.success(t("teamPerformance.exportExecutiveSuccess", { count: slides })); } catch { toast.error(t("teamPerformance.exportExecutiveError")); } finally { setExporting(false); } };
  const groupTitle = (ar: string, en: string) => locale === "ar" ? ar : en;
  const selectedLabel = (count: number) => locale === "ar" ? `${count} محددين` : `${count} selected`;
  return <section className="space-y-6"><Card className="glass-card"><CardContent className="space-y-4 p-5"><div className="grid gap-4 xl:grid-cols-2">
    <fieldset className="rounded-xl border border-border/80 bg-background/20 p-4"><legend className="px-2 text-sm font-semibold text-primary">{groupTitle("الفترة الحالية والنطاق", "Current Period & Scope")}</legend><div className="grid gap-3 sm:grid-cols-2"><Label>{t("teamPerformance.dateFromLabel")}<Input type="date" value={dateFrom} onChange={(e) => onDateFrom(e.target.value)} /></Label><Label>{t("teamPerformance.dateToLabel")}<Input type="date" value={dateTo} onChange={(e) => onDateTo(e.target.value)} /></Label>{!isSupervisor && <MultiSelectChecklist label={t("teamPerformance.supervisor")} options={supervisors} selected={selectedSupervisors} onChange={(next) => { onSelectedSupervisors(next); onSelectedReps(selectedReps.filter((rep) => reps.some((r) => r.repEmail === rep && next.includes(r.supervisorEmail ?? "__unassigned__")))); }} summary={selectedLabel(selectedSupervisors.length)} locale={locale} />}<MultiSelectChecklist label={t("teamPerformance.salesRep")} options={available.map((r) => ({ id: r.repEmail, name: r.repName }))} selected={selectedReps} onChange={onSelectedReps} summary={selectedLabel(selectedReps.length)} locale={locale} /></div></fieldset>
    <fieldset className="rounded-xl border border-border/80 bg-background/20 p-4"><legend className="px-2 text-sm font-semibold text-primary">{groupTitle("فترة المقارنة", "Comparison Period")}</legend><div className="grid gap-3 sm:grid-cols-2"><Label>{t("teamPerformance.comparisonFrom")}<Input type="date" value={priorDateFrom} disabled={!compareEnabled} onChange={(e) => onPriorDateFrom(e.target.value)} /></Label><Label>{t("teamPerformance.comparisonTo")}<Input type="date" value={priorDateTo} disabled={!compareEnabled} onChange={(e) => onPriorDateTo(e.target.value)} /></Label></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={comparisonPreset === "previous-month" ? "default" : "outline"} onClick={() => onBenchmark("previous-month")}>{t("performance.previousMonth")}</Button><Button size="sm" variant={comparisonPreset === "previous-quarter-average" ? "default" : "outline"} onClick={() => onBenchmark("previous-quarter-average")}>{t("performance.previousQuarter")}</Button></div></fieldset></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4"><fieldset className="flex flex-wrap gap-2 rounded-lg border border-border/80 bg-background/20 p-2"><legend className="px-2 text-xs font-medium text-muted-foreground">{groupTitle("وضع العرض", "View Mode")}</legend><Button size="sm" variant={mode === "focus" ? "default" : "outline"} onClick={() => onMode("focus")}>{t("teamPerformance.focusMode")}</Button><Button size="sm" variant={mode === "compare" ? "default" : "outline"} onClick={() => onMode("compare")}>{t("teamPerformance.compareMode")}</Button><Button size="sm" variant="outline" onClick={() => onCompareEnabled(false)}>{t("teamPerformance.clearComparison")}</Button></fieldset><div className="flex flex-wrap gap-2"><Button size="sm" onClick={onRun} disabled={running}>{running && <Spinner />}{t("teamPerformance.showPerformanceButton")}</Button>{dashboard && <Button size="sm" variant="outline" onClick={exportDeck} disabled={exporting}>{exporting && <Spinner />}{t("teamPerformance.exportExecutiveButton")}</Button>}</div></div></CardContent></Card>
    {loading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48" />)}</div>}
    {dashboard && <><section><div className="mb-3"><h2 className="text-xl font-semibold">{t("performance.growthTitle")}</h2><p className="text-sm text-muted-foreground">{t("performance.comparisonDays", { count: dashboard.sellingDays.elapsed })}</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([key, label, unit, Icon, color, lowerBetter]) => <PerformanceGrowthCard key={key} label={label} metric={dashboard.metrics[key]} unit={unit} Icon={Icon} color={color} lowerBetter={lowerBetter} benchmarkType={benchmark} hint={shortSignal(key, dashboard.metrics)} onClick={() => setDiagnostic(key)} />)}</div></section>{diagnostic && <TeamDiagnosisV1 kind={diagnostic} dashboard={dashboard} reps={focused} entity={{ id: "selected-scope", type: "scope", name: companyName, currentPeriod: `${dateFrom} → ${dateTo}`, comparisonPeriod: compareEnabled ? `${priorDateFrom} → ${priorDateTo}` : undefined }} onClose={() => setDiagnostic(null)} />}{mode === "focus" && <><TargetGrid title={t("performance.primaryTargets")} targets={dashboard.targets.filter((x) => x.primary)} onSelect={(key) => setDiagnostic(`target:${key}`)} /><Button variant="ghost" size="sm" onClick={() => setAdditional(!additional)}>{additional ? "إخفاء الأهداف الإضافية" : "إظهار الأهداف الإضافية"}</Button>{additional && <TargetGrid title={t("performance.secondaryTargets")} targets={dashboard.targets.filter((x) => !x.primary)} onSelect={(key) => setDiagnostic(`target:${key}`)} />}</>}{mode === "compare" && <CompareWorkspace reps={selectedReps.length ? focused : (isSupervisor ? focused : supervisorEntities)} benchmark={benchmark} currentPeriod={`${dateFrom} → ${dateTo}`} comparisonPeriod={compareEnabled ? `${priorDateFrom} → ${priorDateTo}` : undefined} />}</>}</section>;
}

function MultiSelectChecklist({ label, options, selected, onChange, summary, locale }: { label: string; options: { id: string; name: string | null }[]; selected: string[]; onChange: (value: string[]) => void; summary: string; locale: "ar" | "en" }) {
  const [search, setSearch] = useState("");
  const visible = options.filter((option) => option.name?.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const allVisibleSelected = visible.length > 0 && visible.every((option) => selected.includes(option.id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  const selectVisible = () => onChange(allVisibleSelected ? selected.filter((id) => !visible.some((option) => option.id === id)) : Array.from(new Set([...selected, ...visible.map((option) => option.id)])));
  return <Label>{label}<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="mt-2 w-full justify-between font-normal"><span className="truncate">{summary}</span><ChevronDown className="h-4 w-4 shrink-0" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-2 p-3"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "ar" ? "بحث..." : "Search..."} onKeyDown={(event) => event.stopPropagation()} /><div className="flex gap-2"><Button type="button" size="sm" variant="ghost" onClick={selectVisible}>{locale === "ar" ? "تحديد الكل" : "Select All"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => onChange([])}>{locale === "ar" ? "مسح" : "Clear"}</Button></div><div className="max-h-56 space-y-1 overflow-y-auto">{visible.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-secondary"><input type="checkbox" checked={selected.includes(option.id)} onChange={() => toggle(option.id)} />{option.name}</label>)}{visible.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">{locale === "ar" ? "لا توجد نتائج" : "No results"}</p>}</div></DropdownMenuContent></DropdownMenu></Label>;
}
function TargetGrid({ title, targets, onSelect }: { title: string; targets: DashboardTarget[]; onSelect: (key: string) => void }) { return <section><h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><Target className="h-5 w-5 text-primary" />{title}</h2><div className="grid gap-4 xl:grid-cols-2">{targets.map((target) => <PerformanceTargetCard key={target.key} target={target} hint="اضغط لمعرفة سبب التقدم أو التأخر" onClick={() => onSelect(target.key)} />)}</div></section>; }
function shortSignal(key: DiagnosticMetric, metrics: DashboardPerformance["metrics"]) { const n = metrics[key].growthPct; return n === null ? "البيانات المتاحة لا تكفي لتحديد إشارة موثوقة." : `${n >= 0 ? "تحسن" : "تراجع"} ${Math.abs(n).toFixed(1)}% — اضغط للتشخيص.`; }
function TeamDiagnosisV1({ kind, dashboard, reps, entity, onClose }: { kind: string; dashboard: DashboardPerformance; reps: TeamPerformanceRepRow[]; entity: { id: string; type: "scope" | "supervisor" | "rep"; name: string; currentPeriod: string; comparisonPeriod?: string }; onClose: () => void }) {
  { const { t, locale } = useTranslation(); const analysis = buildTeamExecutiveDiagnosis(dashboard, locale, kind); const metricTitle = kind.startsWith("target:") ? (kind.includes("Collection") ? t("performance.collections") : t("performance.sales")) : ({ sales: t("performance.sales"), collections: t("performance.collections"), invoices: t("performance.invoices"), customers: t("performance.customers"), skus: t("performance.skus"), returns: t("performance.returns") }[kind] ?? t("teamPerformance.diagnosis"));
  return <Card className="glass-card border-primary/30"><CardContent className="space-y-3 p-5 text-sm"><div className="flex justify-between"><h2 className="font-semibold">{t("teamPerformance.diagnosis")} — {metricTitle}</h2><Button size="sm" variant="ghost" onClick={onClose}>{t("teamPerformance.close")}</Button></div><p>{analysis.summary}</p><div className="grid gap-3 lg:grid-cols-2"><p><b>{t("teamPerformance.diagnosisEvidence")}:</b> {analysis.evidence.join(" • ") || t("performance.unavailable")}</p><p><b>{t("teamPerformance.diagnosisConfidence")}:</b> {analysis.confidence}</p><p><b>{t("teamPerformance.diagnosisCause")}:</b> {analysis.interpretation}</p><p><b>{t("teamPerformance.diagnosisUnknown")}:</b> {analysis.unknown}</p></div><p><b>{t("teamPerformance.diagnosisAction")}:</b> {analysis.decision}</p>{analysis.actions.length > 0 && <ol className="list-decimal space-y-1 ps-5">{analysis.actions.slice(0, 3).map((action) => <li key={action}>{action}</li>)}</ol>}</CardContent></Card>;
  return <Card className="glass-card border-primary/30"><CardContent className="p-5 text-sm"><div className="flex justify-between"><h2 className="font-semibold">{t("teamPerformance.diagnosis")} — {metricTitle}</h2><Button size="sm" variant="ghost" onClick={onClose}>{t("teamPerformance.close")}</Button></div><div className="mt-3 space-y-2"><p>{analysis.summary}</p><p><b>{t("teamPerformance.diagnosisEvidence")}:</b> {analysis.evidence.join(" • ") || t("performance.unavailable")}</p><p><b>{t("teamPerformance.diagnosisCause")}:</b> {analysis.interpretation}</p><p><b>{t("teamPerformance.diagnosisUnknown")}:</b> {analysis.unknown}</p><p><b>{t("teamPerformance.diagnosisConfidence")}:</b> {analysis.confidence}</p><p><b>{t("teamPerformance.diagnosisAction")}:</b> {analysis.decision}</p></div><div className="mt-4"><p className="font-medium">{t("teamPerformance.diagnosisEntities")}</p>{reps.slice(0, 8).map((rep) => <div key={rep.repEmail} className="mt-2 rounded border p-2">{rep.repName}</div>)}</div></CardContent></Card>;
  }
  /* Legacy implementation retained below for reference only. */
  // @ts-ignore Legacy, unreachable diagnostic code retained for history.
  const { t } = useTranslation(); const target = kind.startsWith("target:") ? dashboard.targets.find((x) => x.key === kind.slice(7)) : undefined; const metric = target?.key === "CollectionTarget" ? "collections" : "sales"; const growth = dashboard.metrics[metric].growthPct; const positive = target ? (target.aheadBehind ?? 0) >= 0 : (growth ?? 0) >= 0; const evidence = [dashboard.metrics.sales.growthPct, dashboard.metrics.customers.growthPct, dashboard.metrics.invoices.growthPct, dashboard.metrics.skus.growthPct].filter((x): x is number => x !== null).map((x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`).join(" · "); return <Card className="glass-card border-primary/30"><CardContent className="p-5 text-sm"><div className="flex justify-between"><h2 className="font-semibold">{t("teamPerformance.diagnosis")}</h2><Button size="sm" variant="ghost" onClick={onClose}>{t("teamPerformance.close")}</Button></div><div className="mt-3 space-y-2"><p>{positive ? t("teamPerformance.diagnosisSummaryPositive") : t("teamPerformance.diagnosisSummaryNegative")}</p><p><b>{t("teamPerformance.diagnosisEvidence")}:</b> {evidence || t("performance.unavailable")}</p><p><b>{t("teamPerformance.diagnosisCause")}:</b> {positive ? t("performance.ahead") : t("performance.behind")}</p><p><b>{t("teamPerformance.diagnosisUnknown")}:</b> {t("performance.unavailable")}</p><p><b>{t("teamPerformance.diagnosisConfidence")}:</b> {growth === null ? t("performance.unavailable") : "Medium"}</p><p><b>{t("teamPerformance.diagnosisAction")}:</b> {positive ? t("performance.ahead") : t("performance.behind")}</p></div><div className="mt-4"><p className="font-medium">{t("teamPerformance.diagnosisEntities")}</p>{reps.slice(0, 8).map((rep) => <div key={rep.repEmail} className="mt-2 rounded border p-2">{rep.repName}</div>)}</div></CardContent></Card>;
}
function LegacyTeamDiagnosisV1({ kind, dashboard, reps, onClose }: { kind: string; dashboard: DashboardPerformance; reps: TeamPerformanceRepRow[]; onClose: () => void }) {
  const target = kind.startsWith("target:") ? dashboard.targets.find((x) => x.key === kind.slice(7)) : undefined;
  const m = dashboard.metrics; const sales = m.sales.growthPct; const customers = m.customers.growthPct; const invoices = m.invoices.growthPct; const skus = m.skus.growthPct; const collections = m.collections.growthPct; const returns = m.returns.growthPct;
  const avgInvoice = sales !== null && invoices !== null ? ((1 + sales / 100) / Math.max(.01, 1 + invoices / 100) - 1) * 100 : null;
  const changes = (label: string, value: number | null) => value === null ? null : `${label} ${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  const isPositive = target ? (target.aheadBehind ?? 0) >= 0 : ((m[kind as DiagnosticMetric]?.growthPct ?? 0) >= 0);
  let summary = ""; let cause = ""; let unknown = ""; let confidence = "منخفضة"; let actions: string[] = [];
  if (target) {
    summary = `${target.label} ${isPositive ? "متقدم" : "متأخر"} عن الهدف حتى اليوم.`;
    cause = isPositive ? "النتيجة متسقة مع المؤشرات الحالية؛ نحتاج تثبيت الممارسة عند أفضل الكيانات." : "فجوة الهدف مثبتة، ويُستخدم اتجاه المبيعات/التحصيل لتحديد أولويات التدخل.";
    unknown = "لا تثبت بيانات الهدف وحدها سببًا تشغيليًا داخل العميل."; confidence = "متوسطة";
    actions = isPositive ? ["ثبّت أسلوب أفضل الكيانات وراقب استمراره.", "انقل الممارسة إلى الكيانات الأقل أداءً."] : ["ابدأ بالكيانات الأكثر تأثيرًا أدناه.", "راجع الرف والكمية قبل طلب زيادة المبيعات.", "أعد القياس في الفترة التالية."];
  } else if (sales !== null && sales < 0 && customers !== null && customers > 0 && invoices !== null && invoices > 0 && avgInvoice !== null && avgInvoice < 0) {
    summary = `إشارة المبيعات الأساسية: انخفاض متوسط الفاتورة بنحو ${Math.abs(avgInvoice).toFixed(1)}% رغم نمو العملاء والفواتير.`; cause = "Basket Size هو الإشارة الأقوى: الزيارات/الفواتير لم تنخفض، لكن قيمة الطلبية داخل العميل انخفضت."; unknown = "لا يمكن إثبات السعر أو نقص المخزون أو الكمية داخل كل عميل من هذه البيانات وحدها."; confidence = "مرتفعة"; actions = ["افحص الرف قبل السؤال وحدد الأصناف أو الكميات الناقصة.", "اقترح طلبية محددة لا سؤالًا عامًا.", "تابع متوسط الفاتورة يوميًا دون زيادة عدد الزيارات عشوائيًا."];
  } else if (sales !== null && sales < 0 && customers !== null && customers < 0) {
    summary = `المبيعات والعملاء المنتجون يتراجعان معًا (${sales.toFixed(1)}% و${customers.toFixed(1)}%).`; cause = "Customer Activation/Coverage محتمل: عدد العملاء المنتجين انخفض، وهو يفسر جزءًا مباشرًا من تراجع المبيعات."; unknown = "لا يمكن الجزم بأن سبب انخفاض العملاء هو عدد الزيارات ما لم توجد بيانات زيارات فعلية."; confidence = "متوسطة"; actions = ["حدد العملاء المتوقفين ضمن الكيانات الأكثر تأثيرًا.", "ابدأ الزيارة بفحص الرف ثم اقترح احتياجًا محددًا.", "راقب عودة العملاء المنتجين في الفترة التالية."];
  } else if (sales !== null && sales < 0 && collections !== null && collections < 0) {
    summary = `المبيعات والتحصيل يتراجعان معًا (${sales.toFixed(1)}% و${collections.toFixed(1)}%).`; cause = "التحصيل سبب محتمل إذا كان التعثر عند نفس النطاق؛ الأولوية للتحصيل قبل الدفع بزيادة المبيعات عند وجود تعارض واضح."; unknown = "لا تثبت هذه البيانات وحدها أن العملاء المتعثرين هم أنفسهم المتراجعون في الشراء."; confidence = "متوسطة"; actions = ["راجع العملاء المتأخرين أولًا وثبّت موعد تحصيل واضح.", "لا تضف ائتمانًا جديدًا قبل معالجة التعثر.", "بعد التحصيل، راجع فرصة إعادة الطلب."];
  } else if (skus !== null && skus < 0 && reps.filter((r) => r.sales !== null && r.salesPrior !== null && r.sales! < r.salesPrior!).length >= 2) {
    summary = `الأصناف المباعة تتراجع ${Math.abs(skus).toFixed(1)}% عبر أكثر من مندوب متراجع.`; cause = "Availability issue محتمل على مستوى الصنف أو التوزيع؛ لا يُوصف بأنه Stock Out دون بيانات مخزون."; unknown = "لا توجد بيانات مخزون أو توفر تؤكد نفاد صنف."; confidence = "متوسطة"; actions = ["حدد الأصناف المتوقفة عند أكثر من مندوب.", "تحقق من توفرها فعليًا قبل اقتراحها.", "استخدم بديلًا أو كمية تجريبية فقط بعد التحقق."];
  } else if (returns !== null && returns > 0) {
    summary = `المرتجعات ارتفعت ${returns.toFixed(1)}% وهي إشارة تشخيصية أساسية.`; cause = "احتمال تحميل زائد أو عدم ملاءمة الكمية؛ يزداد الترجيح عند تكرار النمط على الصنف أو العميل."; unknown = "لا يمكن إثبات التحميل الزائد أو سبب الجودة دون تفاصيل SKU/الكمية/سبب المرتجع."; confidence = "متوسطة"; actions = ["راجع تكرار المرتجع حسب الصنف والكمية.", "قارن الكمية الموردة بمعدل التصريف قبل إعادة التحميل.", "عالج المشكلة قبل زيادة الطلبية التالية."];
  } else if (isPositive) {
    summary = "الأداء إيجابي في النطاق المحدد."; cause = "المؤشرات المتاحة تتحرك في اتجاه داعم للنتيجة، ما يرجح وجود ممارسة ناجحة قابلة للتكرار."; unknown = "لا تثبت البيانات وحدها تفاصيل السلوك الميداني الذي أدى للتحسن."; confidence = "متوسطة"; actions = ["استخرج أفضل الكيانات أدناه.", "ثبّت فحص الرف والاقتراح المحدد للطلبية لديهم.", "انقل الممارسة إلى الكيانات الأقل أداءً ثم أعد القياس."];
  } else { summary = "لا توجد إشارة مترابطة كافية لتحديد سبب موثوق."; cause = "المؤشرات المتاحة لا تقدم نمطًا داعمًا واحدًا."; unknown = "لا ينبغي افتراض سبب تشغيلي دون بيانات إضافية."; actions = ["اعرض المؤشرات الداعمة المتاحة.", "استكمل بيانات الزيارات أو SKU/الكمية عند الحاجة."] }
  const evidence = [changes("المبيعات", sales), changes("العملاء", customers), changes("الفواتير", invoices), changes("الأصناف", skus), changes("التحصيل", collections), changes("المرتجعات", returns), avgInvoice !== null ? changes("متوسط الفاتورة", avgInvoice) : null].filter(Boolean).join("، ");
  const ordered = reps.filter((r) => r.sales !== null && r.salesPrior !== null && r.salesPrior !== 0).sort((a, b) => ((a.sales! - a.salesPrior!) / a.salesPrior!) - ((b.sales! - b.salesPrior!) / b.salesPrior!)).slice(0, 8);
  return <Card className="glass-card border-primary/30"><CardContent className="p-5 text-sm"><div className="flex justify-between"><h2 className="font-semibold">التشخيص</h2><Button size="sm" variant="ghost" onClick={onClose}>إغلاق</Button></div><div className="mt-3 space-y-2"><p><b>الخلاصة:</b> {summary}</p><p><b>الأدلة:</b> {evidence || "لا توجد مقارنة مرجعية كافية."}</p><p><b>السبب الجذري المحتمل:</b> {cause}</p><p><b>ما لا يمكن إثباته:</b> {unknown}</p><p><b>درجة الثقة:</b> {confidence}</p><div><b>القرار التنفيذي:</b><ol className="mt-1 list-decimal space-y-1 pr-5">{actions.slice(0, 3).map((action) => <li key={action}>{action}</li>)}</ol></div></div><div className="mt-4"><p className="font-medium">الكيانات الأكثر تأثيرًا</p>{ordered.map((r) => <div key={r.repEmail} className="mt-2 rounded border p-2">{r.repName} — {(((r.sales! - r.salesPrior!) / r.salesPrior!) * 100).toFixed(1)}%</div>)}</div></CardContent></Card>;
}
function CompareWorkspace({ reps, benchmark, currentPeriod, comparisonPeriod }: { reps: TeamPerformanceRepRow[]; benchmark: DashboardBenchmark; currentPeriod?: string; comparisonPeriod?: string }) { const [additional, setAdditional] = useState(false); const queries = useQueries({ queries: reps.map((rep) => ({ queryKey: ["team-compare", benchmark, rep.repEmail], queryFn: () => dashboardPerformanceApi.get(benchmark, rep.routeIds) })) }); if (reps.length < 2) return <p className="text-sm text-muted-foreground">اختر كيانين أو أكثر من نفس المستوى للمقارنة.</p>; const entities = reps.map((rep, i) => ({ rep, dashboard: queries[i]?.data })).sort((a, b) => (b.dashboard?.targets.find((x) => x.key === "SalesTarget")?.progressPct ?? -1) - (a.dashboard?.targets.find((x) => x.key === "SalesTarget")?.progressPct ?? -1)); return <section className="space-y-6"><CompareRows title="معدلات النمو" entities={entities} benchmark={benchmark} currentPeriod={currentPeriod} comparisonPeriod={comparisonPeriod} /><CompareRows title="الأداء مقابل الهدف" entities={entities} benchmark={benchmark} targets currentPeriod={currentPeriod} comparisonPeriod={comparisonPeriod} /><Button variant="ghost" size="sm" onClick={() => setAdditional(!additional)}>{additional ? "إخفاء الأهداف الإضافية" : "إظهار الأهداف الإضافية"}</Button>{additional && <CompareRows title="الأهداف الإضافية" entities={entities} benchmark={benchmark} targets additional currentPeriod={currentPeriod} comparisonPeriod={comparisonPeriod} />}</section>; }
function CompareRows({ title, entities, benchmark, targets, additional, currentPeriod, comparisonPeriod }: { title: string; entities: { rep: TeamPerformanceRepRow; dashboard: DashboardPerformance | undefined }[]; benchmark: DashboardBenchmark; targets?: boolean; additional?: boolean; currentPeriod?: string; comparisonPeriod?: string }) { return <section><h2 className="mb-3 text-xl font-semibold">{title}</h2><div className="space-y-3">{entities.map((entity) => <CompareRow key={entity.rep.repEmail} rep={entity.rep} dashboard={entity.dashboard} benchmark={benchmark} targets={targets} additional={additional} currentPeriod={currentPeriod} comparisonPeriod={comparisonPeriod} />)}</div></section>; }
function CompareRow({ rep, dashboard, benchmark, targets, additional, currentPeriod, comparisonPeriod }: { rep: TeamPerformanceRepRow; dashboard: DashboardPerformance | undefined; benchmark: DashboardBenchmark; targets?: boolean; additional?: boolean; currentPeriod?: string; comparisonPeriod?: string }) { const [diagnostic, setDiagnostic] = useState<string | null>(null); if (!dashboard) return <Skeleton className="h-32" />; const salesTarget = dashboard.targets.find((x) => x.key === "SalesTarget"); const cards = [["sales", "المبيعات", "currency", CircleDollarSign, "text-emerald-400", false], ["collections", "التحصيل", "currency", ClipboardCheck, "text-violet-400", false], ["invoices", "الفواتير", "count", ReceiptText, "text-blue-400", false], ["customers", "العملاء", "count", Users, "text-orange-400", false], ["skus", "الأصناف", "count", Package, "text-cyan-400", false], ["returns", "المرتجعات", "currency", RotateCcw, "text-red-400", true]] as const; const targetRows = dashboard.targets.filter((x) => additional ? !x.primary : x.primary); const entity = { id: rep.repEmail, type: rep.supervisorEmail ? "rep" as const : "supervisor" as const, name: rep.repName, currentPeriod: currentPeriod ?? dashboard.periodMonth, comparisonPeriod }; return <div className="glass-card p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{rep.repName}</h3>{salesTarget?.progressPct !== null && salesTarget?.progressPct !== undefined && <span className="text-xs text-muted-foreground">تحقيق المبيعات: {salesTarget.progressPct.toFixed(0)}%</span>}</div>{targets ? <div className="grid gap-3 lg:grid-cols-2">{targetRows.map((x) => <PerformanceTargetCard key={x.key} target={x} hint="اضغط لمعرفة سبب التقدم أو التأخر" onClick={() => setDiagnostic(`target:${x.key}`)} />)}</div> : <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">{cards.map(([key, label, unit, Icon, color, lowerBetter]) => <PerformanceGrowthCard key={key} label={label} metric={dashboard.metrics[key]} unit={unit} Icon={Icon} color={color} lowerBetter={lowerBetter} benchmarkType={benchmark} onClick={() => setDiagnostic(key)} />)}</div>}{diagnostic && <div className="mt-3"><TeamDiagnosisV1 kind={diagnostic} dashboard={dashboard} reps={[rep]} entity={entity} onClose={() => setDiagnostic(null)} /></div>}</div>; }

// Surfaces which of the three categories actually have data uploaded — a
// category with no Dataset is omitted from every rep row entirely (not
// shown as zero), per explicit product decision, so this banner is the only
// place that explains why a metric might be missing from the table below.
function CategoryAvailabilityBadges({ categoriesAvailable }: { categoriesAvailable: TeamPerformanceResult["categoriesAvailable"] }) {
  const { t } = useTranslation();
  const missing = (["sales", "collection", "returns"] as const).filter((k) => !categoriesAvailable[k]);
  const labelKeys: Record<"sales" | "collection" | "returns", TranslationKey> = {
    sales: "teamPerformance.categorySales",
    collection: "teamPerformance.categoryCollection",
    returns: "teamPerformance.categoryReturns",
  };
  if (missing.length === 0) return <div />;
  return (
    <div className="flex flex-wrap gap-2">
      {missing.map((k) => (
        <Badge key={k} variant="outline" className="glow-warning border-transparent">
          {t("teamPerformance.categoryUnavailableBadge", { category: t(labelKeys[k]) })}
        </Badge>
      ))}
    </div>
  );
}

function TeamPerformanceIntelligence(props: {
  result: TeamPerformanceResult; mode: "focus" | "compare"; onModeChange: (mode: "focus" | "compare") => void;
  selectedSupervisor: string; onSupervisorChange: (value: string) => void; selectedReps: string[]; onSelectedRepsChange: (value: string[]) => void;
  showAdditionalTargets: boolean; onShowAdditionalTargets: (value: boolean) => void; diagnostic: string | null; onDiagnostic: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const supervisors = useMemo(() => Array.from(new Map(props.result.reps.map((rep) => [rep.supervisorEmail ?? "__unassigned__", rep.supervisorName ?? "Unassigned"])).entries()), [props.result.reps]);
  const availableReps = useMemo(() => props.result.reps.filter((rep) => !props.selectedSupervisor || (rep.supervisorEmail ?? "__unassigned__") === props.selectedSupervisor), [props.result.reps, props.selectedSupervisor]);
  const focused = useMemo(() => props.selectedReps.length ? availableReps.filter((rep) => props.selectedReps.includes(rep.repEmail)) : availableReps, [availableReps, props.selectedReps]);
  const totals = useMemo(() => {
    const sum = (field: "sales" | "collection" | "returns") => focused.some((rep) => rep[field] !== null) ? focused.reduce((value, rep) => value + (rep[field] ?? 0), 0) : null;
    const sales = sum("sales"); const collections = sum("collection"); const returns = sum("returns");
    return { sales, collections, returns, productiveCustomers: props.selectedReps.length ? null : props.result.summary.productiveCustomers, averageInvoice: props.selectedReps.length ? null : props.result.summary.averageInvoice, skus: props.selectedReps.length ? null : props.result.summary.skus };
  }, [focused, props.result.summary, props.selectedReps.length]);
  const diagnosticText = useMemo(() => {
    if (!props.diagnostic) return null;
    const value = totals[props.diagnostic as keyof typeof totals];
    const priorField = props.diagnostic === "sales" ? "salesPrior" : props.diagnostic === "collections" ? "collectionPrior" : props.diagnostic === "returns" ? "returnsPrior" : null;
    const prior = priorField ? focused.reduce((sum, row) => sum + (row[priorField] ?? 0), 0) : null;
    if (value === null || value === undefined || prior === null || prior <= 0) return "المشكلة: لا توجد مقارنة قابلة للحساب. الدليل: القيمة الحالية أو الفترة المرجعية غير مكتملة. السبب المحتمل: البيانات المتاحة لا تكفي لتحديد سبب موثوق. درجة الثقة: منخفضة. القرار المقترح: استكمل بيانات الفترة المرجعية ثم أعد التحليل.";
    const change = ((Number(value) - prior) / prior) * 100;
    const returnRate = totals.sales && totals.returns !== null ? totals.returns / totals.sales : null;
    const salesChange = focused.some((r) => r.sales !== null && r.salesPrior !== null && r.salesPrior > 0) ? focused.reduce((s, r) => s + (r.sales ?? 0), 0) / Math.max(1, focused.reduce((s, r) => s + (r.salesPrior ?? 0), 0)) - 1 : null;
    if (props.diagnostic === "returns" && returnRate !== null && returnRate > .1) return `المشكلة: المرتجعات تمثل ${(returnRate * 100).toFixed(1)}% من المبيعات. الدليل: قيمة المرتجعات ${change >= 0 ? "زادت" : "انخفضت"} ${Math.abs(change).toFixed(1)}% ومعدلها من المبيعات مرتفع. السبب المحتمل: احتمال تحميل زائد؛ لا يمكن إثباته دون بيانات تصريف/مخزون. درجة الثقة: متوسطة. القرار المقترح: راجع الكميات الموردة مقابل معدل التصريف قبل زيادة التحميل.`;
    if (change < 0 && salesChange !== null && salesChange < -.1) return `المشكلة: ${props.diagnostic === "sales" ? "المبيعات" : props.diagnostic === "collections" ? "التحصيل" : "المؤشر"} تراجع ${Math.abs(change).toFixed(1)}%. الدليل: المبيعات ضمن النطاق تراجعت ${(Math.abs(salesChange) * 100).toFixed(1)}% مقارنة بالفترة المرجعية. السبب المحتمل: الإشارة متسقة مع تراجع المبيعات، لكن البيانات المتاحة لا تكفي لإثبات سبب تشغيلي أدق. درجة الثقة: متوسطة. القرار المقترح: راجع المناديب الأكثر تراجعًا واستعد العملاء/الأصناف التي يظهر لها تراجع فعلي.`;
    return `المشكلة: لا توجد إشارة سلبية موثوقة في هذا المؤشر. الدليل: التغير ${change >= 0 ? "+" : ""}${change.toFixed(1)}% مقارنة بالفترة المرجعية. السبب المحتمل: لا ينطبق. درجة الثقة: مرتفعة. القرار المقترح: استمر في المتابعة ولا تنسب سببًا دون دليل إضافي.`;
  }, [focused, props.diagnostic, totals]);
  const cards = [
    ["sales", t("performance.sales"), totals.sales, CircleDollarSign], ["collections", t("performance.collections"), totals.collections, ClipboardCheck], ["productiveCustomers", t("performance.customers"), totals.productiveCustomers, Users],
    ["averageInvoice", t("performance.invoices"), totals.averageInvoice, ReceiptText], ["skus", t("performance.skus"), totals.skus, Package], ["returns", t("performance.returns"), totals.returns, RotateCcw],
  ] as const;
  const targets = props.result.targets.filter((target) => target.primary);
  const additionalTargets = props.result.targets.filter((target) => !target.primary);
  const compared = props.selectedReps.length > 1 ? focused.slice().sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)) : [];
  return <section className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([key, label, value, Icon]) => <KpiCard key={key} icon={Icon} label={label} value={value === null ? t("performance.unavailable") : Math.round(value).toLocaleString()} hint={value === null ? t("performance.unavailable") : `${t("performance.actual")}: ${Math.round(value).toLocaleString()}`} onClick={() => props.onDiagnostic(key)} />)}</div><Card className="glass-card"><CardHeader><CardTitle>{t("teamPerformance.title")}</CardTitle></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Label>المنطقة<select disabled className="mt-1 h-10 w-full rounded border bg-background px-2"><option>نطاق الشركة</option></select></Label><Label>المدير<select disabled className="mt-1 h-10 w-full rounded border bg-background px-2"><option>حسب الهيكل المتاح</option></select></Label><Label>المشرف<select value={props.selectedSupervisor} onChange={(e) => { props.onSupervisorChange(e.target.value); props.onSelectedRepsChange([]); }} className="mt-1 h-10 w-full rounded border bg-background px-2"><option value="">كل المشرفين</option>{supervisors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Label><Label>مندوب المبيعات<select value="" onChange={(e) => { if (e.target.value && !props.selectedReps.includes(e.target.value)) props.onSelectedRepsChange([...props.selectedReps, e.target.value]); }} className="mt-1 h-10 w-full rounded border bg-background px-2"><option value="">اختر مندوبًا</option>{availableReps.map((rep) => <option key={rep.repEmail} value={rep.repEmail}>{rep.repName}</option>)}</select></Label></div>
    <div className="flex gap-2"><Button size="sm" variant={props.mode === "focus" ? "default" : "outline"} onClick={() => props.onModeChange("focus")}>وضع التركيز</Button><Button size="sm" variant={props.mode === "compare" ? "default" : "outline"} onClick={() => props.onModeChange("compare")}>وضع المقارنة</Button></div>
    {props.mode === "compare" && <div className="flex flex-wrap gap-2">{availableReps.map((rep) => <label key={rep.repEmail} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={props.selectedReps.includes(rep.repEmail)} onChange={() => props.onSelectedRepsChange(props.selectedReps.includes(rep.repEmail) ? props.selectedReps.filter((id) => id !== rep.repEmail) : [...props.selectedReps, rep.repEmail])} />{rep.repName}</label>)}</div>}
  </CardContent></Card>
  {props.mode === "focus" ? <>{diagnosticText && <Card><CardContent className="p-4 text-sm"><strong>التشخيص</strong><p className="mt-2">{diagnosticText}</p></CardContent></Card>}</> : <CompareSections reps={compared} />}
  <TargetSection title={t("performance.primaryTargets")} targets={targets} /><Button variant="ghost" size="sm" onClick={() => props.onShowAdditionalTargets(!props.showAdditionalTargets)}>{props.showAdditionalTargets ? "إخفاء الأهداف الإضافية" : "إظهار الأهداف الإضافية"}</Button>{props.showAdditionalTargets && <TargetSection title={t("performance.secondaryTargets")} targets={additionalTargets} />}
  </section>;
}

function TargetSection({ title, targets }: { title: string; targets: TeamPerformanceResult["targets"] }) { const { t } = useTranslation(); return <section><h2 className="mb-3 text-xl font-semibold">{title}</h2><div className="grid gap-4 lg:grid-cols-2">{targets.length ? targets.map((target) => { const progress = target.progressPct ?? 0; const tone = progress >= 100 ? "bg-success" : progress >= 90 ? "bg-warning" : "bg-destructive"; return <Card key={target.key} className="glass-card"><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base">{target.label}</CardTitle><Badge variant="outline" className={progress >= 100 ? "glow-success" : progress >= 90 ? "glow-warning" : "glow-critical"}>{progress >= 100 ? t("performance.ahead") : progress >= 90 ? t("performance.nearPlan") : t("performance.behind")}</Badge></div></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-muted-foreground">{t("performance.actual")}</p><strong>{target.actual?.toLocaleString() ?? "—"}</strong></div><div><p className="text-xs text-muted-foreground">{t("performance.monthlyTarget")}</p><strong>{target.target.toLocaleString()}</strong></div><div><p className="text-xs text-muted-foreground">{t("performance.achievement")}</p><strong>{target.progressPct === null ? "—" : `${target.progressPct.toFixed(0)}%`}</strong></div></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${tone}`} style={{ width: `${Math.min(100, progress)}%` }} /></div></CardContent></Card>; }) : <p className="text-sm text-muted-foreground">{t("performance.unavailable")}</p>}</div></section>; }
function CompareSections({ reps }: { reps: TeamPerformanceRepRow[] }) { return <div className="space-y-3">{["Growth rates", "Performance vs target", "Additional targets"].map((title) => <Card key={title}><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent>{reps.length ? reps.map((rep) => <div key={rep.repEmail} className="border-b py-2 text-sm last:border-0">{rep.repName} — Sales: {rep.sales ?? "Insufficient data"}</div>) : <p className="text-sm text-muted-foreground">Select at least two Sales Reps.</p>}</CardContent></Card>)}</div>; }

function FlatTeamView({ reps }: { reps: TeamPerformanceRepRow[] }) {
  const { t } = useTranslation();
  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
            <Users className="h-4 w-4" />
          </span>
          {t("teamPerformance.flatViewTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {reps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("teamPerformance.emptyReps")}</p>
        ) : (
          reps.map((rep) => <RepRow key={rep.repEmail} rep={rep} />)
        )}
      </CardContent>
    </Card>
  );
}

// Manager/Admin view — a supervisor-level tree, collapsed by default. Reps
// only appear once their supervisor's node is expanded, per explicit
// product direction ("المناديب ماتظهرش للمدير إلا لما يفتح شجرة الفريق").
// Grouping key is now supervisorEmail resolved from Employees.DirectManagerID
// (Migration #7), not the old per-file supervisor-column vote.
function ManagerTreeView({ reps }: { reps: TeamPerformanceRepRow[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const bySupervisor = new Map<string, { name: string | null; reps: TeamPerformanceRepRow[] }>();
    for (const rep of reps) {
      const key = rep.supervisorEmail ?? "__unassigned__";
      const label = rep.supervisorName ?? null;
      const bucket = bySupervisor.get(key);
      if (bucket) bucket.reps.push(rep);
      else bySupervisor.set(key, { name: label, reps: [rep] });
    }
    return Array.from(bySupervisor.entries())
      .map(([key, bucket]) => {
        const sum = (field: "sales" | "collection" | "returns") => {
          const withValue = bucket.reps.filter((r) => r[field] !== null);
          return withValue.length > 0 ? withValue.reduce((s, r) => s + (r[field] ?? 0), 0) : null;
        };
        const sumPrior = (field: "salesPrior" | "collectionPrior" | "returnsPrior") => {
          const withPrior = bucket.reps.filter((r) => r[field] !== null);
          return withPrior.length > 0 ? withPrior.reduce((s, r) => s + (r[field] ?? 0), 0) : null;
        };
        return {
          key,
          name: bucket.name,
          reps: bucket.reps,
          sales: sum("sales"),
          salesPrior: sumPrior("salesPrior"),
          collection: sum("collection"),
          returns: sum("returns"),
        };
      })
      .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0));
  }, [reps]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
            <Users className="h-4 w-4" />
          </span>
          {t("teamPerformance.treeViewTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("teamPerformance.emptyReps")}</p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="rounded-xl border border-border/60 backdrop-blur-sm dark:border-white/[0.06]">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-3 text-start transition-colors hover:bg-secondary/40"
                onClick={() => toggle(group.key)}
              >
                <div className="flex items-center gap-2">
                  {expanded.has(group.key) ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="font-medium">{group.name ?? t("teamPerformance.noSupervisor")}</span>
                  <Badge variant="secondary">{t("teamPerformance.repCount", { count: group.reps.length })}</Badge>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {group.sales !== null ? (
                    <>
                      <span>{t("teamPerformance.salesValue", { value: formatAmount(group.sales) })}</span>
                      <TrendBadge current={group.sales} prior={group.salesPrior} />
                    </>
                  ) : (
                    <span>{t("teamPerformance.salesEmpty")}</span>
                  )}
                </div>
              </button>
              {expanded.has(group.key) && (
                <div className="space-y-2 border-t border-border/60 p-3 dark:border-white/[0.06]">
                  {group.reps.map((rep) => (
                    <RepRow key={rep.repEmail} rep={rep} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

async function exportResultToExcel(reps: TeamPerformanceRepRow[], t: Translate) {
  const XLSX = await import("xlsx");

  const rows = reps.map((r) => {
    const salesChangePct = r.sales !== null && r.salesPrior && r.salesPrior !== 0 ? Number((((r.sales - r.salesPrior) / r.salesPrior) * 100).toFixed(1)) : "";
    const collectionRatePct = r.sales && r.sales > 0 && r.collection !== null ? Number(((r.collection / r.sales) * 100).toFixed(1)) : "";
    const returnRatePct = r.sales && r.sales > 0 && r.returns !== null ? Number(((r.returns / r.sales) * 100).toFixed(1)) : "";
    return {
      [t("teamPerformance.colRep")]: r.repName,
      [t("teamPerformance.colEmail")]: r.repEmail,
      [t("teamPerformance.colSupervisor")]: r.supervisorName ?? t("teamPerformance.noSupervisor"),
      [t("teamPerformance.colSales")]: r.sales !== null ? Math.round(r.sales) : t("teamPerformance.notAvailable"),
      [t("teamPerformance.colSalesPrior")]: r.salesPrior !== null ? Math.round(r.salesPrior) : "",
      [t("teamPerformance.colSalesChangePct")]: salesChangePct,
      [t("teamPerformance.colCollection")]: r.collection !== null ? Math.round(r.collection) : t("teamPerformance.notAvailable"),
      [t("teamPerformance.colCollectionRatePct")]: collectionRatePct,
      [t("teamPerformance.colReturns")]: r.returns !== null ? Math.round(r.returns) : t("teamPerformance.notAvailable"),
      [t("teamPerformance.colReturnRatePct")]: returnRatePct,
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, t("teamPerformance.sheetName"));
  XLSX.writeFile(workbook, t("teamPerformance.fileName"));
}

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function TrendBadge({ current, prior }: { current: number; prior: number | null }) {
  if (prior === null) return null;
  if (prior === 0) return null;
  const pct = ((current - prior) / prior) * 100;
  const up = pct >= 0;
  return (
    <Badge variant="outline" className={`gap-1 border-transparent ${up ? "glow-success" : "glow-critical"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(Math.round(pct))}%
    </Badge>
  );
}

function RepRow({ rep }: { rep: TeamPerformanceRepRow }) {
  const { t } = useTranslation();
  const [coachResult, setCoachResult] = useState<TeamPerformanceCoachResult | null>(null);
  const coachMutation = useMutation({
    mutationFn: () =>
      teamPerformanceApi.coach({
        repName: rep.repName,
        sales: rep.sales ?? 0,
        salesPrior: rep.salesPrior,
        collection: rep.collection ?? 0,
        collectionPrior: rep.collectionPrior,
        returns: rep.returns ?? 0,
        returnsPrior: rep.returnsPrior,
      }),
    onSuccess: setCoachResult,
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("teamPerformance.coachError")),
  });

  const collectionRate = rep.sales && rep.sales > 0 && rep.collection !== null ? (rep.collection / rep.sales) * 100 : null;
  const returnRate = rep.sales && rep.sales > 0 && rep.returns !== null ? (rep.returns / rep.sales) * 100 : null;
  // Coaching needs concrete numbers — only offered once sales data exists
  // for this rep (the button's thresholds are meaningless against an
  // unavailable category).
  const canCoach = rep.sales !== null;

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{rep.repName}</p>
          <p className="text-xs text-muted-foreground">{rep.repEmail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {rep.sales !== null ? (
            <>
              <Badge variant="secondary">{t("teamPerformance.salesValue", { value: formatAmount(rep.sales) })}</Badge>
              <TrendBadge current={rep.sales} prior={rep.salesPrior} />
            </>
          ) : (
            <Badge variant="outline">{t("teamPerformance.salesUnavailable")}</Badge>
          )}
          {rep.collection !== null ? (
            <Badge variant="secondary">
              {t("teamPerformance.collectionValue", { value: formatAmount(rep.collection) })}
              {collectionRate !== null ? ` (${Math.round(collectionRate)}%)` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">{t("teamPerformance.collectionUnavailable")}</Badge>
          )}
          {rep.returns !== null ? (
            <Badge variant="secondary">
              {t("teamPerformance.returnsValue", { value: formatAmount(rep.returns) })}
              {returnRate !== null ? ` (${Math.round(returnRate)}%)` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">{t("teamPerformance.returnsUnavailable")}</Badge>
          )}
          {canCoach && (
            <Button variant="outline" size="sm" disabled={coachMutation.isPending} onClick={() => coachMutation.mutate()}>
              {coachMutation.isPending ? <Spinner /> : <Wand2 className="h-3.5 w-3.5 text-ai" />}
              {t("teamPerformance.coachButton")}
            </Button>
          )}
        </div>
      </div>
      {coachResult && (
        <p
          className={`rise-in mt-2 text-sm ${
            coachResult.tone === "attention" ? "text-warning" : coachResult.tone === "positive" ? "text-success" : "text-muted-foreground"
          }`}
        >
          {coachResult.note}
        </p>
      )}
    </div>
  );
}
