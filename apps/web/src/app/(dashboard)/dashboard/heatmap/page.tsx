"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, FileSpreadsheet, Flame, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { heatmapApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { HeatmapMap, LAYER_PALETTE, type HeatmapLayerData } from "@/components/heatmap/heatmap-map";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { HeatmapDecisionResult, HeatmapPoint, HeatmapQueryResult, HeatmapScopeField } from "@/lib/types";

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const ALL_VALUES = "__all__";

type HeatmapMetric = "sales" | "returns" | "collection" | "lostSales" | "opportunity" | "customerCount";

// Heat map — dashboard feature with a free-text filter box on top of a real
// interactive map. The prompt box calls POST /heatmap/interpret (Claude
// API, server-side) to turn a request like "وريني مبيعات الرياض بس الشهر
// ده" into scopeValue/dateFrom/dateTo/metric, which get applied to the
// visible form fields below (never queried blindly).
//
// Migration #3 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file or
// column mapping anymore. Customers/Invoices/Invoice Items/Returns/
// Collections/Products are resolved automatically via RieFacade — only the
// business choices remain (metric, optional scope/category narrowing, date
// windows).
export default function HeatmapPage() {
  const { t } = useTranslation();

  // Labels for the "value-column" metrics — mechanically identical
  // aggregation (see heatmap.service.ts), only the dataset/wording differs.
  // Covers Sales/Returns/Collection Heat Map, plus Customer Density Map via
  // "customerCount". "lostSales" (Lost Sales Map) and "opportunity"
  // (Territory Opportunity Map) each need two date windows to compare.
  const METRIC_LABELS: Record<HeatmapMetric, string> = {
    sales: t("heatmap.metricSales"),
    returns: t("heatmap.metricReturns"),
    collection: t("heatmap.metricCollection"),
    lostSales: t("heatmap.metricLostSales"),
    opportunity: t("heatmap.metricOpportunity"),
    customerCount: t("heatmap.metricCustomerCount"),
  };

  const SCOPE_FIELDS: { value: HeatmapScopeField; label: string }[] = [
    { value: "RouteID", label: t("heatmap.scopeRoute") },
    { value: "City", label: t("heatmap.scopeCity") },
    { value: "CustomerClass", label: t("heatmap.scopeCustomerClass") },
    { value: "Channel", label: t("heatmap.scopeChannel") },
  ];

  const [metric, setMetric] = useState<HeatmapMetric>("sales");

  const [scopeField, setScopeField] = useState<HeatmapScopeField | "">("");
  const [selectedScopeValues, setSelectedScopeValues] = useState<Set<string>>(new Set());

  const [categoryFilterEnabled, setCategoryFilterEnabled] = useState(false);
  const [categoryValue, setCategoryValue] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [priorDateFrom, setPriorDateFrom] = useState("");
  const [priorDateTo, setPriorDateTo] = useState("");

  const scopeValuesQuery = useQuery({
    queryKey: ["heatmap", "scope-values", scopeField],
    queryFn: () => heatmapApi.scopeValues({ scopeField: scopeField as HeatmapScopeField }),
    enabled: !!scopeField,
  });

  const categoryValuesQuery = useQuery({
    queryKey: ["heatmap", "category-values"],
    queryFn: () => heatmapApi.categoryValues(),
    enabled: supportsCategoryFilter(metric) && categoryFilterEnabled,
  });

  const [prompt, setPrompt] = useState("");
  const [lastExplanation, setLastExplanation] = useState<string | null>(null);

  const interpretMutation = useMutation({
    mutationFn: heatmapApi.interpret,
    onSuccess: (data) => {
      setLastExplanation(data.explanation);
      if (!data.understood) {
        toast.warning(data.explanation || t("heatmap.interpretWarningFallback"));
        return;
      }
      if (data.scopeValue !== null && scopeField) setSelectedScopeValues(new Set([data.scopeValue]));
      if (data.dateFrom !== null) setDateFrom(data.dateFrom);
      if (data.dateTo !== null) setDateTo(data.dateTo);
      if (data.metric !== null) setMetric(data.metric);
      toast.success(data.explanation || t("heatmap.interpretSuccessFallback"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("heatmap.interpretErrorFallback")),
  });

  const [result, setResult] = useState<HeatmapQueryResult | null>(null);
  const queryMutation = useMutation({
    mutationFn: heatmapApi.query,
    onSuccess: (data) => {
      setResult(data);
      setLayerResults(null);
      toast.success(t("heatmap.pointsToastSuccess", { count: data.usedRows }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("heatmap.queryErrorFallback")),
  });

  // Multi-layer mode (Task #251, explicit product request): several values
  // of one dimension (a handful of product categories, or a handful of
  // sales channels/routes/cities/customer classes) shown as SEPARATE
  // toggleable heat layers on the same map, instead of the single-value
  // filter above which only ever narrows the map to one thing at a time.
  // "category" isn't a real HeatmapScopeField (it's its own endpoint,
  // heatmapApi.categoryValues(), same asymmetry the single-value filter
  // above already has), so the dimension type is a small union rather than
  // reusing HeatmapScopeField directly. Reuses the existing single-value
  // query endpoint once per selected value (Promise.all) — no backend
  // change needed, this is purely a frontend layering of already-supported
  // queries.
  type LayerDimension = "category" | HeatmapScopeField;
  const [multiLayerMode, setMultiLayerMode] = useState(false);
  const [layerDimension, setLayerDimension] = useState<LayerDimension>("category");
  const [selectedLayerValues, setSelectedLayerValues] = useState<Set<string>>(new Set());

  const layerValuesQuery = useQuery({
    queryKey: ["heatmap", "layer-values", layerDimension],
    queryFn: () => (layerDimension === "category" ? heatmapApi.categoryValues() : heatmapApi.scopeValues({ scopeField: layerDimension })),
    enabled: multiLayerMode,
  });

  const [layerResults, setLayerResults] = useState<HeatmapLayerData[] | null>(null);
  const multiLayerMutation = useMutation({
    mutationFn: async () => {
      const values = Array.from(selectedLayerValues);
      const responses = await Promise.all(
        values.map((v) =>
          heatmapApi.query({
            metric,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            priorDateFrom: needsTwoWindows(metric) ? priorDateFrom || undefined : undefined,
            priorDateTo: needsTwoWindows(metric) ? priorDateTo || undefined : undefined,
            ...(layerDimension === "category" ? { categoryValue: v } : { scopeField: layerDimension, scopeValues: [v] }),
          }),
        ),
      );
      const layers: HeatmapLayerData[] = values.map((v, i) => ({
        id: v,
        label: v,
        color: LAYER_PALETTE[i % LAYER_PALETTE.length]!,
        points: responses[i]!.points,
        maxValue: responses[i]!.maxValue,
      }));
      return layers;
    },
    onSuccess: (layers) => {
      setLayerResults(layers);
      setResult(null);
      const totalPoints = layers.reduce((sum, l) => sum + l.points.length, 0);
      toast.success(t("heatmap.pointsToastSuccess", { count: totalPoints }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("heatmap.queryErrorFallback")),
  });

  const canQuery =
    (!needsTwoWindows(metric) || (!!priorDateFrom && !!priorDateTo && !!dateFrom && !!dateTo)) && (!multiLayerMode || selectedLayerValues.size > 0);

  function handleQuery() {
    if (multiLayerMode) {
      multiLayerMutation.mutate();
      return;
    }
    queryMutation.mutate({
      metric,
      scopeField: scopeField || undefined,
      scopeValues: scopeField && selectedScopeValues.size > 0 ? Array.from(selectedScopeValues) : undefined,
      categoryValue: supportsCategoryFilter(metric) && categoryFilterEnabled ? categoryValue || undefined : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      priorDateFrom: needsTwoWindows(metric) ? priorDateFrom || undefined : undefined,
      priorDateTo: needsTwoWindows(metric) ? priorDateTo || undefined : undefined,
    });
  }

  function handleInterpret() {
    if (!prompt.trim()) return;
    interpretMutation.mutate({
      prompt: prompt.trim(),
      scopeColumn: scopeField || undefined,
      scopeValues: scopeValuesQuery.data?.values,
      currentScopeValue: Array.from(selectedScopeValues)[0],
      currentDateFrom: dateFrom || undefined,
      currentDateTo: dateTo || undefined,
    });
  }

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="crystal-badge h-11 w-11 bg-warning/15 text-warning drop-shadow-[0_0_20px_hsl(var(--warning)/0.4)]">
            <Flame className="h-5 w-5" />
          </span>
          {t("heatmap.title")}
        </h1>
        <p className="text-muted-foreground">{t("heatmap.subtitle")}</p>
      </div>

      <div className="glass-hero rise-in rise-d1 relative p-6">
        <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
        <h3 className="relative flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight">
          <span className="crystal-badge h-11 w-11 bg-warning/15 text-warning drop-shadow-[0_0_20px_hsl(var(--warning)/0.4)]">
            <Flame className="h-5 w-5" />
          </span>
          {t("heatmap.settingsTitle")}
        </h3>
        <div className="relative mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>{t("heatmap.scopeFieldLabel")}</Label>
              <Select
                value={scopeField || "__none__"}
                onValueChange={(v) => {
                  setScopeField(v === "__none__" ? "" : (v as HeatmapScopeField));
                  setSelectedScopeValues(new Set());
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("heatmap.scopeFieldNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("heatmap.scopeFieldNone")}</SelectItem>
                  {SCOPE_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("heatmap.scopeValueLabel")}</Label>
              <Select
                value={selectedScopeValues.size === 1 ? Array.from(selectedScopeValues)[0] : ALL_VALUES}
                onValueChange={(v) => setSelectedScopeValues(v === ALL_VALUES ? new Set() : new Set([v]))}
                disabled={!scopeField}
              >
                <SelectTrigger>
                  <SelectValue placeholder={scopeValuesQuery.isLoading ? t("heatmap.loading") : t("heatmap.scopeValueAll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUES}>{t("heatmap.scopeValueAll")}</SelectItem>
                  {(scopeValuesQuery.data?.values ?? []).map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("heatmap.metricLabel")}</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as HeatmapMetric)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">{METRIC_LABELS.sales}</SelectItem>
                  <SelectItem value="returns">{METRIC_LABELS.returns}</SelectItem>
                  <SelectItem value="collection">{METRIC_LABELS.collection}</SelectItem>
                  <SelectItem value="lostSales">{METRIC_LABELS.lostSales}</SelectItem>
                  <SelectItem value="opportunity">{METRIC_LABELS.opportunity}</SelectItem>
                  <SelectItem value="customerCount">{METRIC_LABELS.customerCount}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {supportsCategoryFilter(metric) && (
            <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setCategoryFilterEnabled((v) => !v)}
              >
                {categoryFilterEnabled ? t("heatmap.categoryFilterDisable") : t("heatmap.categoryFilterEnable")}
              </Button>
              {categoryFilterEnabled && (
                <div className="grid gap-2 sm:max-w-xs">
                  <Label>{t("heatmap.categoryLabel")}</Label>
                  <Select value={categoryValue} onValueChange={setCategoryValue}>
                    <SelectTrigger>
                      <SelectValue placeholder={categoryValuesQuery.isLoading ? t("heatmap.loading") : t("heatmap.categoryPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(categoryValuesQuery.data?.values ?? []).map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-md border border-dashed border-border p-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setMultiLayerMode((v) => !v)}
            >
              {multiLayerMode ? t("heatmap.layersDisable") : t("heatmap.layersEnable")}
            </Button>
            {multiLayerMode && (
              <div className="space-y-3">
                <div className="grid gap-2 sm:max-w-xs">
                  <Label>{t("heatmap.layerDimensionLabel")}</Label>
                  <Select
                    value={layerDimension}
                    onValueChange={(v) => {
                      setLayerDimension(v as "category" | HeatmapScopeField);
                      setSelectedLayerValues(new Set());
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {supportsCategoryFilter(metric) && <SelectItem value="category">{t("heatmap.categoryLabel")}</SelectItem>}
                      {SCOPE_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {layerValuesQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">{t("heatmap.loading")}</p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {(layerValuesQuery.data?.values ?? []).map((v) => (
                      <label key={v} className="flex cursor-pointer items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedLayerValues.has(v)}
                          onChange={(e) =>
                            setSelectedLayerValues((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(v);
                              else next.delete(v);
                              return next;
                            })
                          }
                          className="h-3.5 w-3.5"
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{t("heatmap.layersHint")}</p>
              </div>
            )}
          </div>

          {!needsTwoWindows(metric) && (
            <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
              <div className="grid gap-2">
                <Label>{t("heatmap.dateFromLabel")}</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>{t("heatmap.dateToLabel")}</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          )}

          {metric === "lostSales" && <p className="text-xs text-muted-foreground">{t("heatmap.lostSalesHint")}</p>}
          {metric === "opportunity" && <p className="text-xs text-muted-foreground">{t("heatmap.opportunityHint")}</p>}

          {needsTwoWindows(metric) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-md border border-border p-3">
                <Label className="text-xs text-muted-foreground">{t("heatmap.priorWindowLabel")}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input type="date" value={priorDateFrom} onChange={(e) => setPriorDateFrom(e.target.value)} />
                  <Input type="date" value={priorDateTo} onChange={(e) => setPriorDateTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-border p-3">
                <Label className="text-xs text-muted-foreground">{t("heatmap.recentWindowLabel")}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <Button disabled={!canQuery || queryMutation.isPending || multiLayerMutation.isPending} onClick={handleQuery}>
            {queryMutation.isPending || multiLayerMutation.isPending ? <Spinner /> : <Flame className="h-4 w-4" />}
            {queryMutation.isPending || multiLayerMutation.isPending ? t("heatmap.updatingButton") : t("heatmap.updateMapButton")}
          </Button>
        </div>
      </div>

      <Card className="glass-card rise-in rise-d2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="crystal-badge h-7 w-7 bg-ai/15 text-ai">
              <Sparkles className="h-4 w-4" />
            </span>
            {t("heatmap.freeTextTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder={t("heatmap.freeTextPlaceholder")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInterpret()}
            />
            <Button variant="outline" disabled={!prompt.trim() || interpretMutation.isPending} onClick={handleInterpret}>
              {interpretMutation.isPending ? <Spinner /> : <Sparkles className="h-4 w-4" />}
              {t("heatmap.applyButton")}
            </Button>
          </div>
          {lastExplanation && <p className="text-sm text-muted-foreground">{lastExplanation}</p>}
          <p className="text-xs text-muted-foreground">{t("heatmap.freeTextHint")}</p>
        </CardContent>
      </Card>

      {(result || layerResults) && (
        <ResultView
          result={result}
          layers={layerResults}
          metric={metric}
          metricLabels={METRIC_LABELS}
          layersTitle={layerResults ? (layerDimension === "category" ? t("heatmap.categoryLabel") : SCOPE_FIELDS.find((f) => f.value === layerDimension)?.label) : undefined}
        />
      )}
    </div>
  );
}

// Same dynamic-import + json_to_sheet pattern already used by Team
// Performance / Visit Efficiency / Route Planning's Excel export buttons.
// Multi-layer results get an extra "الطبقة" column so a rep can filter/pivot
// per category or channel in Excel after the fact; single-query results
// skip that column since there's only ever one layer.
async function exportHeatmapToExcel({
  layers,
  points,
  metricLabel,
  t,
}: {
  layers: HeatmapLayerData[] | null;
  points: HeatmapPoint[];
  metricLabel: string;
  t: Translate;
}) {
  const XLSX = await import("xlsx");

  const rows = layers
    ? layers.flatMap((l) => l.points.map((p) => ({ [t("heatmap.colLayer")]: l.label, ...pointRow(p, metricLabel, t) })))
    : points.map((p) => pointRow(p, metricLabel, t));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, t("heatmap.sheetName"));
  XLSX.writeFile(workbook, t("heatmap.fileName"));
}

function pointRow(p: HeatmapPoint, metricLabel: string, t: Translate) {
  return {
    [t("heatmap.colLabel")]: p.label,
    [t("heatmap.colMetric")]: metricLabel,
    [t("heatmap.colValue")]: Math.round(p.value),
    [t("heatmap.colLat")]: p.lat,
    [t("heatmap.colLon")]: p.lon,
  };
}

function supportsCategoryFilter(metric: HeatmapMetric): boolean {
  return metric === "sales" || metric === "lostSales";
}

function needsTwoWindows(metric: HeatmapMetric): boolean {
  return metric === "lostSales" || metric === "opportunity";
}

// Renders either the classic single-query result (`result`) or a
// multi-layer result (`layers`, Task #251) — never both at once (page.tsx's
// queryMutation/multiLayerMutation each clear the other's state on
// success). Stats (points/total/etc.) are derived generically across
// whichever mode is active so the badges and "AI Decision" button below
// don't need their own mode branching.
function ResultView({
  result,
  layers,
  metric,
  metricLabels,
  layersTitle,
}: {
  result: HeatmapQueryResult | null;
  layers: HeatmapLayerData[] | null;
  metric: HeatmapMetric;
  metricLabels: Record<HeatmapMetric, string>;
  layersTitle?: string;
}) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<HeatmapDecisionResult | null>(null);
  const decisionMutation = useMutation({
    mutationFn: heatmapApi.decisionSummary,
    onSuccess: setDecision,
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("heatmap.decisionErrorFallback")),
  });

  const allPoints: HeatmapPoint[] = layers ? layers.flatMap((l) => l.points) : (result?.points ?? []);
  const usedRowsCount = layers ? allPoints.length : (result?.usedRows ?? 0);
  const totalValue = layers ? layers.reduce((sum, l) => sum + l.points.reduce((s, p) => s + p.value, 0), 0) : (result?.totalValue ?? 0);
  const excludedBadCoordinates = result?.excludedBadCoordinates ?? 0;
  const displayMetric = result?.metric ?? metric;

  function handleGenerateDecisions() {
    const topPoints = [...allPoints]
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
      .map((p) => ({ label: p.label, value: p.value }));
    decisionMutation.mutate({
      metric: displayMetric,
      totalValue,
      usedRows: usedRowsCount,
      topPoints,
    });
  }

  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="crystal-badge h-7 w-7 bg-warning/15 text-warning">
              <Flame className="h-4 w-4" />
            </span>
            {t("heatmap.resultTitle")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={allPoints.length === 0}
            onClick={() => exportHeatmapToExcel({ layers, points: result?.points ?? [], metricLabel: metricLabels[displayMetric], t })}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t("heatmap.exportExcelButton")}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{t("heatmap.pointsBadge", { count: usedRowsCount })}</Badge>
          <Badge variant="secondary">{t("heatmap.metricBadge", { metric: metricLabels[displayMetric] })}</Badge>
          {displayMetric !== "customerCount" && (
            <Badge variant="secondary">{t("heatmap.totalBadge", { total: Math.round(totalValue).toLocaleString("en-US") })}</Badge>
          )}
          {excludedBadCoordinates > 0 && <Badge variant="warning">{t("heatmap.excludedBadge", { count: excludedBadCoordinates })}</Badge>}
          {layers && <Badge variant="secondary">{t("heatmap.layersBadge", { count: layers.length })}</Badge>}
        </div>
        <HeatmapMap layers={layers ?? undefined} points={layers ? undefined : result?.points} maxValue={layers ? undefined : result?.maxValue} layersTitle={layersTitle} />

        <div className="space-y-3 border-t border-border pt-4">
          <Button variant="secondary" size="sm" disabled={allPoints.length === 0 || decisionMutation.isPending} onClick={handleGenerateDecisions}>
            {decisionMutation.isPending ? <Spinner className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
            {t("heatmap.generateDecisionsButton")}
          </Button>
          {decision && (
            <div className="glow-ai rise-in space-y-3 rounded-lg p-4">
              <p className="text-sm">{decision.summary}</p>
              <ol className="list-inside list-decimal space-y-2 text-sm">
                {decision.actions.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{a.title}</span> — <span className="text-muted-foreground">{a.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
