"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  Download,
  Minus,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/components/translation-provider";
import type { SmartLoadingProduct, SmartLoadingSession } from "@/lib/types";
import { cn } from "@/lib/utils";

type Inputs = { confirmedOrders: number; safetyStock: number; manual?: number };
type LostOpportunityAddition = {
  source: "lost-opportunity";
  opportunityIds: string[];
  customerIds: string[];
  productId: string;
  addedQuantity: number;
  customers: { id: string; name: string; baselineNetQuantity: number }[];
};
type LostOpportunityGroup = {
  productId: string;
  productName: string;
  opportunityIds: string[];
  customerIds: string[];
  customers: { id: string; name: string; baselineNetQuantity: number }[];
  baselineNetQuantity: number;
  addedQuantity: number;
};
type Row = { product: SmartLoadingProduct; original: number; baseSuggested: number; suggested: number; input: Inputs; manuallyAdded: boolean; lostOpportunity?: LostOpportunityAddition; stockAvailable: boolean };

const HIGH_PRIORITY_DAYS_STALE = 4;

function parsePositiveNumber(value: string): number {
  return Math.max(0, Number(value) || 0);
}

function formatQuantity(value: number): string {
  return Math.round(value).toLocaleString("ar-SA");
}

function daysSinceLastSale(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}

// Gregorian DD-MM-YYYY regardless of locale — sales reps read dates in this
// format on paper checklists, so the digits must never switch to Hijri even
// when the UI locale is Arabic.
function formatGregorianDate(date: string | null): string | null {
  if (!date) return null;
  return new Date(date)
    .toLocaleDateString("en-GB", { calendar: "gregory", day: "2-digit", month: "2-digit", year: "numeric" })
    .replaceAll("/", "-");
}

export function SmartLoadingScreen({
  session,
  isLoading,
  isError,
  onRetry,
}: {
  session?: SmartLoadingSession;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => Promise<unknown> | void;
}) {
  const { t } = useTranslation();
  const label = (key: string, fallback: string) => {
    const translated = t(key as never);
    return translated === key ? fallback : translated;
  };
  const [inputs, setInputs] = useState<Record<string, Inputs>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [openRecommendationGroups, setOpenRecommendationGroups] = useState<Set<string>>(new Set());
  const [recommendationSearch, setRecommendationSearch] = useState("");
  const [panel, setPanel] = useState<"priority" | "stale" | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [removedProductCodes, setRemovedProductCodes] = useState<Set<string>>(new Set());
  const [manuallyAddedProductCodes, setManuallyAddedProductCodes] = useState<Set<string>>(new Set());
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const [addedQuantity, setAddedQuantity] = useState(1);
  const [lostOpportunitiesOpen, setLostOpportunitiesOpen] = useState(false);
  const [lostOpportunityAdditions, setLostOpportunityAdditions] = useState<Record<string, LostOpportunityAddition>>({});
  const [lostOpportunityWarning, setLostOpportunityWarning] = useState<string | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPanel(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  // Every product in the session, with the suggested-loading formula applied
  // (weekly average + confirmed orders + safety stock - current vehicle
  // stock), before filtering out zero/negative suggestions. Kept separate
  // from `rows` below because stale-item detection needs the FULL set, not
  // just the ones that ended up with a positive loading recommendation.
  const lostOpportunityGroups = useMemo<LostOpportunityGroup[]>(() => {
    if (session?.state !== "ready") return [];
    const groups = new Map<string, LostOpportunityGroup>();
    for (const opportunity of session.lostOpportunities) {
      const productId = opportunity.productCode;
      const customerId = opportunity.customerCode;
      const opportunityId = `${customerId}:${productId}`;
      const group = groups.get(productId) ?? {
        productId,
        productName: opportunity.productName,
        opportunityIds: [],
        customerIds: [],
        customers: [],
        baselineNetQuantity: 0,
        addedQuantity: 0,
      };
      group.opportunityIds.push(opportunityId);
      group.customerIds.push(customerId);
      group.customers.push({ id: customerId, name: opportunity.customerName, baselineNetQuantity: opportunity.baselineNetQuantity });
      group.baselineNetQuantity += opportunity.baselineNetQuantity;
      group.addedQuantity += opportunity.suggestedQuantity;
      groups.set(productId, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.productName.localeCompare(b.productName, "ar"));
  }, [session]);

  const allRows = useMemo<Row[]>(() => {
    if (session?.state !== "ready") return [];
    const productsByCode = new Map(session.products.map((product) => [product.productCode, product]));
    const rowsByProduct = new Map<string, Row>();
    for (const product of session.products) {
      const input = inputs[product.productCode] ?? { confirmedOrders: 0, safetyStock: 0 };
      const original = product.weeklyAverageSales + input.confirmedOrders + input.safetyStock - product.currentVehicleStock;
      const addition = lostOpportunityAdditions[product.productCode];
      const baseSuggested = Math.max(0, original);
      rowsByProduct.set(product.productCode, { product, input, original, baseSuggested, suggested: input.manual ?? baseSuggested + (addition?.addedQuantity ?? 0), manuallyAdded: manuallyAddedProductCodes.has(product.productCode), lostOpportunity: addition, stockAvailable: true });
    }
    for (const addition of Object.values(lostOpportunityAdditions)) {
      if (rowsByProduct.has(addition.productId)) continue;
      const group = lostOpportunityGroups.find((item) => item.productId === addition.productId);
      const product = productsByCode.get(addition.productId) ?? { productCode: addition.productId, productName: group?.productName ?? addition.productId, currentVehicleStock: 0, weeklyAverageSales: 0, priority: "normal" as const, category: null, lastSaleDate: null };
      const input = inputs[addition.productId] ?? { confirmedOrders: 0, safetyStock: 0 };
      rowsByProduct.set(addition.productId, { product, input, original: 0, baseSuggested: 0, suggested: input.manual ?? addition.addedQuantity, manuallyAdded: manuallyAddedProductCodes.has(addition.productId), lostOpportunity: addition, stockAvailable: false });
    }
    return Array.from(rowsByProduct.values());
  }, [inputs, lostOpportunityAdditions, lostOpportunityGroups, manuallyAddedProductCodes, session]);

  const rows = useMemo(
    () => allRows.filter((row) => !removedProductCodes.has(row.product.productCode) && (row.suggested > 0 || row.manuallyAdded)),
    [allRows, removedProductCodes],
  );

  const recommendationRows = useMemo(() => {
    const query = recommendationSearch.trim().toLocaleLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.product.productName} ${row.product.productCode} ${row.product.category ?? ""}`.toLocaleLowerCase().includes(query),
    );
  }, [recommendationSearch, rows]);

  const groupedByCategory = useMemo(() => {
    return recommendationRows.reduce<Record<string, Row[]>>((acc, row) => {
      const key = row.product.category ?? t("smartLoading.uncategorized");
      (acc[key] ??= []).push(row);
      return acc;
    }, {});
  }, [recommendationRows, t]);

  const priorityRows = useMemo(() => rows.filter((row) => row.product.priority === "high"), [rows]);

  const availableProducts = useMemo(() => {
    if (session?.state !== "ready") return [];
    const query = productSearch.trim().toLocaleLowerCase();
    return session.products.filter((product) => {
      if (rows.some((row) => row.product.productCode === product.productCode)) return false;
      return !query || `${product.productName} ${product.productCode} ${product.category ?? ""}`.toLocaleLowerCase().includes(query);
    });
  }, [productSearch, rows, session]);

  const staleRows = useMemo(() => {
    return allRows.filter((row) => {
      const days = daysSinceLastSale(row.product.lastSaleDate);
      return days !== null && days > HIGH_PRIORITY_DAYS_STALE;
    });
  }, [allRows]);

  async function refresh() {
    setRefreshing(true);
    try {
      await onRetry();
      setRefreshError(null);
      setInputs({});
      setRemovedProductCodes(new Set());
      setManuallyAddedProductCodes(new Set());
      setLostOpportunityAdditions({});
      setLostOpportunityWarning(null);
      setOpenRows(new Set());
    } catch {
      setRefreshError(label("smartLoading.refreshFailed", "Unable to refresh loading data. Try again."));
    } finally {
      setRefreshing(false);
    }
  }

  function addProduct() {
    if (!selectedProductCode || addedQuantity <= 0) return;
    setInputs((current) => ({
      ...current,
      [selectedProductCode]: {
        ...(current[selectedProductCode] ?? { confirmedOrders: 0, safetyStock: 0 }),
        manual: addedQuantity,
      },
    }));
    setRemovedProductCodes((current) => {
      const next = new Set(current);
      next.delete(selectedProductCode);
      return next;
    });
    setManuallyAddedProductCodes((current) => new Set(current).add(selectedProductCode));
    setSelectedProductCode(null);
    setProductSearch("");
    setAddedQuantity(1);
    setAddProductOpen(false);
  }

  function addLostOpportunity(group: LostOpportunityGroup) {
    const stockProduct = session?.state === "ready" ? session.products.find((product) => product.productCode === group.productId) : undefined;
    setLostOpportunityAdditions((current) => ({
      ...current,
      [group.productId]: { source: "lost-opportunity", opportunityIds: group.opportunityIds, customerIds: group.customerIds, productId: group.productId, addedQuantity: group.addedQuantity, customers: group.customers },
    }));
    setRemovedProductCodes((current) => {
      const next = new Set(current);
      next.delete(group.productId);
      return next;
    });
    setLostOpportunityWarning(stockProduct
      ? `\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a \u0644\u0644\u0635\u0646\u0641: ${formatQuantity(stockProduct.currentVehicleStock)}. \u0644\u0627 \u062a\u062a\u0648\u0641\u0631 \u0633\u0639\u0629 \u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0641\u064a \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062c\u0644\u0633\u0629\u061b \u0631\u0627\u062c\u0639 \u0627\u0644\u0633\u0639\u0629 \u0642\u0628\u0644 \u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u062a\u062d\u0645\u064a\u0644.`
      : "\u0644\u0627 \u064a\u062a\u0648\u0641\u0631 \u0645\u062e\u0632\u0648\u0646 \u0633\u064a\u0627\u0631\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0635\u0646\u0641\u060c \u0648\u0644\u0627 \u062a\u062a\u0648\u0641\u0631 \u0633\u0639\u0629 \u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0641\u064a \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062c\u0644\u0633\u0629\u061b \u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u062e\u0632\u0648\u0646 \u0648\u0627\u0644\u0633\u0639\u0629 \u0642\u0628\u0644 \u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u062a\u062d\u0645\u064a\u0644.");
  }

  function removeProduct(productCode: string) {
    setRemovedProductCodes((current) => new Set(current).add(productCode));
    setLostOpportunityAdditions((current) => {
      const next = { ...current };
      delete next[productCode];
      return next;
    });
  }

  function restoreOriginalList() {
    setInputs({});
    setRemovedProductCodes(new Set());
    setManuallyAddedProductCodes(new Set());
    setLostOpportunityAdditions({});
    setLostOpportunityWarning(null);
  }

  function setInput(productCode: string, key: keyof Inputs, value: string) {
    setInputs((current) => ({
      ...current,
      [productCode]: { ...(current[productCode] ?? { confirmedOrders: 0, safetyStock: 0 }), [key]: parsePositiveNumber(value) },
    }));
  }

  function resetManualOverride(productCode: string) {
    setInputs((current) => ({
      ...current,
      [productCode]: { ...(current[productCode] ?? { confirmedOrders: 0, safetyStock: 0 }), manual: undefined },
    }));
  }

  function exportTimestamp() {
    return new Date()
      .toLocaleString("en-GB", {
        calendar: "gregory",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(",", "")
      .replaceAll("/", "-")
      .replaceAll(":", "-")
      .replace(/\s+/g, "-");
  }

  function exportRows() {
    return rows.map((row) => ({
      product: row.product.productName,
      category: row.product.category ?? t("smartLoading.uncategorized"),
      vehicleStock: row.product.currentVehicleStock,
      weeklyAverage: row.product.weeklyAverageSales,
      confirmedOrders: row.input.confirmedOrders,
      safetyStock: row.input.safetyStock,
      suggestedLoading: row.suggested,
      source: row.manuallyAdded
        ? label("smartLoading.addedManually", "Added manually")
        : label("smartLoading.recommended", "Recommended"),
    }));
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const data = exportRows().map((row) => ({
      [t("smartLoading.exportColumnProduct")]: row.product,
      [t("smartLoading.exportColumnCategory")]: row.category,
      [t("smartLoading.vehicleStock")]: row.vehicleStock,
      [t("smartLoading.weeklyAverage")]: row.weeklyAverage,
      [t("smartLoading.confirmedOrders")]: row.confirmedOrders,
      [t("smartLoading.safetyStock")]: row.safetyStock,
      [t("smartLoading.suggestedLoading")]: row.suggestedLoading,
      [label("smartLoading.exportColumnSource", "Addition type")]: row.source,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), "Smart Loading");
    XLSX.writeFile(book, `smart-loading-${exportTimestamp()}.xlsx`, { bookType: "xlsx" });
    setExportOpen(false);
  }

  async function exportPdf() {
    const [{ jsPDF }, html2canvasModule] = await Promise.all([import("jspdf"), import("html2canvas")]);
    const html2canvas = html2canvasModule.default;
    const exportRowsSnapshot = exportRows();
    const exportedAt = new Date().toLocaleString("en-GB", {
      calendar: "gregory",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const root = document.createElement("div");
    root.dir = "rtl";
    root.lang = "ar";
    root.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111827;padding:32px;font-family:Arial, Tahoma, sans-serif;direction:rtl;text-align:right;";

    const heading = document.createElement("h1");
    heading.textContent = t("smartLoading.title");
    heading.style.cssText = "font-size:22px;margin:0 0 8px;";
    root.appendChild(heading);

    const meta = document.createElement("p");
    meta.textContent = `${label("smartLoading.pdfExportedAt", "Exported at")}: ${exportedAt}`;
    meta.style.cssText = "font-size:12px;color:#4b5563;margin:0 0 20px;";
    root.appendChild(meta);

    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;";
    const headers = [
      t("smartLoading.exportColumnProduct"),
      t("smartLoading.exportColumnCategory"),
      t("smartLoading.vehicleStock"),
      t("smartLoading.suggestedLoading"),
      label("smartLoading.exportColumnSource", "Addition type"),
    ];
    const headRow = document.createElement("tr");
    headers.forEach((header) => {
      const cell = document.createElement("th");
      cell.textContent = header;
      cell.style.cssText = "background:#e5e7eb;border:1px solid #d1d5db;padding:8px;font-weight:700;text-align:right;";
      headRow.appendChild(cell);
    });
    const thead = document.createElement("thead");
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    exportRowsSnapshot.forEach((row) => {
      const tr = document.createElement("tr");
      [row.product, row.category, formatQuantity(row.vehicleStock), formatQuantity(row.suggestedLoading), row.source].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        cell.style.cssText = "border:1px solid #d1d5db;padding:7px;vertical-align:top;text-align:right;";
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    root.appendChild(table);
    document.body.appendChild(root);

    try {
      const canvas = await html2canvas(root, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const margin = 10;
      const pageWidth = 210 - margin * 2;
      const pageHeight = 297 - margin * 2;
      const pageHeightPx = Math.floor((pageHeight / pageWidth) * canvas.width);
      for (let sourceY = 0, page = 0; sourceY < canvas.height; sourceY += pageHeightPx, page += 1) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - sourceY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        pageCanvas.getContext("2d")?.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (page > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, pageWidth, (sliceHeight / canvas.width) * pageWidth);
      }
      pdf.save(`smart-loading-${exportTimestamp()}.pdf`);
      setExportOpen(false);
    } finally {
      root.remove();
    }
  }
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((placeholder) => (
          <Skeleton key={placeholder} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ScreenState
        icon={<AlertTriangle />}
        text={t("smartLoading.error")}
        action={
          <Button onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            {t("smartLoading.retry")}
          </Button>
        }
      />
    );
  }

  if (session?.state !== "ready") {
    return (
      <ScreenState
        icon={<Truck />}
        text={t("smartLoading.vehicleStockUnavailable")}
        hint={t("smartLoading.vehicleStockUnavailableHint")}
      />
    );
  }

  return (
    <div dir="rtl" className="space-y-5 pb-4" onClick={() => panel && setPanel(null)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <span className="crystal-badge h-10 w-10 bg-teal-500/15 text-teal-600">
              <PackagePlus className="h-5 w-5" />
            </span>
            {t("smartLoading.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("smartLoading.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setLostOpportunitiesOpen(true); setLostOpportunityWarning(null); }}>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {"\u0627\u0644\u0641\u0631\u0635 \u0627\u0644\u0636\u0627\u0626\u0639\u0629"} ({formatQuantity(lostOpportunityGroups.reduce((sum, group) => sum + group.opportunityIds.length, 0))})
          </Button>
          <div className="relative">
            <Button variant="outline" onClick={() => setExportOpen((open) => !open)}>
              <Download className="h-4 w-4" />
              {label("smartLoading.export", "تصدير")}
            </Button>
            {exportOpen && (
              <div className="absolute left-0 z-20 mt-2 w-48 rounded-md border bg-popover p-1 shadow-lg">
                <Button className="w-full justify-start" variant="ghost" onClick={exportExcel}>Excel</Button>
                <Button className="w-full justify-start" variant="ghost" onClick={exportPdf}>PDF</Button>
              </div>
            )}
          </div>
          <Button variant="outline" disabled={isLoading || refreshing} onClick={refresh}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? label("smartLoading.refreshing", "Refreshing") : t("smartLoading.refresh")}
          </Button>
          <Button asChild>
            <Link href="/dashboard/visit-copilot">
              <Route className="h-4 w-4" />
              {t("smartLoading.startRoute")}
            </Link>
          </Button>
        </div>
      </header>

      {refreshError && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {refreshError}
        </div>
      )}

      <section className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Card className="glass-hero">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("smartLoading.summaryTitle")}</CardTitle>
            <CardDescription>
              {t("smartLoading.summaryDescription")} · {t("smartLoading.lastCalculation")}:{" "}
              {formatGregorianDate(session.calculatedAt) ?? "—"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <Metric label={t("smartLoading.productsToLoad")} value={formatQuantity(rows.length)} />
            <Metric
              label={t("smartLoading.totalQuantity")}
              value={formatQuantity(rows.reduce((sum, row) => sum + row.suggested, 0))}
              strong
            />
            <MetricButton
              label={t("smartLoading.priorityProducts")}
              value={formatQuantity(priorityRows.length)}
              onClick={(event) => {
                event.stopPropagation();
                setPanel(panel === "priority" ? null : "priority");
              }}
            />
            <MetricButton
              label={t("smartLoading.staleProducts")}
              value={formatQuantity(staleRows.length)}
              onClick={(event) => {
                event.stopPropagation();
                setPanel(panel === "stale" ? null : "stale");
              }}
            />
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              {label("smartLoading.alertsTitle", "Today alerts")}
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">{t("smartLoading.attentionDescription")}</p>
            <div className="space-y-2">
              {staleRows.length > 0 && (
                <div className="rounded border border-amber-500/20">
                  <button
                    className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
                    onClick={() => setAttentionOpen((value) => !value)}
                  >
                    <span>
                      {t("smartLoading.staleProducts")} — {formatQuantity(staleRows.length)} {t("smartLoading.quantityUnit")}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", attentionOpen && "rotate-180")} />
                  </button>
                  {attentionOpen && (
                    <div className="max-h-72 space-y-3 overflow-y-auto border-t p-3">
                      <CategoryProductGroups rows={staleRows} stale />
                    </div>
                  )}
                </div>
              )}

              {staleRows.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("smartLoading.noOtherAlerts")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {lostOpportunitiesOpen && (
        <LostOpportunitiesDialog
          groups={lostOpportunityGroups}
          additions={lostOpportunityAdditions}
          products={session.products}
          isLoading={isLoading}
          isError={isError}
          warning={lostOpportunityWarning}
          onClose={() => setLostOpportunitiesOpen(false)}
          onAdd={addLostOpportunity}
        />
      )}

      {addProductOpen && (
        <AddProductDialog
          products={availableProducts}
          productSearch={productSearch}
          selectedProductCode={selectedProductCode}
          quantity={addedQuantity}
          onSearchChange={setProductSearch}
          onSelectedProductChange={setSelectedProductCode}
          onQuantityChange={(value) => setAddedQuantity(parsePositiveNumber(value))}
          onClose={() => setAddProductOpen(false)}
          onAdd={addProduct}
          label={label}
        />
      )}

      {panel && (
        <ProductListPopover
          rows={panel === "priority" ? priorityRows : staleRows}
          stale={panel === "stale"}
          onClose={() => setPanel(null)}
        />
      )}

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("smartLoading.recommendationsTitle")}</CardTitle>
            <Input
              className="h-9 w-full sm:w-64"
              placeholder={t("smartLoading.searchProducts")}
              value={recommendationSearch}
              onChange={(event) => {
                const value = event.target.value;
                setRecommendationSearch(value);
                if (!value.trim()) setOpenRecommendationGroups(new Set());
              }}
            />
          </div>
          <CardDescription>{t("smartLoading.recommendationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recommendationRows.length === 0 && <p className="text-sm text-muted-foreground">{t("smartLoading.empty")}</p>}
          {Object.entries(groupedByCategory).map(([category, items]) => {
            const open = openRecommendationGroups.has(category);
            return (
              <section key={category} className="rounded-lg border">
                <button
                  onClick={() =>
                    setOpenRecommendationGroups((current) => {
                      const next = new Set(current);
                      if (next.has(category)) next.delete(category);
                      else next.add(category);
                      return next;
                    })
                  }
                  className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold"
                >
                  <span>
                    {category} <span className="text-muted-foreground">({items.length})</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
                </button>
                {open &&
                  items.map((row) => (
                    <ProductRow
                      key={row.product.productCode}
                      row={row}
                      open={openRows.has(row.product.productCode)}
                      toggle={() =>
                        setOpenRows((current) => {
                          const next = new Set(current);
                          if (next.has(row.product.productCode)) next.delete(row.product.productCode);
                          else next.add(row.product.productCode);
                          return next;
                        })
                      }
                      setInput={setInput}
                      resetManualOverride={resetManualOverride}
                      removeProduct={removeProduct}
                    />
                  ))}
              </section>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={() => setAddProductOpen(true)}>
              <Plus className="h-4 w-4" />
              {label("smartLoading.addProduct", "Add product")}
            </Button>
            <Button variant="ghost" onClick={restoreOriginalList} disabled={rows.length === 0 && manuallyAddedProductCodes.size === 0}>
              <RotateCcw className="h-4 w-4" />
              {label("smartLoading.restoreOriginalList", "Restore original list")}
            </Button>
          </div>

          <div className="mt-3 border-t pt-3">
            <h3 className="mb-1 flex items-center gap-2 font-semibold">
              <ClipboardCheck className="h-4 w-4" />
              {t("smartLoading.checklistTitle")}
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">{t("smartLoading.checklistDescription")}</p>
            <div className="grid gap-1 sm:grid-cols-3">
              {(
                [
                  "smartLoading.checklist.quantities",
                  "smartLoading.checklist.priority",
                  "smartLoading.checklist.cartons",
                  "smartLoading.checklist.verified",
                  "smartLoading.checklist.organized",
                  "smartLoading.checklist.approved",
                ] as const
              ).map((key) => (
                <label key={key} className="flex items-center gap-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={checkedItems.has(key)}
                    onChange={() =>
                      setCheckedItems((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  />
                  {t(key)}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LostOpportunitiesDialog({
  groups,
  additions,
  products,
  isLoading,
  isError,
  warning,
  onClose,
  onAdd,
}: {
  groups: LostOpportunityGroup[];
  additions: Record<string, LostOpportunityAddition>;
  products: SmartLoadingProduct[];
  isLoading: boolean;
  isError: boolean;
  warning: string | null;
  onClose: () => void;
  onAdd: (group: LostOpportunityGroup) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={"\u0627\u0644\u0641\u0631\u0635 \u0627\u0644\u0636\u0627\u0626\u0639\u0629"}>
      <Card className="max-h-[85vh] w-full max-w-3xl overflow-y-auto shadow-xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{"\u0627\u0644\u0641\u0631\u0635 \u0627\u0644\u0636\u0627\u0626\u0639\u0629"}</CardTitle>
            <CardDescription>{"\u0623\u0635\u0646\u0627\u0641 \u0639\u0645\u0644\u0627\u0621 \u062e\u0637 \u0633\u064a\u0631 \u0627\u0644\u063a\u062f. \u0644\u0646 \u062a\u064f\u0636\u0627\u0641 \u0625\u0644\u0649 \u0627\u0644\u062a\u062d\u0645\u064a\u0644 \u0625\u0644\u0627 \u0628\u0639\u062f \u0627\u062e\u062a\u064a\u0627\u0631\u0643."}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>{"\u0625\u063a\u0644\u0627\u0642"}</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
          {isError && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{"\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0641\u0631\u0635 \u0627\u0644\u0636\u0627\u0626\u0639\u0629. \u062d\u0627\u0648\u0644 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0634\u0627\u0634\u0629."}</p>}
          {!isLoading && !isError && groups.length === 0 && <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">{"\u0644\u0627 \u062a\u0648\u062c\u062f \u0641\u0631\u0635 \u0636\u0627\u0626\u0639\u0629 \u0644\u0639\u0645\u0644\u0627\u0621 \u062e\u0637 \u0633\u064a\u0631 \u0627\u0644\u063a\u062f"}</p>}
          {!isLoading && !isError && groups.map((group) => {
            const added = additions[group.productId];
            const stockProduct = products.find((product) => product.productCode === group.productId);
            return <article key={group.productId} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold">{group.productName}</p><p className="text-xs text-muted-foreground">{"\u0643\u0648\u062f \u0627\u0644\u0635\u0646\u0641:"} {group.productId}</p></div>
                <Button disabled={Boolean(added)} onClick={() => onAdd(group)}>{added ? "\u062a\u0645\u062a \u0627\u0644\u0625\u0636\u0627\u0641\u0629" : "\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u062a\u062d\u0645\u064a\u0644"}</Button>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><Info label={"\u0627\u0644\u0643\u0645\u064a\u0629 \u0641\u064a \u0627\u0644\u0641\u062a\u0631\u0629 \u0627\u0644\u0645\u0631\u062c\u0639\u064a\u0629"} value={formatQuantity(group.baselineNetQuantity)} /><Info label={"\u0622\u062e\u0631 30 \u064a\u0648\u0645\u064b\u0627"} value="0" /><Info label={"\u0627\u0644\u0643\u0645\u064a\u0629 \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629 \u0644\u0644\u0645\u0646\u062f\u0648\u0628"} value={formatQuantity(group.addedQuantity)} /></div>
              <p className="mt-2 text-xs text-muted-foreground">{group.customers.length === 1 ? `\u0627\u0644\u0639\u0645\u064a\u0644: ${group.customers[0]!.name}` : `${group.customers.length} \u0639\u0645\u0644\u0627\u0621 \u0645\u0631\u062a\u0628\u0637\u0648\u0646 \u0628\u0627\u0644\u0641\u0631\u0635\u0629`}</p>
              {group.customers.length > 1 && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">{"\u0639\u0631\u0636 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0639\u0645\u0644\u0627\u0621"}</summary><ul className="mt-1 list-disc space-y-1 pr-4">{group.customers.map((customer) => <li key={customer.id}>{customer.name}: {formatQuantity(customer.baselineNetQuantity)}</li>)}</ul></details>}
                            <p className="mt-2 text-xs text-muted-foreground">{stockProduct ? `\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a: ${formatQuantity(stockProduct.currentVehicleStock)}` : "\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0644\u0647\u0630\u0627 \u0627\u0644\u0635\u0646\u0641."}</p>

              <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-800">{"\u062a\u064f\u0631\u0627\u062c\u0639 \u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u062e\u0632\u0648\u0646 \u0648\u0627\u0644\u0633\u0639\u0629 \u0639\u0646\u062f \u0627\u0644\u0625\u0636\u0627\u0641\u0629\u061b \u0644\u0627 \u064a\u062a\u0645 \u0627\u0639\u062a\u0645\u0627\u062f \u0623\u0648 \u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u062a\u062d\u0645\u064a\u0644 \u062a\u0644\u0642\u0627\u0626\u064a\u064b\u0627."}</p>
            </article>;
          })}
          {warning && <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">{warning}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductRow({
  row,
  open,
  toggle,
  setInput,
  resetManualOverride,
  removeProduct,
}: {
  row: Row;
  open: boolean;
  toggle: () => void;
  setInput: (productCode: string, key: keyof Inputs, value: string) => void;
  resetManualOverride: (productCode: string) => void;
  removeProduct: (productCode: string) => void;
}) {
  const { t } = useTranslation();
  const label = (key: string, fallback: string) => {
    const translated = t(key as never);
    return translated === key ? fallback : translated;
  };
  const hasManualOverride = row.input.manual !== undefined;

  return (
    <article className="border-t px-3 py-2">
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <button onClick={toggle} className="min-w-0 text-right">
          <p className="truncate text-sm font-medium">{row.product.productName}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.product.category ?? t("smartLoading.uncategorized")} · {t("smartLoading.vehicleStock")}{" "}
            {formatQuantity(row.product.currentVehicleStock)}
          </p>
        </button>
        <div className="flex items-start gap-2 text-left">
          <div>
            <p className="text-[10px] text-muted-foreground">{t("smartLoading.suggestedLoading")}</p>
          <Input
            className="h-8 w-20 text-center font-bold text-teal-700"
            type="number"
            min={row.manuallyAdded ? "1" : "0"}
            value={row.suggested}
            onChange={(event) => {
              const nextValue = row.manuallyAdded ? Math.max(1, parsePositiveNumber(event.target.value)) : parsePositiveNumber(event.target.value);
              setInput(row.product.productCode, "manual", String(nextValue));
            }}
          />
            {row.manuallyAdded && (
              <p className="mt-1 text-[10px] font-medium text-teal-700">{label("smartLoading.addedManually", "Added manually")}</p>
            )}
          </div>
          <Button
            aria-label={label("smartLoading.removeProduct", "Remove product")}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => removeProduct(row.product.productCode)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          {hasManualOverride && (
            <button
              onClick={() => resetManualOverride(row.product.productCode)}
              className="mt-1 flex items-center gap-1 text-[10px] text-primary"
            >
              <RotateCcw className="h-3 w-3" />
              {t("smartLoading.restore")}
            </button>
          )}
        </div>
      </div>

      {hasManualOverride && (
        <p className="mt-1 text-[11px] text-amber-700">
          {t("smartLoading.manualOverrideNote", { value: formatQuantity(row.original) })}
        </p>
      )}

      {row.lostOpportunity && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
          <p className="font-semibold text-amber-800">{"\u0641\u0631\u0635\u0629 \u0636\u0627\u0626\u0639\u0629"} � {row.lostOpportunity.customers.length === 1 ? row.lostOpportunity.customers[0]!.name : `${row.lostOpportunity.customers.length} \u0639\u0645\u0644\u0627\u0621`}</p>
          <div className="mt-1 grid gap-1 sm:grid-cols-3"><span>{"\u0627\u0644\u0643\u0645\u064a\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629:"} {formatQuantity(row.baseSuggested)}</span><span>{"\u0641\u0631\u0635\u0629 \u0636\u0627\u0626\u0639\u0629:"} {formatQuantity(row.lostOpportunity.addedQuantity)}</span><span className="font-semibold">{"\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0645\u0642\u062a\u0631\u062d:"} {formatQuantity(row.suggested)}</span></div>
          <p className="mt-1 text-amber-800">{row.stockAvailable ? `\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a: ${formatQuantity(row.product.currentVehicleStock)}. \u0631\u0627\u062c\u0639 \u0627\u0644\u0633\u0639\u0629 \u0642\u0628\u0644 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f.` : "\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0644\u0647\u0630\u0627 \u0627\u0644\u0635\u0646\u0641. \u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u062e\u0632\u0648\u0646 \u0648\u0627\u0644\u0633\u0639\u0629 \u0642\u0628\u0644 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f."}</p>
        </div>
      )}

      {open && (
        <div className="mt-2 grid gap-2 border-t pt-2 text-xs sm:grid-cols-4">
          <Info label={t("smartLoading.weeklyAverage")} value={formatQuantity(row.product.weeklyAverageSales)} />
          <Field
            label={t("smartLoading.confirmedOrders")}
            hint={t("smartLoading.confirmedOrdersHint")}
            value={row.input.confirmedOrders}
            onChange={(value) => setInput(row.product.productCode, "confirmedOrders", value)}
          />
          <Field
            label={t("smartLoading.safetyStock")}
            hint={t("smartLoading.safetyStockHint")}
            value={row.input.safetyStock}
            onChange={(value) => setInput(row.product.productCode, "safetyStock", value)}
          />
          <Info
            label={t("smartLoading.showReason")}
            value={`${formatQuantity(row.product.weeklyAverageSales)} + ${formatQuantity(row.input.confirmedOrders)} + ${formatQuantity(row.input.safetyStock)} − ${formatQuantity(row.product.currentVehicleStock)}`}
          />
        </div>
      )}
    </article>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-background/60 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", strong && "text-teal-700")}>{value}</p>
    </div>
  );
}

function MetricButton({ label, value, onClick }: { label: string; value: string; onClick: (event: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} className="rounded-md bg-background/60 p-2 text-right hover:bg-secondary">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs" title={hint}>
        {label}
      </Label>
      <Input className="mt-1 h-8" type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function AddProductDialog({
  products,
  productSearch,
  selectedProductCode,
  quantity,
  onSearchChange,
  onSelectedProductChange,
  onQuantityChange,
  onClose,
  onAdd,
  label,
}: {
  products: SmartLoadingProduct[];
  productSearch: string;
  selectedProductCode: string | null;
  quantity: number;
  onSearchChange: (value: string) => void;
  onSelectedProductChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onClose: () => void;
  onAdd: () => void;
  label: (key: string, fallback: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-xl shadow-xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="pb-2">
          <CardTitle>{label("smartLoading.addProduct", "Add product")}</CardTitle>
          <CardDescription>{label("smartLoading.addProductDescription", "Search the session products and set a positive loading quantity.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            autoFocus
            placeholder={label("smartLoading.searchProducts", "Search products")}
            value={productSearch}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
            {products.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">{label("smartLoading.noProductsFound", "No products found")}</p>
            )}
            {products.map((product) => (
              <button
                key={product.productCode}
                className={cn(
                  "flex w-full items-center justify-between rounded px-3 py-2 text-right text-sm hover:bg-secondary",
                  selectedProductCode === product.productCode && "bg-secondary",
                )}
                onClick={() => onSelectedProductChange(product.productCode)}
                type="button"
              >
                <span>{product.productName}</span>
                <span className="text-xs text-muted-foreground">{product.category ?? ""}</span>
              </button>
            ))}
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="w-32">
              <Label className="text-xs">{label("smartLoading.manualQuantity", "Loading quantity")}</Label>
              <Input
                className="mt-1"
                min="1"
                type="number"
                value={quantity}
                onChange={(event) => onQuantityChange(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>{label("smartLoading.close", "Close")}</Button>
              <Button disabled={!selectedProductCode || quantity <= 0} onClick={onAdd}>
                <Plus className="h-4 w-4" />
                {label("smartLoading.addProduct", "Add product")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryProductGroups({ rows, stale }: { rows: Row[]; stale: boolean }) {
  const { t } = useTranslation();
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    return rows.reduce<Record<string, Row[]>>((current, row) => {
      const category = row.product.category ?? t("smartLoading.uncategorized");
      (current[category] ??= []).push(row);
      return current;
    }, {});
  }, [rows, t]);

  return (
    <div className="space-y-2">
      {Object.entries(groups).map(([category, items]) => {
        const open = openCategories.has(category);
        return (
          <section key={category} className="rounded border">
            <button
              className="flex w-full items-center justify-between px-2 py-1.5 text-right text-xs font-semibold"
              onClick={() => setOpenCategories((current) => {
                const next = new Set(current);
                if (next.has(category)) next.delete(category); else next.add(category);
                return next;
              })}
              type="button"
            >
              <span>{category} ({formatQuantity(items.length)})</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
            </button>
            {open && (
              <div className="max-h-56 overflow-y-auto border-t px-2">
                {items.map((row) => (
                  <div key={row.product.productCode} className="grid grid-cols-[1fr_auto] gap-2 border-b py-1.5 text-xs last:border-0">
                    <span className="min-w-0 truncate font-medium">{row.product.productName}</span>
                    <span className="text-left text-muted-foreground">
                      {t("smartLoading.vehicleStock")} {formatQuantity(row.product.currentVehicleStock)}
                      {stale && (
                        <> · {t("smartLoading.lastSale")} {formatGregorianDate(row.product.lastSaleDate) ?? "—"} · {daysSinceLastSale(row.product.lastSaleDate) ?? "—"} {t("smartLoading.staleDaysUnit")}</>
                      )}
                      {!stale && <> · {t("smartLoading.suggestedLoading")} {formatQuantity(row.suggested)}</>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ProductListPopover({ rows, stale, onClose }: { rows: Row[]; stale: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onClick={onClose}>
      <Card className="w-[min(92vw,520px)] shadow-xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-center justify-between p-4">
          <CardTitle>{stale ? t("smartLoading.staleProductsPanelTitle") : t("smartLoading.priorityProductsPanelTitle")}</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose}>{t("smartLoading.close")}</Button>
        </CardHeader>
        <CardContent className="max-h-[60vh] overflow-y-auto p-4 pt-0">
          <CategoryProductGroups rows={rows} stale={stale} />
        </CardContent>
      </Card>
    </div>
  );
}

function ScreenState({
  icon,
  text,
  hint,
  action,
}: {
  icon: React.ReactNode;
  text: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="text-amber-600">{icon}</span>
        <p>{text}</p>
        {hint && <p className="max-w-md text-sm text-muted-foreground">{hint}</p>}
        {action}
      </CardContent>
    </Card>
  );
}
