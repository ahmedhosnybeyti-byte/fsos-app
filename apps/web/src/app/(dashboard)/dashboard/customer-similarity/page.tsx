"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Filter, Sparkles, Users2 } from "lucide-react";
import { toast } from "sonner";
import { customerSimilarityApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RouteSplitMap, GROUP_COLORS } from "@/components/route-planning/route-split-map";
import type { CustomerSimilarityBasis, CustomerSimilarityResult, CustomerSimilarityScopeField, RoutePlanningRecord } from "@/lib/types";

// Customer Similarity Map (GVE catalog), "Customers Similar in Performance":
// clusters customers by behavior, not geography. Reuses Route Planning's map
// component and results-table record shape since the backend returns the
// exact same structure (before === after — one clustering, no geographic
// "before" state).
//
// Migration #2 (ADR-001 / RIE Migration Plan, 2026-07-17): no file or column
// picking anymore. Customers/Invoices/Invoice Items/Collections/Returns/
// Products are resolved automatically via RieFacade — only the business
// choices remain (which behavioral signal, how many groups, optional
// scope/category narrowing).
const AVG_VALUE_LABEL_KEY: Record<CustomerSimilarityBasis, TranslationKey> = {
  sales: "customerSimilarity.avgValueSales",
  collection: "customerSimilarity.avgValueCollection",
  returns: "customerSimilarity.avgValueReturns",
};

const SCOPE_FIELDS: { value: CustomerSimilarityScopeField; label: string }[] = [
  { value: "RouteID", label: "الخط (Route)" },
  { value: "City", label: "المدينة" },
  { value: "CustomerClass", label: "فئة العميل" },
  { value: "Channel", label: "القناة" },
];

export default function CustomerSimilarityPage() {
  const { t } = useTranslation();

  const [scopeField, setScopeField] = useState<CustomerSimilarityScopeField | "">("");
  const [selectedScopeValues, setSelectedScopeValues] = useState<Set<string>>(new Set());

  const [clusterCount, setClusterCount] = useState(4);
  const [similarityBasis, setSimilarityBasis] = useState<CustomerSimilarityBasis>("sales");

  const [categoryFilterEnabled, setCategoryFilterEnabled] = useState(false);
  const [salesCategoryValue, setSalesCategoryValue] = useState("");

  const scopeValuesQuery = useQuery({
    queryKey: ["customer-similarity", "scope-values", scopeField],
    queryFn: () => customerSimilarityApi.scopeValues({ scopeField: scopeField as CustomerSimilarityScopeField }),
    enabled: !!scopeField,
  });
  const categoryValuesQuery = useQuery({
    queryKey: ["customer-similarity", "category-values"],
    queryFn: () => customerSimilarityApi.categoryValues(),
    enabled: similarityBasis === "sales" && categoryFilterEnabled,
  });

  const [result, setResult] = useState<CustomerSimilarityResult | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [visibleGroups, setVisibleGroups] = useState<Set<number>>(new Set());

  const queryMutation = useMutation({
    mutationFn: customerSimilarityApi.query,
    onSuccess: (data) => {
      setResult(data);
      setExpandedGroups(new Set());
      setVisibleGroups(new Set(Array.from({ length: data.clusterCount }, (_, i) => i)));
      toast.success(t("customerSimilarity.toastSuccess", { count: data.usedRows, clusters: data.clusterCount }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("customerSimilarity.toastError")),
  });

  const canQuery = clusterCount >= 2 && (similarityBasis !== "sales" || !categoryFilterEnabled || !!salesCategoryValue);

  function handleQuery() {
    queryMutation.mutate({
      clusterCount,
      similarityBasis,
      scopeField: scopeField || undefined,
      scopeValues: scopeField && selectedScopeValues.size > 0 ? Array.from(selectedScopeValues) : undefined,
      salesCategoryValue: similarityBasis === "sales" && categoryFilterEnabled ? salesCategoryValue || undefined : undefined,
    });
  }

  function toggleGroup(i: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // The map/table need a RoutePlanningSplitResult-shaped object — build a
  // thin adapter rather than duplicating RouteSplitMap.
  const asRouteResult = result
    ? {
        scopeColumn: scopeField || "",
        scopeValues: Array.from(selectedScopeValues),
        groupCount: result.clusterCount,
        target: result.afterTotals.reduce((a, b) => a + b, 0) / result.clusterCount,
        excludedBadCoordinates: result.excludedNoSalesData,
        totalScopedRows: result.totalScopedRows,
        usedRows: result.usedRows,
        beforeTotals: result.afterTotals,
        afterTotals: result.afterTotals,
        beforeCounts: result.afterCounts,
        afterCounts: result.afterCounts,
        records: result.records,
      }
    : null;

  const recordsByGroup = useMemo(() => {
    if (!result) return new Map<number, RoutePlanningRecord[]>();
    const map = new Map<number, RoutePlanningRecord[]>();
    result.records.forEach((r) => {
      const bucket = map.get(r.after);
      if (bucket) bucket.push(r);
      else map.set(r.after, [r]);
    });
    return map;
  }, [result]);

  const hasSkuColumn = result ? result.clusterProfiles.some((p) => p.avgDistinctSkus !== null) : false;
  const columnCount = hasSkuColumn ? 6 : 5;

  const mapResult = useMemo(() => {
    if (!asRouteResult) return null;
    if (visibleGroups.size === asRouteResult.groupCount) return asRouteResult;
    return { ...asRouteResult, records: asRouteResult.records.filter((r) => visibleGroups.has(r.after)) };
  }, [asRouteResult, visibleGroups]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users2 className="h-6 w-6" /> {t("customerSimilarity.title")}
        </h1>
        <p className="text-muted-foreground">{t("customerSimilarity.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("customerSimilarity.settingsCard")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
            <div className="grid gap-2">
              <Label>{t("customerSimilarity.scopeColumnOptional")}</Label>
              <Select
                value={scopeField || "__none__"}
                onValueChange={(v) => {
                  setScopeField(v === "__none__" ? "" : (v as CustomerSimilarityScopeField));
                  setSelectedScopeValues(new Set());
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="بلا (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بلا (اختياري)</SelectItem>
                  {SCOPE_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("customerSimilarity.clusterCountLabel")}</Label>
              <Input type="number" min={2} max={20} value={clusterCount} onChange={(e) => setClusterCount(Number(e.target.value) || 2)} />
            </div>
          </div>

          {scopeField && (
            <div className="grid gap-2">
              <Label>{t("customerSimilarity.scopeValuesLabel")}</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
                {scopeValuesQuery.isLoading ? (
                  <p className="p-2 text-sm text-muted-foreground">…</p>
                ) : (
                  (scopeValuesQuery.data?.values ?? []).map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-secondary/50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-primary"
                        checked={selectedScopeValues.has(v)}
                        onChange={() =>
                          setSelectedScopeValues((prev) => {
                            const next = new Set(prev);
                            if (next.has(v)) next.delete(v);
                            else next.add(v);
                            return next;
                          })
                        }
                      />
                      {v}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:max-w-md">
            <Label>{t("customerSimilarity.similarityBasisLabel")}</Label>
            <Select value={similarityBasis} onValueChange={(v) => setSimilarityBasis(v as CustomerSimilarityBasis)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">{t("customerSimilarity.basisSales")}</SelectItem>
                <SelectItem value="collection">{t("customerSimilarity.basisCollection")}</SelectItem>
                <SelectItem value="returns">{t("customerSimilarity.basisReturns")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {similarityBasis === "sales" && (
            <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setCategoryFilterEnabled((v) => !v)}
              >
                {categoryFilterEnabled ? t("customerSimilarity.categoryFilterToggleOff") : t("customerSimilarity.categoryFilterToggleOn")}
              </Button>
              {categoryFilterEnabled && (
                <div className="grid gap-2 sm:max-w-xs">
                  <Label>{t("customerSimilarity.categoryValueLabel")}</Label>
                  <Select value={salesCategoryValue} onValueChange={setSalesCategoryValue}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("customerSimilarity.chooseCategory")} />
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

          {similarityBasis === "returns" && (
            <p className="text-xs text-muted-foreground">
              ملحوظة: تنوع الأصناف (SKU) غير متاح حاليًا كأساس للمرتجعات — يعتمد على بيانات بنود المرتجعات التفصيلية غير المتاحة بعد.
            </p>
          )}

          <Button disabled={!canQuery || queryMutation.isPending} onClick={handleQuery}>
            {queryMutation.isPending ? <Spinner /> : <Sparkles className="h-4 w-4" />}
            {queryMutation.isPending ? t("customerSimilarity.runningButton") : t("customerSimilarity.runButton")}
          </Button>
        </CardContent>
      </Card>

      {result && asRouteResult && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{t("customerSimilarity.resultCard")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => exportResultToExcel(result, t)}>
              <Download className="h-4 w-4" /> {t("customerSimilarity.exportButton")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{t("customerSimilarity.customersBadge", { count: result.usedRows })}</Badge>
              {result.excludedNoSalesData > 0 && (
                <Badge variant="warning">{t("customerSimilarity.excludedBadge", { count: result.excludedNoSalesData })}</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border bg-secondary/20 p-2.5">
                {result.clusterProfiles.map((_, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                    {t("customerSimilarity.legendGroup", { n: i + 1 })}
                  </span>
                ))}
              </div>

              <GroupVisibilityDropdown clusterCount={result.clusterCount} visibleGroups={visibleGroups} onChange={setVisibleGroups} t={t} />
            </div>

            <RouteSplitMap result={mapResult ?? asRouteResult} mode="after" heightClassName="h-[460px]" />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>{t("customerSimilarity.tableGroup")}</TableHead>
                  <TableHead>{t("customerSimilarity.tableCustomers")}</TableHead>
                  <TableHead>{t(AVG_VALUE_LABEL_KEY[result.similarityBasis])}</TableHead>
                  <TableHead>{t("customerSimilarity.tableAvgOrders")}</TableHead>
                  {hasSkuColumn && <TableHead>{t("customerSimilarity.tableAvgSkuVariety")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.clusterProfiles.map((p, i) => {
                  const expanded = expandedGroups.has(i);
                  const members = recordsByGroup.get(i) ?? [];
                  return (
                    <Fragment key={i}>
                      <TableRow className="cursor-pointer hover:bg-secondary/40" onClick={() => toggleGroup(i)}>
                        <TableCell className="w-8">
                          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                          {t("customerSimilarity.legendGroup", { n: i + 1 })}
                        </TableCell>
                        <TableCell>{result.afterCounts[i]}</TableCell>
                        <TableCell>{Math.round(p.avgTotalValue).toLocaleString("en-US")}</TableCell>
                        <TableCell>{p.avgOrderCount.toFixed(1)}</TableCell>
                        {hasSkuColumn && <TableCell>{p.avgDistinctSkus !== null ? p.avgDistinctSkus.toFixed(1) : "—"}</TableCell>}
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={columnCount} className="max-w-0 bg-secondary/10 p-0">
                            <div className="max-h-72 overflow-y-auto p-3">
                              {members.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{t("customerSimilarity.noCustomersInGroup")}</p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>{t("customerSimilarity.memberIdHeader")}</TableHead>
                                      <TableHead>{t("customerSimilarity.memberNameHeader")}</TableHead>
                                      <TableHead>{t("customerSimilarity.memberValueHeader")}</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {members.map((m) => (
                                      <TableRow key={m.id}>
                                        <TableCell>{m.id}</TableCell>
                                        <TableCell>{m.label}</TableCell>
                                        <TableCell>{Math.round(m.sales).toLocaleString("en-US")}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Client-side export — unchanged from the legacy page (result shape and
// export format didn't change in this migration).
async function exportResultToExcel(result: CustomerSimilarityResult, t: (key: TranslationKey, params?: Record<string, string | number>) => string) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const avgValueLabel = t(AVG_VALUE_LABEL_KEY[result.similarityBasis]);
  const hasSkuColumn = result.clusterProfiles.some((p) => p.avgDistinctSkus !== null);

  const summaryRows = result.clusterProfiles.map((p, i) => {
    const row: Record<string, string | number> = {
      المجموعة: `مجموعة ${i + 1}`,
      عملاء: result.afterCounts[i] ?? 0,
      [avgValueLabel]: Math.round(p.avgTotalValue),
      "متوسط عدد الطلبات": Number(p.avgOrderCount.toFixed(1)),
    };
    if (hasSkuColumn) row["متوسط تنوع الأصناف"] = p.avgDistinctSkus !== null ? Number(p.avgDistinctSkus.toFixed(1)) : 0;
    return row;
  });
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "الملخص");

  const detailRows = result.records.map((r) => ({
    "رقم العميل": r.id,
    الاسم: r.label,
    "خط العرض": r.lat,
    "خط الطول": r.lon,
    القيمة: r.sales,
    المجموعة: `مجموعة ${r.after + 1}`,
  }));
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(workbook, detailSheet, "تفاصيل العملاء");

  XLSX.writeFile(workbook, "تشابه-الاداء.xlsx");
}

function GroupVisibilityDropdown({
  clusterCount,
  visibleGroups,
  onChange,
  t,
}: {
  clusterCount: number;
  visibleGroups: Set<number>;
  onChange: (next: Set<number>) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allSelected = visibleGroups.size === clusterCount;
  const summary = allSelected
    ? t("customerSimilarity.groupFilterAll")
    : t("customerSimilarity.groupFilterCount", { count: visibleGroups.size, total: clusterCount });

  function toggleGroup(i: number) {
    const next = new Set(visibleGroups);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onChange(next);
  }

  function toggleAll() {
    onChange(allSelected ? new Set() : new Set(Array.from({ length: clusterCount }, (_, i) => i)));
  }

  return (
    <div className="relative" ref={containerRef}>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Filter className="h-3.5 w-3.5" />
        {t("customerSimilarity.groupFilterLabel")}: {summary}
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute end-0 top-9 z-[1200] w-56 rounded-md border border-border bg-popover p-1.5 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm font-medium hover:bg-secondary/50">
            <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary" checked={allSelected} onChange={toggleAll} />
            {t("customerSimilarity.groupFilterAll")}
          </label>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {Array.from({ length: clusterCount }, (_, i) => (
              <label key={i} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary/50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary"
                  checked={visibleGroups.has(i)}
                  onChange={() => toggleGroup(i)}
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                {t("customerSimilarity.legendGroup", { n: i + 1 })}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
