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
type Row = { product: SmartLoadingProduct; original: number; suggested: number; input: Inputs; manuallyAdded: boolean };

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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<"priority" | "stale" | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [removedProductCodes, setRemovedProductCodes] = useState<Set<string>>(new Set());
  const [manuallyAddedProductCodes, setManuallyAddedProductCodes] = useState<Set<string>>(new Set());
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const [addedQuantity, setAddedQuantity] = useState(1);

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
  const allRows = useMemo<Row[]>(() => {
    if (session?.state !== "ready") return [];
    return session.products.map((product) => {
      const input = inputs[product.productCode] ?? { confirmedOrders: 0, safetyStock: 0 };
      const original = product.weeklyAverageSales + input.confirmedOrders + input.safetyStock - product.currentVehicleStock;
      return { product, input, original, suggested: input.manual ?? original, manuallyAdded: manuallyAddedProductCodes.has(product.productCode) };
    });
  }, [inputs, manuallyAddedProductCodes, session]);

  const rows = useMemo(
    () => allRows.filter((row) => !removedProductCodes.has(row.product.productCode) && (row.suggested > 0 || row.manuallyAdded)),
    [allRows, removedProductCodes],
  );

  const groupedByCategory = useMemo(() => {
    return rows.reduce<Record<string, Row[]>>((acc, row) => {
      const key = row.product.category ?? t("smartLoading.uncategorized");
      (acc[key] ??= []).push(row);
      return acc;
    }, {});
  }, [rows, t]);

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

  function removeProduct(productCode: string) {
    setRemovedProductCodes((current) => new Set(current).add(productCode));
  }

  function restoreOriginalList() {
    setInputs({});
    setRemovedProductCodes(new Set());
    setManuallyAddedProductCodes(new Set());
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

  async function exportSheet(bookType: "xlsx" | "ods") {
    const XLSX = await import("xlsx");
    const data = rows.map((row) => ({
      [t("smartLoading.exportColumnProduct")]: row.product.productName,
      [t("smartLoading.exportColumnCategory")]: row.product.category ?? "",
      [t("smartLoading.vehicleStock")]: row.product.currentVehicleStock,
      [t("smartLoading.weeklyAverage")]: row.product.weeklyAverageSales,
      [t("smartLoading.confirmedOrders")]: row.input.confirmedOrders,
      [t("smartLoading.safetyStock")]: row.input.safetyStock,
      [t("smartLoading.suggestedLoading")]: row.suggested,
      [label("smartLoading.exportColumnSource", "نوع الإضافة")]: row.manuallyAdded
        ? label("smartLoading.addedManually", "مضاف يدويًا")
        : label("smartLoading.recommended", "مقترح")
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), "Smart Loading");
    const date = new Date()
      .toLocaleDateString("en-CA", { calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit" })
      .replaceAll("/", "-");
    XLSX.writeFile(book, `smart-loading-${date}.${bookType}`, { bookType });
    setExportOpen(false);
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

  const otherAttention = session.attention.filter((item) => !/لم يباع|راكدة/i.test(item.message));

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
          <div className="relative">
            <Button variant="outline" onClick={() => setExportOpen((open) => !open)}>
              <Download className="h-4 w-4" />
              {label("smartLoading.export", "تصدير")}
            </Button>
            {exportOpen && (
              <div className="absolute left-0 z-20 mt-2 w-48 rounded-md border bg-popover p-1 shadow-lg">
                <Button className="w-full justify-start" variant="ghost" onClick={() => exportSheet("xlsx")}>.xlsx</Button>
                <Button className="w-full justify-start" variant="ghost" onClick={() => exportSheet("ods")}>.ods</Button>
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
              {t("smartLoading.attentionTitle")}
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">{t("smartLoading.attentionDescription")}</p>
            <div className="space-y-2">
              {otherAttention.map((item) => (
                <p key={item.id} className="rounded bg-amber-500/10 px-2 py-1.5 text-sm">
                  {item.message}
                </p>
              ))}

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

              {otherAttention.length === 0 && staleRows.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("smartLoading.noOtherAlerts")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

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
          <CardTitle>{t("smartLoading.recommendationsTitle")}</CardTitle>
          <CardDescription>{t("smartLoading.recommendationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("smartLoading.empty")}</p>}
          {Object.entries(groupedByCategory).map(([category, items]) => {
            const closed = collapsedGroups.has(category);
            return (
              <section key={category} className="rounded-lg border">
                <button
                  onClick={() =>
                    setCollapsedGroups((current) => {
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
                  <ChevronDown className={cn("h-4 w-4 transition-transform", closed && "-rotate-90")} />
                </button>
                {!closed &&
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
            <Button variant="outline" onClick={() => setAddProductOpen(true)}>
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
  const [closedCategories, setClosedCategories] = useState<Set<string>>(new Set());
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
        const closed = closedCategories.has(category);
        return (
          <section key={category} className="rounded border">
            <button
              className="flex w-full items-center justify-between px-2 py-1.5 text-right text-xs font-semibold"
              onClick={() => setClosedCategories((current) => {
                const next = new Set(current);
                if (next.has(category)) next.delete(category); else next.add(category);
                return next;
              })}
              type="button"
            >
              <span>{category} ({formatQuantity(items.length)})</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", closed && "-rotate-90")} />
            </button>
            {!closed && (
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
