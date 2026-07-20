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
const SCOPE_FIELDS: { value: RoutePlanningScopeField; label: string }[] = [
  { value: "RouteID", label: "الخط (Route)" },
  { value: "City", label: "المدينة" },
  { value: "CustomerClass", label: "فئة العميل" },
  { value: "Channel", label: "القناة" },
];

export default function RoutePlanningPage() {
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
          return `خط جديد ${extra}`;
        }),
      );
      toast.success(`تم التقسيم — ${data.usedRows} عميل على ${data.groupCount} مجموعات`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر إتمام التقسيم"),
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
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <MapIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Route Planning</h1>
          <p className="text-muted-foreground">
            إعادة تقسيم قطاع أو خط سير إلى مجموعات متوازنة في المبيعات ومتماسكة جغرافيًا — تماسك جغرافي أولاً، ثم توازن مبيعات عن طريق
            نمو تدريجي من الجيران المباشرين فقط.
          </p>
        </div>
      </div>

      <Card className="glass-card rise-in rise-d1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <MapIcon className="h-4 w-4" />
            </span>
            الإعدادات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
            <div className="grid gap-2">
              <Label>عمود النطاق (مندوب/منطقة)</Label>
              <Select
                value={scopeField || "__none__"}
                onValueChange={(v) => {
                  setScopeField(v === "__none__" ? "" : (v as RoutePlanningScopeField));
                  setSelectedScopeValues(new Set());
                  setGroupCountTouched(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر عمود…" />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>عدد المجموعات</Label>
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
                بيتزامن تلقائيًا مع عدد القيم المحددة تحت. عدّله يدويًا لو عايز تدمج (رقم أقل) أو تضيف خط جديد (رقم أكتر).{" "}
                {groupCountTouched && selectedScopeValues.size >= 2 && (
                  <button
                    type="button"
                    className="text-primary underline underline-offset-2"
                    onClick={() => {
                      setGroupCountTouched(false);
                      setGroupCount(selectedScopeValues.size);
                    }}
                  >
                    رجّعه للتزامن التلقائي
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
            {splitMutation.isPending ? "جارٍ التقسيم…" : "قسّم الآن"}
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
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>قيم النطاق (اختار واحدة أو أكتر — بتتجمع مع بعض قبل التقسيم)</Label>
        {!disabled && values.length > 0 && (
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-primary underline underline-offset-2" onClick={onSelectAll}>
              تحديد الكل
            </button>
            <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={onClearAll}>
              إلغاء الكل
            </button>
          </div>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
        {disabled ? (
          <p className="p-1 text-sm text-muted-foreground">اختار عمود النطاق الأول</p>
        ) : loading ? (
          <p className="p-1 text-sm text-muted-foreground">جاري التحميل…</p>
        ) : values.length === 0 ? (
          <p className="p-1 text-sm text-muted-foreground">مفيش قيم في العمود ده</p>
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
      <p className="text-xs text-muted-foreground">{selected.size} قيمة محددة</p>
    </div>
  );
}

// Client-side export — the split result (records + before/after group
// assignments) already lives in the browser after a successful split, so we
// build the .xlsx directly here instead of round-tripping through the API.
// xlsx is dynamically imported so it doesn't bloat the initial page bundle.
async function exportResultToExcel(result: RoutePlanningSplitResult, labels: string[]) {
  const XLSX = await import("xlsx");
  const labelOf = (i: number) => labels[i] ?? `مجموعة ${i + 1}`;
  const rows = result.records.map((r) => ({
    "رقم العميل": r.id,
    الاسم: r.label,
    "خط العرض": r.lat,
    "خط الطول": r.lon,
    المبيعات: r.sales,
    "الخط (قبل)": labelOf(r.before),
    "الخط (بعد)": labelOf(r.after),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "التقسيم");
  const safeScope = result.scopeValues.join("-").replace(/[\\/:*?"<>|]/g, "-").slice(0, 100);
  XLSX.writeFile(workbook, `تقسيم-${safeScope}.xlsx`);
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
          النتيجة
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "before" ? "default" : "outline"} size="sm" onClick={() => onModeChange("before")}>
            قبل (جغرافي فقط)
          </Button>
          <Button variant={mode === "after" ? "default" : "outline"} size="sm" onClick={() => onModeChange("after")}>
            بعد (متوازن)
          </Button>
          <Button variant={colorBy === "performance" ? "default" : "outline"} size="sm" onClick={() => onColorByChange(colorBy === "performance" ? "group" : "performance")}>
            <Gauge className="h-4 w-4" /> عرض الأداء
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportResultToExcel(result, labels)}>
            <Download className="h-4 w-4" /> تصدير Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{result.usedRows} عميل مستخدم</Badge>
          <Badge variant={coveragePct >= 95 ? "success" : coveragePct >= 80 ? "warning" : "destructive"}>
            نسبة التغطية: {coveragePct.toFixed(1)}%
          </Badge>
          <Badge variant="secondary">المتوسط المستهدف: {Math.round(result.target).toLocaleString("en-US")}</Badge>
          <Badge variant={maxDevPct <= 10 ? "success" : "warning"}>أقصى انحراف: {maxDevPct.toFixed(1)}%</Badge>
          {result.excludedBadCoordinates > 0 && (
            <Badge variant="warning">{result.excludedBadCoordinates} صف مستبعد (إحداثيات غير صالحة)</Badge>
          )}
        </div>

        <RouteSplitMap result={result} mode={mode} labels={labels} colorBy={colorBy} />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>اسم الخط</TableHead>
              <TableHead>عملاء</TableHead>
              <TableHead>إجمالي المبيعات</TableHead>
              <TableHead>متوسط/عميل</TableHead>
              <TableHead>الانحراف</TableHead>
              <TableHead>الأداء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.map((t, i) => {
              const dev = ((t - result.target) / result.target) * 100;
              const count = counts[i] ?? 0;
              const avgPerCustomer = count > 0 ? t / count : 0;
              const tier = result.target > 0 ? (dev >= -10 ? "good" : dev >= -30 ? "ok" : "bad") : "ok";
              const tierLabel = tier === "good" ? "جيد" : tier === "ok" ? "متوسط" : "ضعيف";
              const tierVariant = tier === "good" ? "success" : tier === "ok" ? "warning" : "destructive";
              return (
                <TableRow key={i}>
                  <TableCell>
                    <Input
                      className="h-8 min-w-32"
                      value={labels[i] ?? `مجموعة ${i + 1}`}
                      onChange={(e) => onLabelChange(i, e.target.value)}
                    />
                  </TableCell>
                  <TableCell>{count}</TableCell>
                  <TableCell>{Math.round(t).toLocaleString("en-US")}</TableCell>
                  <TableCell>{Math.round(avgPerCustomer).toLocaleString("en-US")}</TableCell>
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
