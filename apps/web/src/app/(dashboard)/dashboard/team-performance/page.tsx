"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, TrendingDown, TrendingUp, Users, Wand2 } from "lucide-react";
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

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [priorDateFrom, setPriorDateFrom] = useState("");
  const [priorDateTo, setPriorDateTo] = useState("");

  const [result, setResult] = useState<TeamPerformanceResult | null>(null);

  const queryMutation = useMutation({
    mutationFn: teamPerformanceApi.query,
    onSuccess: (data) => {
      setResult(data);
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
          <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
            <div className="grid gap-2">
              <Label>{t("teamPerformance.dateFromLabel")}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>{t("teamPerformance.dateToLabel")}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Button variant="outline" size="sm" onClick={() => setCompareEnabled((v) => !v)}>
              {compareEnabled ? t("teamPerformance.compareDisableButton") : t("teamPerformance.compareEnableButton")}
            </Button>
            {compareEnabled && (
              <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
                <div className="grid gap-2">
                  <Label>{t("teamPerformance.priorDateFromLabel")}</Label>
                  <Input type="date" value={priorDateFrom} onChange={(e) => setPriorDateFrom(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("teamPerformance.priorDateToLabel")}</Label>
                  <Input type="date" value={priorDateTo} onChange={(e) => setPriorDateTo(e.target.value)} />
                </div>
              </div>
            )}
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
          {result.scopedToOwnTeam ? <FlatTeamView reps={result.reps} /> : <ManagerTreeView reps={result.reps} />}
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
