"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, MapPinned, RotateCcw } from "lucide-react";
import { decisionAnalyticsStudioApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "@/components/translation-provider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { DecisionAnalyzeByDimension, DecisionChartGroup, DecisionFilterField, DecisionFilters } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { decodeDecisionState, buildTerritoryIntelligenceDeepLink, type DecisionAnalysisState } from "@/lib/decision-analytics-state";
import { MultiSelectFilter } from "@/components/decision-analytics-studio/multi-select-filter";
import { KpiCards } from "@/components/decision-analytics-studio/kpi-cards";
import { ChartEngine } from "@/components/decision-analytics-studio/chart-engine";
import { MiniHeatmap } from "@/components/decision-analytics-studio/mini-heatmap";
import { AiInsightPanel } from "@/components/decision-analytics-studio/ai-insight-panel";
import { DetailTable } from "@/components/decision-analytics-studio/detail-table";

// Decision Analytics Studio — client-approved spec build (2026-07-22): one
// Global Analysis State object (analyzeBy + filters, defined below) that
// every widget on this page reads from and writes to — no widget updates
// another directly, per the spec's Cross Filtering requirement. The single
// POST /query call this state drives returns the KPI summary, the main
// chart's groups, the mini heat map, and the AI insight panel all from one
// consistent joined dataset (see decision-analytics-studio.service.ts).
//
// Drill-down (Category -> Brand -> SKU -> Customer -> Invoice) is not a
// separate mechanism: clicking a chart mark advances `analyzeBy` to the next
// step in that chain (category -> brand -> product -> customer) while
// narrowing filters to the clicked value; "Invoice" is simply the Detail
// Table at the bottom, which always reflects whatever filters are currently
// active. Dimensions outside that chain (territory/channel/representative/
// supervisor) have no further drill level, so clicking those just narrows
// the filter without changing analyzeBy.

// The subset of DecisionFilters keys that are string-array filters (every
// key except the date-range strings) — narrowing to this union (rather than
// `keyof DecisionFilters`) is what lets the computed-property assignments
// below type-check: every field in this union really is `string[] | undefined`.
type ArrayFilterField = Exclude<keyof DecisionFilters, "dateFrom" | "dateTo" | "priorDateFrom" | "priorDateTo">;

// analyzeBy -> which DecisionFilters array field a clicked group's key
// belongs to, and (for the primary drill chain only) which dimension to
// advance to next.
const DIMENSION_FILTER_FIELD: Record<DecisionAnalyzeByDimension, ArrayFilterField> = {
  territory: "cityValues",
  channel: "channelValues",
  category: "categoryValues",
  brand: "brandValues",
  product: "productCodes",
  customer: "customerCodes",
  representative: "repEmails",
  supervisor: "supervisorEmails",
};

const DRILL_CHAIN_NEXT: Partial<Record<DecisionAnalyzeByDimension, DecisionAnalyzeByDimension>> = {
  category: "brand",
  brand: "product",
  product: "customer",
};

// Local-calendar-date formatting, NOT `.toISOString().slice(0,10)` — that
// converts to UTC first, which silently shifts the date by one day for any
// user whose local timezone offset is non-zero (e.g. Cairo, UTC+2/+3: local
// midnight on the 1st becomes 22:00 UTC on the last day of the PREVIOUS
// month). This bit us in testing: the date-range inputs showed June 30 as
// "first of month" and July 21 as "today" instead of July 1 / July 22.
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return toLocalIso(new Date());
}

function firstOfMonthIso(): string {
  const d = new Date();
  return toLocalIso(new Date(d.getFullYear(), d.getMonth(), 1));
}

function defaultState(): DecisionAnalysisState {
  return {
    analyzeBy: "category",
    filters: { dateFrom: firstOfMonthIso(), dateTo: todayIso() },
  };
}

const FILTER_FIELDS: { field: DecisionFilterField; arrayKey: ArrayFilterField; labelKey: TranslationKey }[] = [
  { field: "branch", arrayKey: "branchIds", labelKey: "decisionAnalyticsStudio.filterBranch" },
  { field: "territory", arrayKey: "cityValues", labelKey: "decisionAnalyticsStudio.filterTerritory" },
  { field: "channel", arrayKey: "channelValues", labelKey: "decisionAnalyticsStudio.filterChannel" },
  { field: "category", arrayKey: "categoryValues", labelKey: "decisionAnalyticsStudio.filterCategory" },
  { field: "brand", arrayKey: "brandValues", labelKey: "decisionAnalyticsStudio.filterBrand" },
  { field: "product", arrayKey: "productCodes", labelKey: "decisionAnalyticsStudio.filterProduct" },
  { field: "customer", arrayKey: "customerCodes", labelKey: "decisionAnalyticsStudio.filterCustomer" },
  { field: "representative", arrayKey: "repEmails", labelKey: "decisionAnalyticsStudio.filterRepresentative" },
  { field: "supervisor", arrayKey: "supervisorEmails", labelKey: "decisionAnalyticsStudio.filterSupervisor" },
];

// useSearchParams() requires a Suspense boundary above it in the App Router
// (see assistant/page.tsx's identical wrapper — same reasoning: this page
// reads ?dasState=... on mount for the Territory Intelligence Return handoff).
export default function DecisionAnalyticsStudioPage() {
  return (
    <Suspense fallback={null}>
      <DecisionAnalyticsStudioWorkspace />
    </Suspense>
  );
}

function DecisionAnalyticsStudioWorkspace() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<DecisionAnalysisState>(defaultState);
  const [restoredFromUrl, setRestoredFromUrl] = useState(false);

  // Restore exact state on return from Territory Intelligence (?dasState=...)
  // — read once on mount, matching the SGIContext deep-link decode pattern.
  useEffect(() => {
    if (restoredFromUrl) return;
    const decoded = decodeDecisionState(searchParams.get("dasState"));
    if (decoded) setState(decoded);
    setRestoredFromUrl(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryResult = useQuery({
    queryKey: ["decision-analytics-studio", "query", state],
    queryFn: () => decisionAnalyticsStudioApi.query({ ...state.filters, analyzeBy: state.analyzeBy }),
    enabled: restoredFromUrl,
    placeholderData: (prev) => prev,
  });

  function setFilters(updater: (prev: DecisionFilters) => DecisionFilters) {
    setState((prev) => ({ ...prev, filters: updater(prev.filters) }));
  }

  function handleAnalyzeByChange(dim: DecisionAnalyzeByDimension) {
    setState((prev) => ({ ...prev, analyzeBy: dim }));
  }

  function handleGroupClick(group: DecisionChartGroup) {
    const field = DIMENSION_FILTER_FIELD[state.analyzeBy];
    const nextDim = DRILL_CHAIN_NEXT[state.analyzeBy];
    setState((prev) => ({
      analyzeBy: nextDim ?? prev.analyzeBy,
      filters: { ...prev.filters, [field]: [group.key] },
    }));
  }

  // Mini Heat Map is always City-grouped, so it only ever writes to
  // cityValues regardless of the active analyzeBy — toggled (add/remove),
  // not replaced, since a viewer might reasonably want more than one City
  // active on the map at once even while charting a different dimension.
  function handleToggleCity(id: string, _name: string) {
    setFilters((prev) => {
      const current = prev.cityValues ?? [];
      const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
      return { ...prev, cityValues: next.length > 0 ? next : undefined };
    });
  }

  function handleResetFilters() {
    setState(defaultState());
  }

  function handleOpenTerritoryIntelligence() {
    router.push(buildTerritoryIntelligenceDeepLink(state));
  }

  const activeFilterCount = useMemo(() => {
    return FILTER_FIELDS.reduce((n, f) => n + (state.filters[f.arrayKey]?.length ?? 0), 0);
  }, [state.filters]);

  const data = queryResult.data;
  const isPermissionDenied = queryResult.error instanceof ApiError && queryResult.error.status === 403;
  const isNoData = data ? !data.datasetsAvailable.invoices : false;
  const isEmptyResult = data ? data.datasetsAvailable.invoices && data.kpis.sales === 0 && data.kpis.ordersCount === 0 && data.chart.length === 0 : false;

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-blue-600/15 text-blue-700 drop-shadow-[0_0_24px_hsl(217_91%_60%/0.4)] dark:text-blue-400 sm:flex">
            <BarChart3 className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("decisionAnalyticsStudio.title")}</h1>
            <p className="text-muted-foreground">{t("decisionAnalyticsStudio.subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleResetFilters}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t("decisionAnalyticsStudio.resetFilters")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleOpenTerritoryIntelligence}>
            <MapPinned className="h-3.5 w-3.5" />
            {t("decisionAnalyticsStudio.openTerritoryIntelligence")}
          </Button>
        </div>
      </div>

      {/* Global filter bar */}
      <div className="glass-card rise-in flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <input
          type="date"
          value={state.filters.dateFrom}
          max={state.filters.dateTo}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
        <span className="text-xs text-muted-foreground">{t("decisionAnalyticsStudio.dateRangeSeparator")}</span>
        <input
          type="date"
          value={state.filters.dateTo}
          min={state.filters.dateFrom}
          onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
        <span className="mx-1 h-5 w-px bg-border" />
        {FILTER_FIELDS.map((f) => (
          <MultiSelectFilter
            key={f.field}
            field={f.field}
            label={t(f.labelKey)}
            selected={state.filters[f.arrayKey] ?? []}
            onChange={(values) => setFilters((prev) => ({ ...prev, [f.arrayKey]: values.length > 0 ? values : undefined }))}
          />
        ))}
        {activeFilterCount > 0 && (
          <span className="ms-auto text-xs text-muted-foreground">{t("decisionAnalyticsStudio.activeFiltersCount", { count: activeFilterCount })}</span>
        )}
      </div>

      {/* Workspace states */}
      {queryResult.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Spinner className="h-5 w-5" />
          {t("decisionAnalyticsStudio.loading")}
        </div>
      ) : isPermissionDenied ? (
        <p className="py-16 text-center text-sm text-destructive">{t("decisionAnalyticsStudio.permissionDenied")}</p>
      ) : queryResult.isError || !data ? (
        <p className="py-16 text-center text-sm text-destructive">{t("decisionAnalyticsStudio.errorLoad")}</p>
      ) : isNoData ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("decisionAnalyticsStudio.noData")}</p>
      ) : (
        <div className="space-y-6">
          <KpiCards kpis={data.kpis} />

          {isEmptyResult ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{t("decisionAnalyticsStudio.emptyResult")}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <ChartEngine
                groups={data.chart}
                analyzeBy={state.analyzeBy}
                onAnalyzeByChange={handleAnalyzeByChange}
                onGroupClick={handleGroupClick}
                highlightedKey={state.filters[DIMENSION_FILTER_FIELD[state.analyzeBy]]?.[0] ?? null}
                canDrillDeeper={Boolean(DRILL_CHAIN_NEXT[state.analyzeBy])}
              />
              <div className="space-y-4">
                <MiniHeatmap points={data.heatmap} selectedCityIds={state.filters.cityValues ?? []} onToggleCity={handleToggleCity} />
                <AiInsightPanel insights={data.insights} />
              </div>
            </div>
          )}

          <DetailTable filters={state.filters} />
        </div>
      )}
    </div>
  );
}
