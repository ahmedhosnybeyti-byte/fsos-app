"use client";

// Executive Analysis Panel for a selected City-level territory — the client's
// explicit mandate: "not a tooltip, not a property card, not a map sidebar.
// It is the executive decision center for the selected territory." Rendered
// ONLY at the "city" hierarchy level; the orchestrator renders something
// else at the "customer" level (see territory-customer-list.tsx).
//
// Single-scroll layout (not the old 5-tab layout) — an executive decision
// center reads like a BI dashboard page (Power BI / Tableau / ArcGIS), where
// every section is visible at once, not hidden behind tab clicks. Every
// section from the old 5-tab DecisionPanel (why/recommendation/suggested
// actions/expected impact/comparison/CTA) is still present here, just
// reorganized into the client's required section order.
//
// Every number below traces to a real field on TerritorySummaryItem — there
// is no total-sales figure on this type (only salesGrowthPct, a %), so that
// KPI card is deliberately omitted rather than fabricated. There is no
// historical/snapshot series either, so Performance Trend is an honest
// "not available yet" state, not a fabricated chart from a single data
// point.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, ChevronRight, LineChart, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { SgiSeverity, TerritoryMetrics, TerritorySummaryItem, TerritoryTier } from "@/lib/types";
import { TERRITORY_TIER_COLOR, type TerritoryMapMetric } from "./territory-map";

export interface TerritoryDecisionPanelProps {
  territory: TerritorySummaryItem;
  allTerritories: TerritorySummaryItem[];
  generatedAt: string;
  activeMetric: TerritoryMapMetric;
  onClose: () => void;
  onDrillDown: () => void;
  canDrillDeeper: boolean;
}

// --- Small local helpers/constants, deliberately duplicated per-module
// rather than imported from the old page.tsx's non-exported locals (this
// codebase's established isolation convention — see sgi.service.ts /
// heatmap.service.ts). ---

const TIER_LABEL_KEY: Record<TerritoryTier, TranslationKey> = {
  excellent: "territoryIntelligence.tierExcellent",
  good: "territoryIntelligence.tierGood",
  average: "territoryIntelligence.tierAverage",
  weak: "territoryIntelligence.tierWeak",
  veryWeak: "territoryIntelligence.tierVeryWeak",
};

const TIER_BADGE_VARIANT: Record<TerritoryTier, "success" | "warning" | "destructive"> = {
  excellent: "success",
  good: "success",
  average: "warning",
  weak: "warning",
  veryWeak: "destructive",
};

const SEVERITY_DOT: Record<SgiSeverity, string> = { high: "bg-destructive", medium: "bg-warning", low: "bg-success" };

// Extends the old page.tsx's METRIC_LABEL_KEY with the 3 new layers
// (visitCoveragePct/collectionHealthPct/riskLevel) that map/library didn't
// support pre-redesign — covers all 7 TerritoryMapMetric members.
const METRIC_TO_LABEL_KEY: Record<TerritoryMapMetric, TranslationKey> = {
  healthScore: "territoryIntelligence.metricHealthScore",
  salesGrowthPct: "territoryIntelligence.metricSalesGrowth",
  lostSalesCount: "territoryIntelligence.metricLostSales",
  visitCoveragePct: "territoryIntelligence.metricVisitCoverage",
  collectionHealthPct: "territoryIntelligence.metricCollectionHealth",
  opportunityValueSar: "territoryIntelligence.metricOpportunityValue",
  riskLevel: "territoryIntelligence.metricRiskLevel",
};

type MetricFieldKey = keyof TerritoryMetrics;

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function formatMetricValue(field: MetricFieldKey, value: number | null): string {
  if (value === null) return "—";
  if (field === "lostSalesCount") return Math.round(value).toLocaleString("en-US");
  return `${Math.round(value)}%`;
}

function KpiCard({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {badge}
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ComparisonTable({ a, b }: { a: TerritorySummaryItem; b: TerritorySummaryItem }) {
  const { t } = useTranslation();
  const rows: { labelKey: TranslationKey; a: string; b: string }[] = [
    { labelKey: "territoryIntelligence.metricHealthScore", a: String(a.healthScore), b: String(b.healthScore) },
    {
      labelKey: "territoryIntelligence.metricSalesGrowth",
      a: formatMetricValue("salesGrowthPct", a.metrics.salesGrowthPct),
      b: formatMetricValue("salesGrowthPct", b.metrics.salesGrowthPct),
    },
    {
      labelKey: "territoryIntelligence.metricActiveCustomerRate",
      a: formatMetricValue("activeCustomerRatePct", a.metrics.activeCustomerRatePct),
      b: formatMetricValue("activeCustomerRatePct", b.metrics.activeCustomerRatePct),
    },
    {
      labelKey: "territoryIntelligence.metricLostSales",
      a: formatMetricValue("lostSalesCount", a.metrics.lostSalesCount),
      b: formatMetricValue("lostSalesCount", b.metrics.lostSalesCount),
    },
    {
      labelKey: "territoryIntelligence.metricVisitCoverage",
      a: formatMetricValue("visitCoveragePct", a.metrics.visitCoveragePct),
      b: formatMetricValue("visitCoveragePct", b.metrics.visitCoveragePct),
    },
    {
      labelKey: "territoryIntelligence.metricCollectionHealth",
      a: formatMetricValue("collectionHealthPct", a.metrics.collectionHealthPct),
      b: formatMetricValue("collectionHealthPct", b.metrics.collectionHealthPct),
    },
    { labelKey: "territoryIntelligence.metricOpportunityValue", a: formatAmount(a.opportunityValueSar), b: formatAmount(b.opportunityValueSar) },
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead>{a.name}</TableHead>
          <TableHead>{b.name}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.labelKey}>
            <TableCell className="text-muted-foreground">{t(row.labelKey)}</TableCell>
            <TableCell>{row.a}</TableCell>
            <TableCell>{row.b}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function TerritoryDecisionPanel({
  territory,
  allTerritories,
  generatedAt,
  activeMetric,
  onClose,
  onDrillDown,
  canDrillDeeper,
}: TerritoryDecisionPanelProps) {
  const { t, locale } = useTranslation();
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonId, setComparisonId] = useState<string>("");

  // Rank 1 = worst health score first, matching "which territories need
  // attention first" (same worst-first ordering the API already uses for
  // TerritoryIntelligenceSummaryResponse.territories).
  const rank = useMemo(() => {
    const sorted = [...allTerritories].sort((a, b) => a.healthScore - b.healthScore);
    const index = sorted.findIndex((x) => x.id === territory.id);
    return { position: index >= 0 ? index + 1 : allTerritories.length, total: allTerritories.length };
  }, [allTerritories, territory.id]);

  const formattedGeneratedAt = useMemo(() => {
    const date = new Date(generatedAt);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }, [generatedAt, locale]);

  const growthItems = territory.why.filter((item) => item.type === "GROWTH_OPPORTUNITY");
  const comparisonTerritory = allTerritories.find((x) => x.id === comparisonId) ?? null;

  return (
    <Card className="glass-card rise-in h-fit">
      {/* 1. Territory Overview */}
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-2.5">
          <div>
            <CardTitle className="text-xl">{territory.name}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{t(METRIC_TO_LABEL_KEY[activeMetric])}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl font-bold tabular-nums">{territory.healthScore}</span>
            <Badge variant={TIER_BADGE_VARIANT[territory.tier]}>{t(TIER_LABEL_KEY[territory.tier])}</Badge>
          </div>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, territory.healthScore))}%`, backgroundColor: TERRITORY_TIER_COLOR[territory.tier] }}
            />
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t("territoryIntelligence.panelRanking")}: {t("territoryIntelligence.panelRankingValue", { rank: rank.position, total: rank.total })}
            </span>
            <span>
              {t("territoryIntelligence.panelLastUpdated")}: {formattedGeneratedAt}
            </span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("territoryIntelligence.panelClose")}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 2. Executive KPIs */}
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <KpiCard
            label={t("territoryIntelligence.metricSalesGrowth")}
            value={formatMetricValue("salesGrowthPct", territory.metrics.salesGrowthPct)}
            badge={
              territory.metrics.salesGrowthPct !== null ? (
                <Badge variant={territory.metrics.salesGrowthPct >= 0 ? "success" : "destructive"} className="whitespace-nowrap text-[10px]">
                  {t("territoryIntelligence.panelVsLastMonth")}
                </Badge>
              ) : undefined
            }
          />
          <KpiCard label={t("territoryIntelligence.metricLostSales")} value={formatMetricValue("lostSalesCount", territory.metrics.lostSalesCount)} />
          <KpiCard
            label={t("territoryIntelligence.metricActiveCustomerRate")}
            value={formatMetricValue("activeCustomerRatePct", territory.metrics.activeCustomerRatePct)}
          />
          <KpiCard label={t("territoryIntelligence.metricVisitCoverage")} value={formatMetricValue("visitCoveragePct", territory.metrics.visitCoveragePct)} />
          <KpiCard
            label={t("territoryIntelligence.metricCollectionHealth")}
            value={formatMetricValue("collectionHealthPct", territory.metrics.collectionHealthPct)}
          />
          <KpiCard label={t("territoryIntelligence.metricOpportunityValue")} value={formatAmount(territory.opportunityValueSar)} />
        </section>

        {/* 3. Performance Trend — no history/snapshot series exists on
            TerritorySummaryItem, so this is an honest "not available yet"
            state rather than a chart fabricated from one data point. */}
        <section className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-muted-foreground">
          <LineChart className="h-5 w-5 shrink-0" />
          <p className="text-sm">{t("territoryIntelligence.emptyState")}</p>
        </section>

        {/* 4. AI Insight */}
        <section>
          <p className="text-sm font-semibold">{t("territoryIntelligence.panelAiInsightTitle")}</p>
          {territory.why.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("territoryIntelligence.noWhyItems")}</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {territory.why.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[item.severity])} />
                  <span>
                    <span className="font-medium">{item.label}</span>
                    {" — "}
                    <span className="text-muted-foreground">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 5. Growth Opportunities */}
        <section>
          <p className="text-sm font-semibold">{t("territoryIntelligence.panelGrowthOpportunitiesTitle")}</p>
          <p className="mt-1 text-lg font-semibold text-success">{formatAmount(territory.opportunityValueSar)}</p>
          {growthItems.length > 0 ? (
            <ul className="mt-1.5 space-y-1.5">
              {growthItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[item.severity])} />
                  <span>
                    <span className="font-medium">{item.label}</span>
                    {" — "}
                    <span className="text-muted-foreground">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1.5">
              <p className="text-sm font-semibold">{t("territoryIntelligence.panelRecommendationTitle")}</p>
              <p className="text-sm text-muted-foreground">{territory.recommendation}</p>
            </div>
          )}
        </section>

        {/* 6. Recommended Actions */}
        <section>
          <p className="text-sm font-semibold">{t("territoryIntelligence.panelSuggestedActionsTitle")}</p>
          <ol className="mt-1 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            {territory.suggestedActions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ol>
          {territory.expectedImpactSar !== null && (
            <div className="mt-2">
              <p className="text-sm font-semibold">{t("territoryIntelligence.panelExpectedImpactTitle")}</p>
              <p className="text-lg font-semibold text-success">{formatAmount(territory.expectedImpactSar)}</p>
            </div>
          )}
        </section>

        {/* 7. Visit Plan */}
        <section className="space-y-3">
          <div>
            <p className="text-sm font-semibold">{t("territoryIntelligence.panelVisitPlanTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("territoryIntelligence.panelVisitPlanHint")}</p>
          </div>
          <Button asChild className="w-full">
            <Link href="/dashboard/visit-copilot">{t("territoryIntelligence.panelCtaCreateVisitPlan")}</Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowComparison((v) => !v)}>
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {t("territoryIntelligence.panelCompareBtn")}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled title="Coming soon">
              {t("territoryIntelligence.panelExportBtn")}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled title="Coming soon">
              {t("territoryIntelligence.panelShareBtn")}
            </Button>
          </div>

          {showComparison && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <Select value={comparisonId} onValueChange={setComparisonId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("territoryIntelligence.comparisonPickSecond")} />
                </SelectTrigger>
                <SelectContent>
                  {allTerritories
                    .filter((x) => x.id !== territory.id)
                    .map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {comparisonTerritory && <ComparisonTable a={territory} b={comparisonTerritory} />}
            </div>
          )}
        </section>

        {/* 8. Drill into customers */}
        {canDrillDeeper && (
          <Button type="button" variant="secondary" className="w-full" onClick={onDrillDown}>
            {t("territoryIntelligence.drillIntoHint")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}

        {/* 9. Close */}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("territoryIntelligence.panelClose")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
