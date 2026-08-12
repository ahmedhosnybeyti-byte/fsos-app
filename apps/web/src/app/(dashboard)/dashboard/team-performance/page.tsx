"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, TrendingDown, TrendingUp, Users, Wand2, CircleDollarSign, ClipboardCheck, ReceiptText, Package, RotateCcw } from "lucide-react";
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
import { KpiCard } from "@/components/dashboard/kpi-card";
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

export default function TeamPerformancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const initialPeriod = useMemo(() => { const now = new Date(); const pad = (n: number) => String(n).padStart(2, "0"); const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now), priorFrom: iso(prior), priorTo: iso(new Date(prior.getFullYear(), prior.getMonth(), Math.min(now.getDate(), new Date(prior.getFullYear(), prior.getMonth() + 1, 0).getDate()))) }; }, []);
  const [dateFrom] = useState(initialPeriod.from);
  const [dateTo] = useState(initialPeriod.to);
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [priorDateFrom] = useState(initialPeriod.priorFrom);
  const [priorDateTo] = useState(initialPeriod.priorTo);

  const [result, setResult] = useState<TeamPerformanceResult | null>(null);
  const [mode, setMode] = useState<"focus" | "compare">("focus");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [showAdditionalTargets, setShowAdditionalTargets] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  const queryMutation = useMutation({
    mutationFn: teamPerformanceApi.query,
    onSuccess: (data) => {
      setResult(data);
      setSelectedSupervisor(""); setSelectedReps([]); setDiagnostic(null);
      toast.success(t("teamPerformance.repCount", { count: data.reps.length }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("teamPerformance.loadError")),
  });

  const canQuery = !!dateFrom && !!dateTo && (!compareEnabled || (!!priorDateFrom && !!priorDateTo));

  function handleQuery() {
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
          <div className="rise-in flex flex-wrap items-center justify-between gap-2">
            <CategoryAvailabilityBadges categoriesAvailable={result.categoriesAvailable} />
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => exportResultToExcel(result.reps, t)}>
              <Download className="h-3.5 w-3.5" />
              {t("teamPerformance.exportExcelButton")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

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
    if (value === null || value === undefined) return "Insufficient data";
    const priorField = props.diagnostic === "sales" ? "salesPrior" : props.diagnostic === "collections" ? "collectionPrior" : props.diagnostic === "returns" ? "returnsPrior" : null;
    const prior = priorField ? focused.reduce((sum, rep) => sum + (rep[priorField] ?? 0), 0) : null;
    const declining = prior !== null && prior > 0 && value < prior;
    const returnRate = totals.sales && totals.returns !== null ? totals.returns / totals.sales : null;
    if (props.diagnostic === "returns" && returnRate !== null && returnRate > 0.1) return `Issue: elevated returns. Evidence: returns are ${(returnRate * 100).toFixed(1)}% of sales. Possible cause: possible over-loading; confidence: medium. Recommended action: review delivery quantities against sell-through.`;
    if (declining) return `Issue: performance declined. Evidence: ${props.diagnostic} is below the comparison period. Possible cause: insufficient evidence to attribute a root cause; confidence: medium. Recommended action: review the selected team's execution plan.`;
    return `Issue: no material adverse signal. Evidence: current ${props.diagnostic} is supported by the selected data. Possible cause: not applicable; confidence: high. Recommended action: continue monitoring.`;
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
