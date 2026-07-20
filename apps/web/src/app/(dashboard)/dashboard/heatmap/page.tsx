"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Flame, Sparkles } from "lucide-react";
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
import { HeatmapMap } from "@/components/heatmap/heatmap-map";
import { useTranslation } from "@/components/translation-provider";
import type { HeatmapDecisionResult, HeatmapQueryResult, HeatmapScopeField } from "@/lib/types";

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
      toast.success(t("heatmap.pointsToastSuccess", { count: data.usedRows }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("heatmap.queryErrorFallback")),
  });

  const canQuery = !needsTwoWindows(metric) || (!!priorDateFrom && !!priorDateTo && !!dateFrom && !!dateTo);

  function handleQuery() {
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

          <Button disabled={!canQuery || queryMutation.isPending} onClick={handleQuery}>
            {queryMutation.isPending ? <Spinner /> : <Flame className="h-4 w-4" />}
            {queryMutation.isPending ? t("heatmap.updatingButton") : t("heatmap.updateMapButton")}
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

      {result && <ResultView result={result} metricLabels={METRIC_LABELS} />}
    </div>
  );
}

function supportsCategoryFilter(metric: HeatmapMetric): boolean {
  return metric === "sales" || metric === "lostSales";
}

function needsTwoWindows(metric: HeatmapMetric): boolean {
  return metric === "lostSales" || metric === "opportunity";
}

function ResultView({ result, metricLabels }: { result: HeatmapQueryResult; metricLabels: Record<HeatmapMetric, string> }) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<HeatmapDecisionResult | null>(null);
  const decisionMutation = useMutation({
    mutationFn: heatmapApi.decisionSummary,
    onSuccess: setDecision,
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("heatmap.decisionErrorFallback")),
  });

  function handleGenerateDecisions() {
    const topPoints = [...result.points]
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
      .map((p) => ({ label: p.label, value: p.value }));
    decisionMutation.mutate({
      metric: result.metric,
      totalValue: result.totalValue,
      usedRows: result.usedRows,
      topPoints,
    });
  }

  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="crystal-badge h-7 w-7 bg-warning/15 text-warning">
            <Flame className="h-4 w-4" />
          </span>
          {t("heatmap.resultTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{t("heatmap.pointsBadge", { count: result.usedRows })}</Badge>
          <Badge variant="secondary">{t("heatmap.metricBadge", { metric: metricLabels[result.metric] })}</Badge>
          {result.metric !== "customerCount" && (
            <Badge variant="secondary">{t("heatmap.totalBadge", { total: Math.round(result.totalValue).toLocaleString("en-US") })}</Badge>
          )}
          {result.excludedBadCoordinates > 0 && (
            <Badge variant="warning">{t("heatmap.excludedBadge", { count: result.excludedBadCoordinates })}</Badge>
          )}
        </div>
        <HeatmapMap points={result.points} maxValue={result.maxValue} />

        <div className="space-y-3 border-t border-border pt-4">
          <Button variant="secondary" size="sm" disabled={result.points.length === 0 || decisionMutation.isPending} onClick={handleGenerateDecisions}>
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
