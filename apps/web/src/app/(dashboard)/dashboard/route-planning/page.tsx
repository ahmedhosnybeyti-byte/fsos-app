"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Gauge, Map as MapIcon, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { routePlanningApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RouteSplitMap } from "@/components/route-planning/route-split-map";
import type { RoutePlanningScopeField, RoutePlanningSplitResult } from "@/lib/types";
import { useTranslation } from "@/components/translation-provider";

// Balanced Route/Territory Split — dashboard-only feature (chosen over a
// GPT Action so it's a one-click, always-visible dashboard tool rather than
// something a supervisor has to know to ask a chatbot for). See
// docs/PROJECT_LOG.md's "Route-splitting / territory design" section for
// the full design history behind the algorithm this calls.
//
// Migration #4 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file or
// column mapping anymore. Customers/Invoices/Invoice Items are resolved
// automatically via RieFacade (sales value is always the RIE "sales"
// aggregate) — only the business choices remain (scope field/values, group
// count).
const SCOPE_FIELDS: { value: RoutePlanningScopeField; labelKey: "routePlanning.scopeRoute" | "routePlanning.scopeCity" | "routePlanning.scopeCustomerClass" | "routePlanning.scopeChannel" }[] = [
  { value: "RouteID", labelKey: "routePlanning.scopeRoute" },
  { value: "City", labelKey: "routePlanning.scopeCity" },
  { value: "CustomerClass", labelKey: "routePlanning.scopeCustomerClass" },
  { value: "Channel", labelKey: "routePlanning.scopeChannel" },
];

export default function RoutePlanningPage() {
  const { t, locale } = useTranslation();
  const [scopeField, setScopeField] = useState<RoutePlanningScopeField | "">("");
  // Multi-select — a supervisor pools one or more existing scope values
  // (e.g. several reps) into one customer set before re-splitting into
  // `groupCount` groups. groupCount is independent of how many values are
  // selected: it can shrink (consolidate routes), stay the same (rebalance
  // as-is), or grow (add a new route).
  const [selectedScopeValues, setSelectedScopeValues] = useState<Set<string>>(new Set());
  const [groupCount, setGroupCount] = useState(6);
  // Auto-follows the checkbox count (the common "rebalance the same N
  // routes" case needs zero typing) until the user manually edits the
  // number — then it stops auto-following, so the "add/consolidate routes"
  // case still works by just typing a different number.
  const [groupCountTouched, setGroupCountTouched] = useState(false);

  const scopeValuesQuery = useQuery({
    queryKey: ["route-planning", "scope-values", scopeField],
    queryFn: () => routePlanningApi.scopeValues({ scopeField: scopeField as RoutePlanningScopeField }),
    enabled: !!scopeField,
  });

  const [result, setResult] = useState<RoutePlanningSplitResult | null>(null);
  const [mode, setMode] = useState<"before" | "after">("after");
  // Route Performance Map: color markers by performance tier (green/amber/
  // red vs. target) instead of an arbitrary per-group color.
  const [colorBy, setColorBy] = useState<"group" | "performance">("group");
  // Editable per-group names, defaulted from the selected scope values (in
  // list order) so a rebalance-among-the-same-4 case starts pre-labeled
  // with real rep names. Any group beyond the selected count (adding a new
  // route) gets a generic "خط جديد N" placeholder. These are a starting
  // suggestion only — the split algorithm doesn't map new geographic
  // groups back to specific original routes, so the user should review and
  // rename before exporting.
  const [groupLabels, setGroupLabels] = useState<string[]>([]);

  const splitMutation = useMutation({
    mutationFn: routePlanningApi.split,
    onSuccess: (data) => {
      setResult(data);
      setMode("after");
      const orderedSelected = (scopeValuesQuery.data?.values ?? []).filter((v) => selectedScopeValues.has(v));
      let extra = 0;
      setGroupLabels(
        Array.from({ length: data.groupCount }, (_, i) => {
          const v = orderedSelected[i];
          if (v !== undefined) return v;
          extra += 1;
          return `${t("routePlanning.newRoute")}${extra}`;
        }),
      );
      toast.success(`${t("routePlanning.splitComplete")}${data.usedRows}${t("routePlanning.customersAcross")}${data.groupCount}${t("routePlanning.groups")}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("routePlanning.splitError")),
  });

  const canSubmit = !!scopeField && selectedScopeValues.size > 0 && groupCount >= 2;

  function handleSubmit() {
    if (!scopeField) return;
    splitMutation.mutate({
      scopeField,
      scopeValues: Array.from(selectedScopeValues),
      groupCount,
    });
  }

  function handleLabelChange(index: number, value: string) {
    setGroupLabels((prev) => prev.map((l, i) => (i === index ? value : l)));
  }

  return (
    <div key={locale} className="relative space-y-6">

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <MapIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("routePlanning.title")}</h1>
          <p className="text-muted-foreground">{t("routePlanning.subtitle")}</p>
        </div>
      </div>

      <Card className="glass-card rise-in rise-d1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <MapIcon className="h-4 w-4" />
            </span>
            {t("routePlanning.settings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
            <div className="grid gap-2">
              <Label>{t("routePlanning.scopeField")}</Label>
              <Select
                value={scopeField || "__none__"}
                onValueChange={(v) => {
                  setScopeField(v === "__none__" ? "" : (v as RoutePlanningScopeField));
                  setSelectedScopeValues(new Set());
                  setGroupCountTouched(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("routePlanning.selectField")} />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {t(f.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("routePlanning.groupCount")}</Label>
              <Input
                type="number"
                min={2}
                max={20}
                value={groupCount}
                onChange={(e) => {
                  setGroupCountTouched(true);
                  setGroupCount(Number(e.target.value) || 2);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t("routePlanning.groupCountHint")}{" "}
                {groupCountTouched && selectedScopeValues.size >= 2 && (
                  <button
                    type="button"
                    className="text-primary underline underline-offset-2"
                    onClick={() => {
                      setGroupCountTouched(false);
                      setGroupCount(selectedScopeValues.size);
                    }}
                  >
                    {t("routePlanning.restoreAuto")}
                  </button>
                )}
              </p>
            </div>
          </div>

          <ScopeValueChecklist
            values={scopeValuesQuery.data?.values ?? []}
            loading={scopeValuesQuery.isLoading}
            disabled={!scopeField}
            selected={selectedScopeValues}
            onToggle={(v) =>
              setSelectedScopeValues((prev) => {
                const next = new Set(prev);
                if (next.has(v)) next.delete(v);
                else next.add(v);
                if (!groupCountTouched && next.size >= 2) setGroupCount(next.size);
                return next;
              })
            }
            onSelectAll={() => {
              const all = new Set(scopeValuesQuery.data?.values ?? []);
              setSelectedScopeValues(all);
              if (!groupCountTouched && all.size >= 2) setGroupCount(all.size);
            }}
            onClearAll={() => setSelectedScopeValues(new Set())}
          />

          <Button disabled={!canSubmit || splitMutation.isPending} onClick={handleSubmit}>
            <Wand2 className="h-4 w-4" />
            {splitMutation.isPending ? t("routePlanning.splitting") : t("routePlanning.splitNow")}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <ResultView
          result={result}
          mode={mode}
          onModeChange={setMode}
          labels={groupLabels}
          onLabelChange={handleLabelChange}
          colorBy={colorBy}
          onColorByChange={setColorBy}
        />
      )}
    </div>
  );
}

function ScopeValueChecklist({
  values,
  loading,
  disabled,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  values: string[];
  loading: boolean;
  disabled: boolean;
  selected: Set<string>;
  onToggle: (v: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{t("routePlanning.scopeValues")}</Label>
        {!disabled && values.length > 0 && (
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-primary underline underline-offset-2" onClick={onSelectAll}>
              {t("routePlanning.selectAll")}
            </button>
            <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={onClearAll}>
              {t("routePlanning.clearAll")}
            </button>
          </div>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
        {disabled ? (
          <p className="p-1 text-sm text-muted-foreground">{t("routePlanning.chooseScopeFirst")}</p>
        ) : loading ? (
          <p className="p-1 text-sm text-muted-foreground">{t("routePlanning.loading")}</p>
        ) : values.length === 0 ? (
          <p className="p-1 text-sm text-muted-foreground">{t("routePlanning.noValues")}</p>
        ) : (
          <div className="space-y-1">
            {values.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-secondary/50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary"
                  checked={selected.has(v)}
                  onChange={() => onToggle(v)}
                />
                {v}
              </label>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{selected.size}{t("routePlanning.selectedValues")}</p>
    </div>
  );
}

// Client-side export — the split result (records + before/after group
// assignments) already lives in the browser after a successful split, so we
// build the .xlsx directly here instead of round-tripping through the API.
// xlsx is dynamically imported so it doesn't bloat the initial page bundle.
async function exportResultToExcel(result: RoutePlanningSplitResult, labels: string[], t: ReturnType<typeof useTranslation>["t"]) {
  const XLSX = await import("xlsx");
  const labelOf = (i: number) => labels[i] ?? t("routePlanning.group", { count: i + 1 });
  const rows = result.records.map((r) => ({
    [t("routePlanning.exportCustomerId")]: r.id,
    [t("routePlanning.exportName")]: r.label,
    [t("routePlanning.exportLatitude")]: r.lat,
    [t("routePlanning.exportLongitude")]: r.lon,
    [t("routePlanning.sales")]: r.sales,
    [t("routePlanning.exportBeforeRoute")]: labelOf(r.before),
    [t("routePlanning.exportAfterRoute")]: labelOf(r.after),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, t("routePlanning.exportSheet"));
  const safeScope = result.scopeValues.join("-").replace(/[\\/:*?"<>|]/g, "-").slice(0, 100);
  XLSX.writeFile(workbook, `${t("routePlanning.exportFilePrefix")}-${safeScope}.xlsx`);
}

function ResultView({
  result,
  mode,
  onModeChange,
  labels,
  onLabelChange,
  colorBy,
  onColorByChange,
}: {
  result: RoutePlanningSplitResult;
  mode: "before" | "after";
  onModeChange: (m: "before" | "after") => void;
  labels: string[];
  onLabelChange: (index: number, value: string) => void;
  colorBy: "group" | "performance";
  onColorByChange: (v: "group" | "performance") => void;
}) {
  const { locale, t } = useTranslation();
  const totals = mode === "after" ? result.afterTotals : result.beforeTotals;
  const counts = mode === "after" ? result.afterCounts : result.beforeCounts;
  const maxDevPct = (Math.max(...totals.map((t) => Math.abs(t - result.target))) / result.target) * 100;
  // Route Coverage Map: what share of the scoped customer base actually
  // ended up on a route (i.e. had usable coordinates). Framed as a coverage
  // %, not just an "excluded rows" footnote.
  const coveragePct = result.totalScopedRows > 0 ? (result.usedRows / result.totalScopedRows) * 100 : 100;

  return (
    <Card className="glass-card rise-in">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2.5">
          <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
            <MapIcon className="h-4 w-4" />
          </span>
          {t("routePlanning.result")}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "before" ? "default" : "outline"} size="sm" onClick={() => onModeChange("before")}>
            {t("routePlanning.before")}
          </Button>
          <Button variant={mode === "after" ? "default" : "outline"} size="sm" onClick={() => onModeChange("after")}>
            {t("routePlanning.after")}
          </Button>
          <Button variant={colorBy === "performance" ? "default" : "outline"} size="sm" onClick={() => onColorByChange(colorBy === "performance" ? "group" : "performance")}>
            <Gauge className="h-4 w-4" /> {t("routePlanning.showPerformance")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportResultToExcel(result, labels, t)}>
            <Download className="h-4 w-4" /> {t("routePlanning.export")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{result.usedRows}{t("routePlanning.customersUsed")}</Badge>
          <Badge variant={coveragePct >= 95 ? "success" : coveragePct >= 80 ? "warning" : "destructive"}>
            {t("routePlanning.coverage")}{coveragePct.toFixed(1)}%
          </Badge>
          <Badge variant="secondary">{t("routePlanning.targetAverage")}{Math.round(result.target).toLocaleString(locale)}</Badge>
          <Badge variant={maxDevPct <= 10 ? "success" : "warning"}>{t("routePlanning.maxDeviation")}{maxDevPct.toFixed(1)}%</Badge>
          {result.excludedBadCoordinates > 0 && (
            <Badge variant="warning">{result.excludedBadCoordinates}{t("routePlanning.invalidCoordinates")}</Badge>
          )}
        </div>

        <RouteSplitMap result={result} mode={mode} labels={labels} colorBy={colorBy} />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("routePlanning.routeName")}</TableHead>
              <TableHead>{t("routePlanning.customers")}</TableHead>
              <TableHead>{t("routePlanning.sales")}</TableHead>
              <TableHead>{t("routePlanning.averageCustomer")}</TableHead>
              <TableHead>{t("routePlanning.deviation")}</TableHead>
              <TableHead>{t("routePlanning.performance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.map((total, i) => {
              const dev = ((total - result.target) / result.target) * 100;
              const count = counts[i] ?? 0;
              const avgPerCustomer = count > 0 ? total / count : 0;
              const tier = result.target > 0 ? (dev >= -10 ? "good" : dev >= -30 ? "ok" : "bad") : "ok";
              const tierLabel = tier === "good" ? t("routePlanning.good") : tier === "ok" ? t("routePlanning.average") : t("routePlanning.weak");
              const tierVariant = tier === "good" ? "success" : tier === "ok" ? "warning" : "destructive";
              return (
                <TableRow key={i}>
                  <TableCell>
                    <Input
                      className="h-8 min-w-32"
                      value={labels[i] ?? t("routePlanning.group", { count: i + 1 })}
                      onChange={(e) => onLabelChange(i, e.target.value)}
                    />
                  </TableCell>
                  <TableCell>{count}</TableCell>
                  <TableCell>{Math.round(total).toLocaleString(locale)}</TableCell>
                  <TableCell>{Math.round(avgPerCustomer).toLocaleString(locale)}</TableCell>
                  <TableCell className={Math.abs(dev) <= 10 ? "text-success" : "text-destructive"}>
                    {dev >= 0 ? "+" : ""}
                    {dev.toFixed(1)}%
                  </TableCell>
                  <TableCell>
                    <Badge variant={tierVariant}>{tierLabel}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
