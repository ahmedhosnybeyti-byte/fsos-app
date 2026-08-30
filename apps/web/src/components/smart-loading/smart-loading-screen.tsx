"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { useAuth } from "@/hooks/use-auth";
import type { SmartLoadingLostOpportunity, SmartLoadingManagementCategoryStockAlignment, SmartLoadingManagementStaleRouteProduct, SmartLoadingManagementVehicleProduct, SmartLoadingPriorityProduct, SmartLoadingProduct, SmartLoadingSession } from "@/lib/types";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { DEFAULT_SMART_LOADING_STALE_DAYS, type SmartLoadingRecalculateInput, type SmartLoadingRecalculateResult, type SmartLoadingRouteCustomer } from "@field-sales-os/schemas";
import { cn, formatQuantity, formatQuantityInput } from "@/lib/utils";
import { categoryAddedProductCount, formatLostOpportunityQuantity, formatLostOpportunityQuantityInput, getEffectiveAccordionState, groupLostOpportunities, lostOpportunityProductId, normalizeOpportunityQuantity, type LostOpportunityCategoryGroup, type LostOpportunityProductGroup, type OpportunityQuantityDrafts } from "./lost-opportunity-groups";
import { calculateSuggestedLoading } from "./suggested-loading";

type Inputs = { confirmedOrders: number; safetyStock: number; vehicleStock?: number; manual?: number };
type LostOpportunityAddition = {
  source: "lost-opportunity";
  opportunityIds: string[];
  customerIds: string[];
  productId: string;
  addedQuantity: number;
  customers: { id: string; name: string; baselineNetQuantity: number }[];
};
type Row = { product: SmartLoadingProduct; original: number; baseSuggested: number; suggested: number; input: Inputs; manuallyAdded: boolean; lostOpportunity?: LostOpportunityAddition; stockAvailable: boolean; effectiveVehicleStock: number | null; preliminary: boolean };
type ManagementRow = SmartLoadingManagementVehicleProduct;

function parsePositiveNumber(value: string): number {
  return Math.max(0, Number(value) || 0);
}

function daysSinceLastSale(date: string | null, referenceDate = new Date()): number | null {
  if (!date) return null;
  return Math.floor((referenceDate.getTime() - new Date(date).getTime()) / 86_400_000);
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
  targetDate,
  onTargetDateChange,
  staleDaysThreshold,
  onStaleDaysThresholdChange,
  salesRepId,
  onSalesRepChange,
  onManagementScopeChange,
}: {
  session?: SmartLoadingSession;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => Promise<unknown> | void;
  targetDate: string;
  onTargetDateChange: (value: string) => void;
  staleDaysThreshold: number;
  onStaleDaysThresholdChange: (value: number) => void;
  salesRepId?: string;
  onSalesRepChange: (value: string | undefined) => void;
  onManagementScopeChange: (scope: { managerId?: string; supervisorId?: string; salesRepId?: string }) => void;
}) {
  const { locale, t } = useTranslation();
  const { user } = useAuth();
  const managementView = isManagementRole(user?.role.code);
  const label = (key: string, fallback: string) => {
    const translated = t(key as never);
    return translated === key ? fallback : translated;
  };
  const [inputs, setInputs] = useState<Record<string, Inputs>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [isSessionClosed, setIsSessionClosed] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [openRecommendationGroups, setOpenRecommendationGroups] = useState<Set<string>>(new Set());
  const [recommendationSearch, setRecommendationSearch] = useState("");
  const [panel, setPanel] = useState<"priority" | "stale" | null>(null);
  const [openPriorityGroups, setOpenPriorityGroups] = useState<Set<string>>(new Set());
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [removedProductCodes, setRemovedProductCodes] = useState<Set<string>>(new Set());
  const [manuallyAddedProductCodes, setManuallyAddedProductCodes] = useState<Set<string>>(new Set());
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const [addedQuantity, setAddedQuantity] = useState(1);
  const [lostOpportunitiesOpen, setLostOpportunitiesOpen] = useState(false);
  const [lostOpportunityAdditions, setLostOpportunityAdditions] = useState<Record<string, LostOpportunityAddition>>({});
  const [lostOpportunityQuantityDrafts, setLostOpportunityQuantityDrafts] = useState<OpportunityQuantityDrafts>({});
  const [lostOpportunityWarning, setLostOpportunityWarning] = useState<string | null>(null);
  const [selectedCustomerCodes, setSelectedCustomerCodes] = useState<Set<string>>(new Set());
  const [exceptionalCustomers, setExceptionalCustomers] = useState<SmartLoadingRouteCustomer[]>([]);
  const [fromDate, setFromDate] = useState(() => { const date = new Date(); date.setMonth(date.getMonth() - 3); return date.toISOString().slice(0, 10); });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visitsPerWeek, setVisitsPerWeek] = useState<1 | 2 | 6>(1);
  const [confirmedOrdersByProduct, setConfirmedOrdersByProduct] = useState<Record<string, number>>({});
  const [confirmedProductCode, setConfirmedProductCode] = useState("");
  const [confirmedQuantity, setConfirmedQuantity] = useState(1);
  const [recalculation, setRecalculation] = useState<SmartLoadingRecalculateResult | null>(null);
  const [recalculationLoading, setRecalculationLoading] = useState(false);
  const [recalculationError, setRecalculationError] = useState<string | null>(null);
  const [hasUnappliedChanges, setHasUnappliedChanges] = useState(false);
  const hydrated = useRef(false);
  const activeRouteKey = useRef<string | null>(null);
  const [appliedInputs, setAppliedInputs] = useState<SmartLoadingRecalculateInput | null>(null);
  const restoredWork = useRef<Partial<{ selectionVersion: 1; targetDate: string; fromDate: string; toDate: string; visitsPerWeek: 1 | 2 | 6; selectedCustomerCodes: string[]; exceptionalCustomers: SmartLoadingRouteCustomer[]; confirmedOrders: Record<string, number>; appliedInputs: SmartLoadingRecalculateInput; hasUnappliedChanges: boolean; isSessionClosed: boolean; staleDaysThreshold: number }> | null>(null);
  useEffect(() => { try { restoredWork.current = JSON.parse(window.sessionStorage.getItem("smart-loading-work") ?? "null") as typeof restoredWork.current; if (restoredWork.current?.targetDate && restoredWork.current.targetDate !== targetDate) onTargetDateChange(restoredWork.current.targetDate); } catch { restoredWork.current = null; hydrated.current = true; } }, []);
  useEffect(() => { window.sessionStorage.setItem("smart-loading-work", JSON.stringify({ selectionVersion: 1, targetDate, fromDate, toDate, visitsPerWeek, selectedCustomerCodes: [...selectedCustomerCodes], exceptionalCustomers, confirmedOrders: confirmedOrdersByProduct, appliedInputs, hasUnappliedChanges, isSessionClosed, staleDaysThreshold })); }, [appliedInputs, confirmedOrdersByProduct, exceptionalCustomers, fromDate, hasUnappliedChanges, selectedCustomerCodes, staleDaysThreshold, toDate, visitsPerWeek]);
  const recalculateSequence = useRef(0);
  const recalculateAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (session?.state !== "ready") return;
    if (managementView) return;
    const routeCustomerCodes = session.routeCustomers.map((customer) => customer.customerCode.trim()).filter(Boolean);
    const routeKey = `${session.targetDate}:${salesRepId ?? "self"}:${routeCustomerCodes.join(",")}`;

    // A different route (including a different rep's route) is a distinct
    // loading session. Never carry its customer selection or operational
    // edits into the newly received route.
    if (hydrated.current && activeRouteKey.current !== routeKey) {
      const customerCodes = [...new Set(routeCustomerCodes)];
      setSelectedCustomerCodes(new Set(customerCodes));
      setExceptionalCustomers([]);
      setConfirmedOrdersByProduct({});
      setConfirmedProductCode("");
      setInputs({});
      setRemovedProductCodes(new Set());
      setManuallyAddedProductCodes(new Set());
      setLostOpportunityAdditions({});
      setLostOpportunityQuantityDrafts({});
      setCheckedItems(new Set());
      setRecalculation(null);
      setAppliedInputs(null);
      setHasUnappliedChanges(false);
      setIsSessionClosed(false);
      setPanel(null);
      activeRouteKey.current = routeKey;
      void applyRecalculation({ targetDate, fromDate, toDate, visitsPerWeek, staleDaysThreshold, customerCodes, confirmedOrders: [] });
      return;
    }
    if (hydrated.current) return;
    const saved = restoredWork.current;
    // Customer selection is intentionally session-local. Opening Smart
    // Loading must always start from every customer on the current route;
    // retaining an old empty selection leaves the calculation unusable.
    const customerCodes = [...new Set(routeCustomerCodes)];
    const restoredFromDate = saved?.fromDate ?? fromDate;
    const restoredToDate = saved?.toDate ?? toDate;
    const restoredVisitsPerWeek = saved?.visitsPerWeek ?? visitsPerWeek;
    const restoredStaleDaysThreshold = Math.max(1, saved?.staleDaysThreshold ?? staleDaysThreshold);
    const confirmedOrders = saved?.confirmedOrders ?? {};
    setSelectedCustomerCodes(new Set(customerCodes)); setExceptionalCustomers(saved?.exceptionalCustomers ?? []);
    if (saved) { setFromDate(restoredFromDate); setToDate(restoredToDate); setVisitsPerWeek(restoredVisitsPerWeek); setConfirmedOrdersByProduct(confirmedOrders); setHasUnappliedChanges(saved.hasUnappliedChanges ?? false); onStaleDaysThresholdChange(restoredStaleDaysThreshold); setIsSessionClosed(saved.isSessionClosed ?? false); }
    activeRouteKey.current = routeKey;
    void applyRecalculation({ targetDate, fromDate: restoredFromDate, toDate: restoredToDate, visitsPerWeek: restoredVisitsPerWeek, staleDaysThreshold: restoredStaleDaysThreshold, customerCodes, confirmedOrders: Object.entries(confirmedOrders).filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0).map(([productCode, quantity]) => ({ productCode, quantity })) }); restoredWork.current = null; hydrated.current = true;
  }, [session]);

  useEffect(() => () => recalculateAbort.current?.abort(), []);


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
  const lostOpportunityGroups = useMemo<LostOpportunityCategoryGroup[]>(() => {
    if (session?.state !== "ready") return [];
    return groupLostOpportunities(session.lostOpportunities, lostOpportunityQuantityDrafts, "", t("smartLoading.uncategorized"), appliedInputs?.visitsPerWeek ?? 1);
  }, [appliedInputs?.visitsPerWeek, lostOpportunityQuantityDrafts, session, t]);

  const allRows = useMemo<Row[]>(() => {
    if (session?.state !== "ready") return [];
    const productsByCode = new Map(session.products.map((product) => [product.productCode, product]));
    const rowsByProduct = new Map<string, Row>();
    for (const product of session.products) {
      const input: Inputs = { ...(inputs[product.productCode] ?? { safetyStock: 0 }), confirmedOrders: confirmedOrdersByProduct[product.productCode] ?? 0 };
      const effectiveVehicleStock = input.vehicleStock ?? product.currentVehicleStock;
      const calculation = calculateSuggestedLoading({ weeklyAverageSales: product.weeklyAverageSales, confirmedOrders: input.confirmedOrders, safetyStock: input.safetyStock, vehicleStock: effectiveVehicleStock });
      const savedAddition = lostOpportunityAdditions[product.productCode];
      const opportunityProduct = lostOpportunityGroups.flatMap((category) => category.products).find((item) => item.productCode === product.productCode);
      const addition = savedAddition && opportunityProduct ? { ...savedAddition, addedQuantity: opportunityProduct.totalQuantity } : savedAddition;
      const appliedProduct = recalculation?.products.find((item) => item.productCode === product.productCode);
      const baseSuggested = appliedProduct?.suggestedQuantity ?? calculation.suggestedQuantity;
      rowsByProduct.set(product.productCode, { product, input, original: calculation.grossSuggestedQuantity, baseSuggested, suggested: input.manual ?? baseSuggested + (addition?.addedQuantity ?? 0), manuallyAdded: manuallyAddedProductCodes.has(product.productCode), lostOpportunity: addition, stockAvailable: effectiveVehicleStock !== null, effectiveVehicleStock, preliminary: calculation.isPreliminary });
    }
    for (const addition of Object.values(lostOpportunityAdditions)) {
      if (rowsByProduct.has(addition.productId)) continue;
      const lostOpportunityProduct = lostOpportunityGroups.flatMap((category) => category.products).find((item) => item.productCode === addition.productId);
      const product = productsByCode.get(addition.productId) ?? { productCode: addition.productId, productName: lostOpportunityProduct?.productName ?? addition.productId, currentVehicleStock: null, weeklyAverageSales: 0, priority: "normal" as const, category: null, lastSaleDate: null, isStale: false };
      const input = inputs[addition.productId] ?? { confirmedOrders: 0, safetyStock: 0 };
      const effectiveAddition = lostOpportunityProduct ? { ...addition, addedQuantity: lostOpportunityProduct.totalQuantity } : addition;
      rowsByProduct.set(addition.productId, { product, input, original: 0, baseSuggested: 0, suggested: input.manual ?? effectiveAddition.addedQuantity, manuallyAdded: manuallyAddedProductCodes.has(addition.productId), lostOpportunity: effectiveAddition, stockAvailable: false, effectiveVehicleStock: null, preliminary: true });
    }
    return Array.from(rowsByProduct.values());
  }, [confirmedOrdersByProduct, inputs, lostOpportunityAdditions, lostOpportunityGroups, manuallyAddedProductCodes, recalculation, session]);

  const rows = useMemo(
    () => { const appliedCodes = recalculation ? new Set(recalculation.products.map((product) => product.productCode)) : null; return allRows.filter((row) => (!appliedCodes || appliedCodes.has(row.product.productCode)) && !removedProductCodes.has(row.product.productCode) && (row.suggested > 0 || row.manuallyAdded)); },
    [allRows, recalculation, removedProductCodes],
  );

  const recommendationRows = useMemo(() => {
    const query = recommendationSearch.trim().toLocaleLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      `${row.product.productName} ${row.product.productCode} ${row.product.category ?? ""}`.toLocaleLowerCase().includes(query),
    );
  }, [recommendationSearch, rows]);

  const managementRecommendationRows = useMemo<ManagementRow[]>(() => {
    if (session?.state !== "ready") return [];
    const query = recommendationSearch.trim().toLocaleLowerCase();
    const products = session.managementVehicleProducts ?? [];
    return query
      ? products.filter((product) => `${product.productName} ${product.productCode} ${product.category ?? ""}`.toLocaleLowerCase().includes(query))
      : products;
  }, [recommendationSearch, session]);

  const groupedByCategory = useMemo(() => {
    return recommendationRows.reduce<Record<string, Row[]>>((acc, row) => {
      const key = row.product.category ?? t("smartLoading.uncategorized");
      (acc[key] ??= []).push(row);
      return acc;
    }, {});
  }, [recommendationRows, t]);

  const managementGroupedByCategory = useMemo(() => managementRecommendationRows.reduce<Record<string, ManagementRow[]>>((acc, row) => {
    const key = row.category ?? t("smartLoading.uncategorized");
    (acc[key] ??= []).push(row);
    return acc;
  }, {}), [managementRecommendationRows, t]);

  const appliedProductCodes = useMemo(() => new Set(recalculation?.products.map((product) => product.productCode) ?? []), [recalculation]);
  const priorityProducts = session?.state === "ready" ? (recalculation ? session.priorityProducts.filter((product) => appliedProductCodes.has(product.productCode)) : session.priorityProducts) : [];
  const priorityGroups = useMemo(() => {
    return priorityProducts.reduce<Record<string, SmartLoadingPriorityProduct[]>>((groups, product) => {
      const category = product.category ?? t("smartLoading.uncategorized");
      (groups[category] ??= []).push(product);
      return groups;
    }, {});
  }, [priorityProducts, t]);
  const availableProducts = useMemo(() => {
    if (session?.state !== "ready") return [];
    const query = productSearch.trim().toLocaleLowerCase();
    return session.products.filter((product) => {
      if (rows.some((row) => row.product.productCode === product.productCode)) return false;
      return !query || `${product.productName} ${product.productCode} ${product.category ?? ""}`.toLocaleLowerCase().includes(query);
    });
  }, [productSearch, rows, session]);

  const staleReferenceDate = useMemo(() => session?.state === "ready" ? new Date(`${session.staleAsOfDate}T00:00:00.000Z`) : new Date(), [session]);
  // The API evaluates stale status from the selected threshold, the latest
  // Van Inventory snapshot, and route-scoped invoice history. The summary
  // must read that session result directly: `allRows` is an operational view
  // that can be rebuilt while recommendations are being recalculated.
  const staleProducts = useMemo(() => session?.state === "ready" ? session.products.filter((product) => product.isStale) : [], [session]);
  const staleRows = useMemo(() => {
    const staleProductCodes = new Set(staleProducts.map((product) => product.productCode));
    return allRows.filter((row) => staleProductCodes.has(row.product.productCode));
  }, [allRows, staleProducts]);

  const hasLocalChanges = Object.keys(inputs).length > 0 || removedProductCodes.size > 0 || manuallyAddedProductCodes.size > 0 || Object.keys(lostOpportunityAdditions).length > 0 || Object.keys(lostOpportunityQuantityDrafts).length > 0 || checkedItems.size > 0;
  function currentRecalculationSnapshot(): SmartLoadingRecalculateInput { return { targetDate, fromDate, toDate, visitsPerWeek, staleDaysThreshold, ...(salesRepId ? { salesRepId } : {}), customerCodes: [...new Set([...selectedCustomerCodes].map((code) => code.trim()).filter(Boolean))], confirmedOrders: Object.entries(confirmedOrdersByProduct).filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0).map(([productCode, quantity]) => ({ productCode, quantity })) }; }

  async function applyRecalculation(snapshot = currentRecalculationSnapshot()) {
    const scopedSnapshot = salesRepId && !snapshot.salesRepId ? { ...snapshot, salesRepId } : snapshot;
    if (scopedSnapshot.fromDate > scopedSnapshot.toDate) { setRecalculationError(label("smartLoading.invalidDateRange", "The start date must be on or before the end date.")); return; }
    if (scopedSnapshot.customerCodes.length === 0) { setRecalculationError(label("smartLoading.selectCustomer", "Select at least one customer.")); return; }
    recalculateAbort.current?.abort();
    const controller = new AbortController();
    recalculateAbort.current = controller;
    const sequence = ++recalculateSequence.current;
    setRecalculationLoading(true);
    setRecalculationError(null);
    try {
      const result = await smartLoadingApi.recalculate(scopedSnapshot, controller.signal);
      if (sequence === recalculateSequence.current) { setRecalculation(result); setAppliedInputs(scopedSnapshot); setHasUnappliedChanges(false); }
    } catch (error) {
      if (sequence === recalculateSequence.current && !(error instanceof DOMException && error.name === "AbortError")) setRecalculationError(label("smartLoading.error", "Unable to calculate loading recommendations. Try again."));
    } finally {
      if (sequence === recalculateSequence.current) setRecalculationLoading(false);
    }
  }

  function changeTargetDate(value: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minimumDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    if (!value || value < minimumDate) return;
    if (hasLocalChanges && !window.confirm(label("smartLoading.changeDateConfirm", "Changing the loading day will discard local changes. Continue?"))) return;
    if (hasLocalChanges) restoreOriginalList();
    setCheckedItems(new Set());
    setPanel(null);
    setHasUnappliedChanges(true);
    onTargetDateChange(value);
  }
  async function refresh() {
    setRefreshing(true);
    try {
      await onRetry();
      setRefreshError(null);
      setInputs({});
      setRemovedProductCodes(new Set());
      setManuallyAddedProductCodes(new Set());
      setLostOpportunityAdditions({});
      setLostOpportunityQuantityDrafts({});
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

  function addLostOpportunities(products: readonly LostOpportunityProductGroup[]) {
    const positiveProducts = products.filter((product) => product.totalQuantity > 0);
    if (positiveProducts.length === 0) return;
    const stockProducts = new Map(session?.state === "ready" ? session.products.map((product) => [product.productCode, product]) : []);
    setLostOpportunityAdditions((current) => {
      const next = { ...current };
      for (const product of positiveProducts) {
        if (next[product.productCode]) continue;
        next[product.productCode] = {
          source: "lost-opportunity",
          opportunityIds: product.customers.map((customer) => customer.id),
          customerIds: product.customers.map((customer) => customer.customerCode),
          productId: product.productCode,
          addedQuantity: product.totalQuantity,
          customers: product.customers.map((customer) => ({ id: customer.customerCode, name: customer.customerName, baselineNetQuantity: customer.baselineNetQuantity })),
        };
      }
      return next;
    });
    setRemovedProductCodes((current) => {
      const next = new Set(current);
      positiveProducts.forEach((product) => next.delete(product.productCode));
      return next;
    });
    const stockProduct = positiveProducts.length === 1 ? stockProducts.get(positiveProducts[0]!.productCode) : undefined;
    setLostOpportunityWarning(stockProduct ? `${t("smartLoading.vehicleStockQuantity", { value: stockProduct.currentVehicleStock === null ? "—" : formatQuantity(stockProduct.currentVehicleStock, locale) })}. ${t("smartLoading.reviewCapacity")}` : null);
  }

  function setLostOpportunityQuantity(opportunityId: string, value: string) {
    setLostOpportunityQuantityDrafts((current) => ({ ...current, [opportunityId]: normalizeOpportunityQuantity(value) }));
  }

  function restoreLostOpportunityQuantity(opportunityId: string) {
    setLostOpportunityQuantityDrafts((current) => {
      const next = { ...current };
      delete next[opportunityId];
      return next;
    });
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
    setLostOpportunityQuantityDrafts({});
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
      [row.product, row.category, row.vehicleStock === null ? "—" : formatQuantity(row.vehicleStock, locale), formatQuantity(row.suggestedLoading, locale), row.source].forEach((value) => {
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
  function resetOperationalState() { const customerCodes = session?.state === "ready" ? session.routeCustomers.map((customer) => customer.customerCode) : []; setExceptionalCustomers([]); setSelectedCustomerCodes(new Set(customerCodes)); setConfirmedOrdersByProduct({}); setInputs({}); setRecalculation(null); setAppliedInputs(null); setHasUnappliedChanges(false); setIsSessionClosed(false); setVisitsPerWeek(1); onStaleDaysThresholdChange(DEFAULT_SMART_LOADING_STALE_DAYS); void applyRecalculation({ targetDate, fromDate, toDate, visitsPerWeek: 1, staleDaysThreshold: DEFAULT_SMART_LOADING_STALE_DAYS, customerCodes, confirmedOrders: [] }); }
  async function closeAndExport() { if (hasUnappliedChanges) await applyRecalculation(); if (recalculationError || !window.confirm(locale === "ar" ? "هل أنت متأكد من إغلاق جلسة التحميل؟" : "Close the loading session?")) return; await exportExcel(); resetOperationalState(); }
  function startNewSession() { if (!window.confirm(locale === "ar" ? "بدء جلسة جديدة؟" : "Start a new session?")) return; window.sessionStorage.removeItem("smart-loading-work"); resetOperationalState(); }
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
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-3 pb-4" onClick={() => panel && setPanel(null)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <span className="crystal-badge h-10 w-10 bg-teal-500/15 text-teal-600">
              <PackagePlus className="h-5 w-5" />
            </span>
            {t("smartLoading.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("smartLoading.subtitle")}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="smart-loading-target-date" className="text-xs">{label("smartLoading.targetDate", "تجهيز تحميل ليوم")}</Label>
              <Input id="smart-loading-target-date" className="h-9 w-48" type="date" min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} value={targetDate} onChange={(event) => changeTargetDate(event.target.value)} />
            </div>
            {session.route ? <p className="pb-2 text-xs text-muted-foreground">{label("smartLoading.routeCustomers", "عملاء خط السير")}: {formatQuantity(session.route.customerCount, locale)}</p> : <p className="pb-2 text-xs text-amber-700">{label("smartLoading.noRouteForDate", "لا يوجد خط سير محدد لهذا اليوم.")}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!managementView && <>
          <Button asChild variant="outline">
            <Link href={`/dashboard/stale-products?targetDate=${targetDate}&staleDaysThreshold=${staleDaysThreshold}${salesRepId ? `&salesRepId=${encodeURIComponent(salesRepId)}` : ""}`}>
              <PackagePlus className="h-4 w-4" />
              {t("smartLoading.staleProductsPage")}
            </Link>
          </Button>
          <Button variant="outline" onClick={() => { setLostOpportunitiesOpen(true); setLostOpportunityWarning(null); }}>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {t("smartLoading.lostOpportunities")} ({formatQuantity(lostOpportunityGroups.reduce((sum, category) => sum + category.products.reduce((productSum, product) => productSum + product.customers.length, 0), 0), locale)})
          </Button>
          <div className="relative">
            <Button variant="outline" onClick={() => void (isSessionClosed ? exportExcel() : closeAndExport())}><Download className="h-4 w-4" />{isSessionClosed ? (locale === "ar" ? "تنزيل ملف المستودع" : "Download warehouse file") : (locale === "ar" ? "إغلاق وتصدير التحميل" : "Close and export loading")}</Button>
            {isSessionClosed && <Button variant="outline" onClick={startNewSession}>{locale === "ar" ? "بدء جلسة تحميل جديدة" : "Start new loading session"}</Button>}
            {!isSessionClosed && <Button className="sr-only" onClick={() => setExportOpen((open) => !open)}>
              <Download className="h-4 w-4" />
              {label("smartLoading.export", "تصدير")}
            </Button>}
            {exportOpen && (
              <div className="absolute left-0 z-20 mt-2 w-48 rounded-md border bg-popover p-1 shadow-lg">
                <Button className="w-full justify-start" variant="ghost" onClick={exportExcel}>Excel</Button>
                <Button className="w-full justify-start" variant="ghost" onClick={exportPdf}>PDF</Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasUnappliedChanges && <span className="text-xs text-amber-700">{locale === "ar" ? "تغييرات غير مطبقة" : "Changes not applied"}</span>}
            <Button variant="outline" disabled={recalculationLoading} onClick={() => void applyRecalculation()}>
              <RefreshCw className={cn("h-4 w-4", recalculationLoading && "animate-spin")} />
              {recalculationLoading ? label("smartLoading.recalculating", "Recalculating") : t("smartLoading.refresh")}
            </Button>
          </div>
          <Button asChild>
            <Link href="/dashboard/visit-copilot">
              <Route className="h-4 w-4" />
              {t("smartLoading.startRoute")}
            </Link>
          </Button>
          </>}
        </div>
      </header>

      <SmartLoadingPhaseTwo
        session={session}
        label={label}
        locale={locale}
        targetDate={targetDate}
        fromDate={fromDate}
        toDate={toDate}
        visitsPerWeek={visitsPerWeek}
        staleDaysThreshold={staleDaysThreshold}
        onStaleDaysThresholdChange={(value) => { onStaleDaysThresholdChange(Math.max(1, value)); setHasUnappliedChanges(true); }}
        selectedCustomerCodes={selectedCustomerCodes}
        exceptionalCustomers={exceptionalCustomers}
        loadingSummary={{ productsToLoad: rows.length, totalQuantity: rows.reduce((sum, row) => sum + row.suggested, 0), priorityProducts: priorityProducts.length, staleProducts: session?.state === "ready" ? session.staleCount : staleProducts.length }}
        confirmedOrders={confirmedOrdersByProduct}
        confirmedProductCode={confirmedProductCode}
        confirmedQuantity={confirmedQuantity}
        onPriorityClick={() => setPanel("priority")}
        onStaleClick={() => setPanel("stale")}
        onFromDateChange={(value) => { setFromDate(value); setHasUnappliedChanges(true); }}
        onToDateChange={(value) => { setToDate(value); setHasUnappliedChanges(true); }}
        onVisitsPerWeekChange={(value) => { setVisitsPerWeek(value); setHasUnappliedChanges(true); }}
        onCustomerSelectionChange={(codes, exceptionals) => { setSelectedCustomerCodes(codes); setExceptionalCustomers(exceptionals); setHasUnappliedChanges(true); }}
        onConfirmedProductCodeChange={setConfirmedProductCode}
        onConfirmedQuantityChange={setConfirmedQuantity}
        onAddConfirmedOrder={() => { if (confirmedProductCode && confirmedQuantity > 0) { setConfirmedOrdersByProduct((current) => ({ ...current, [confirmedProductCode]: confirmedQuantity })); setHasUnappliedChanges(true); } }}
        onUpdateConfirmedOrder={(productCode, quantity) => { setConfirmedOrdersByProduct((current) => ({ ...current, [productCode]: quantity })); setHasUnappliedChanges(true); }}
        onRemoveConfirmedOrder={(productCode) => { setConfirmedOrdersByProduct((current) => { const next = { ...current }; delete next[productCode]; return next; }); setHasUnappliedChanges(true); }}
        roleCode={user?.role.code}
        onSalesRepChange={onSalesRepChange}
        onManagementScopeChange={onManagementScopeChange}
      />
      {recalculationError && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{recalculationError}</div>}
      {refreshError && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {refreshError}
        </div>
      )}

      {lostOpportunitiesOpen && (
        <LostOpportunitiesDialog
          opportunities={session.lostOpportunities}
          quantityDrafts={lostOpportunityQuantityDrafts}
          additions={lostOpportunityAdditions}
          products={session.products}
          isLoading={isLoading}
          isError={isError}
          warning={lostOpportunityWarning}
          onClose={() => setLostOpportunitiesOpen(false)}
          onAddProducts={addLostOpportunities}
          onQuantityChange={setLostOpportunityQuantity}
          visitsPerWeek={appliedInputs?.visitsPerWeek ?? 1}
          onRestoreQuantity={restoreLostOpportunityQuantity}
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

      {panel === "priority" && <PriorityProductsPopover groups={priorityGroups} openGroups={openPriorityGroups} onToggleGroup={(category) => setOpenPriorityGroups((current) => { const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category); return next; })} onClose={() => setPanel(null)} />}
      {panel === "stale" && (session.managementStaleRouteProducts !== null
        ? <ManagementStaleRouteProductPopover cases={session.managementStaleRouteProducts} referenceDate={staleReferenceDate} onClose={() => setPanel(null)} />
        : <ProductListPopover rows={staleRows} stale referenceDate={staleReferenceDate} onClose={() => setPanel(null)} />)}

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
          {managementView && managementRecommendationRows.length > 0 && (
            <div className="grid grid-cols-[minmax(9rem,1fr)_repeat(3,minmax(4.5rem,auto))_5rem_auto] items-end gap-3 px-3 pb-1 text-[10px] font-medium text-muted-foreground">
              <span>{label("smartLoading.product", "الصنف")}</span>
              <span>{label("smartLoading.vehicleStock", "رصيد السيارة")}</span>
              <span>{label("smartLoading.expectedAverageSales", "متوسط المتوقع بيعه")}</span>
              <span>{label("smartLoading.stockDifference", "الفرق")}</span>
              <span>{label("smartLoading.stockStatus", "مؤشر الحالة")}</span>
              <span aria-hidden="true" />
            </div>
          )}
          {(managementView ? managementRecommendationRows : recommendationRows).length === 0 && <p className="text-sm text-muted-foreground">{t("smartLoading.empty")}</p>}
          {Object.entries(managementView ? managementGroupedByCategory : groupedByCategory).map(([category, items]) => {
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
                  className="relative flex w-full items-center justify-between px-3 py-2 pl-24 text-sm font-semibold"
                >
                  <span>
                    {category} <span className="text-muted-foreground">({items.length})</span>
                  </span>
                  {managementView && <ManagementCategoryAlignment category={category} alignments={session.managementCategoryStockAlignments} />}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
                </button>
                {open && (managementView
                  ? (items as ManagementRow[]).map((row) => <ManagementProductRow key={row.productCode} row={row} />)
                  : (items as Row[]).map((row) => (
                      <ProductRow
                        key={row.product.productCode}
                        row={row}
                        managementView={false}
                        open={openRows.has(row.product.productCode)}
                        toggle={() => setOpenRows((current) => {
                          const next = new Set(current);
                          if (next.has(row.product.productCode)) next.delete(row.product.productCode);
                          else next.add(row.product.productCode);
                          return next;
                        })}
                        setInput={setInput}
                        resetManualOverride={resetManualOverride}
                        removeProduct={removeProduct}
                      />
                    ))) }
              </section>
            );
          })}

          {!managementView && <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={() => setAddProductOpen(true)}>
              <Plus className="h-4 w-4" />
              {label("smartLoading.addProduct", "Add product")}
            </Button>
            <Button variant="ghost" onClick={restoreOriginalList} disabled={rows.length === 0 && manuallyAddedProductCodes.size === 0}>
              <RotateCcw className="h-4 w-4" />
              {label("smartLoading.restoreOriginalList", "Restore original list")}
            </Button>
          </div>}

          {!managementView && <div className="mt-3 border-t pt-3">
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
          </div>}
        </CardContent>
      </Card>
    </div>
  );
}

function LostOpportunitiesDialog({
  opportunities,
  quantityDrafts,
  additions,
  products,
  isLoading,
  isError,
  warning,
  visitsPerWeek,
  onClose,
  onAddProducts,
  onQuantityChange,
  onRestoreQuantity,
}: {
  opportunities: SmartLoadingLostOpportunity[];
  quantityDrafts: OpportunityQuantityDrafts;
  additions: Record<string, LostOpportunityAddition>;
  products: SmartLoadingProduct[];
  isLoading: boolean;
  isError: boolean;
  warning: string | null;
  visitsPerWeek: 1 | 2 | 6;
  onClose: () => void;
  onAddProducts: (products: readonly LostOpportunityProductGroup[]) => void;
  onQuantityChange: (opportunityId: string, value: string) => void;
  onRestoreQuantity: (opportunityId: string) => void;
}) {
  const { locale, t } = useTranslation();
  const [search, setSearch] = useState("");
  const [manualOpenCategories, setManualOpenCategories] = useState<Set<string>>(new Set());
  const [manualOpenProducts, setManualOpenProducts] = useState<Set<string>>(new Set());
  const hasInitializedAccordion = useRef(false);
  const allGroups = useMemo(
    () => groupLostOpportunities(opportunities, quantityDrafts, "", t("smartLoading.uncategorized"), visitsPerWeek),
    [opportunities, quantityDrafts, t, visitsPerWeek],
  );
  const groups = useMemo(
    () => search ? groupLostOpportunities(opportunities, quantityDrafts, search, t("smartLoading.uncategorized"), visitsPerWeek) : allGroups,
    [allGroups, opportunities, quantityDrafts, search, t, visitsPerWeek],
  );
  const totalQuantity = groups.reduce((sum, category) => sum + category.totalQuantity, 0);
  const productCount = groups.reduce((sum, category) => sum + category.productCount, 0);
  const customerCount = groups.reduce((sum, category) => sum + category.customerCount, 0);


  useEffect(() => {
    if (!hasInitializedAccordion.current && allGroups.length > 0) {
      hasInitializedAccordion.current = true;
      setManualOpenCategories(new Set([allGroups[0]!.category]));
    }
  }, [allGroups]);

  const searchActive = Boolean(search.trim());
  const matchedCategories = useMemo(() => new Set(groups.map((category) => category.category)), [groups]);
  const matchedProducts = useMemo(() => new Set(groups.flatMap((category) => category.products.map((product) => lostOpportunityProductId(category.category, product.productCode)))), [groups]);
  const effectiveOpenCategories = getEffectiveAccordionState(manualOpenCategories, matchedCategories, searchActive);
  const effectiveOpenProducts = getEffectiveAccordionState(manualOpenProducts, matchedProducts, searchActive);

  function toggleCategory(category: string) {
    setManualOpenCategories((current) => { const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category); return next; });
  }
  function toggleProduct(category: string, productCode: string) {
    const id = lostOpportunityProductId(category, productCode);
    setManualOpenProducts((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={t("smartLoading.lostOpportunities")}>
      <Card className="max-h-[85vh] w-full max-w-3xl overflow-y-auto shadow-xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{t("smartLoading.lostOpportunities")}</CardTitle>
            <CardDescription>{t("smartLoading.lostOpportunitiesDescription")}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>{t("smartLoading.close")}</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("smartLoading.searchLostOpportunities")} />
          <div className="grid grid-cols-2 gap-2 rounded-md bg-secondary/60 p-3 text-sm sm:grid-cols-4">
            <p>{t("smartLoading.lostOpportunityCategories")}: <strong>{formatQuantity(groups.length, locale)}</strong></p>
            <p>{t("smartLoading.lostOpportunityProducts")}: <strong>{formatQuantity(productCount, locale)}</strong></p>
            <p>{t("smartLoading.lostOpportunityCustomers")}: <strong>{formatQuantity(customerCount, locale)}</strong></p>
            <p>{t("smartLoading.totalQuantity")}: <strong>{formatLostOpportunityQuantity(totalQuantity, locale)}</strong></p>
          </div>
          {isLoading && <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
          {isError && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{t("smartLoading.lostOpportunitiesError")}</p>}
          {!isLoading && !isError && groups.length === 0 && <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">{t("smartLoading.noLostOpportunities")}</p>}
          {!isLoading && !isError && groups.map((category) => {
            const addedCount = categoryAddedProductCount(category, new Set(Object.keys(additions)));
            const unaddedProducts = category.products.filter((product) => !additions[product.productCode]);
            return <section key={category.category} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button type="button" className="min-w-0 text-start" onClick={() => toggleCategory(category.category)} aria-expanded={effectiveOpenCategories.has(category.category)}>
                  <h3 className="font-semibold">{category.category}</h3>
                  <p className="text-xs text-muted-foreground">{t("smartLoading.categoryTotal", { value: formatLostOpportunityQuantity(category.totalQuantity, locale) })}</p>
                  {addedCount > 0 && addedCount < category.productCount && <p className="text-xs text-amber-700">{t("smartLoading.categoryPartiallyAdded", { added: formatQuantity(addedCount, locale), total: formatQuantity(category.productCount, locale) })}</p>}
                  {addedCount === category.productCount && <p className="text-xs text-emerald-700">{t("smartLoading.added")}</p>}
                </button>
                <Button variant="outline" disabled={unaddedProducts.length === 0 || unaddedProducts.every((product) => product.totalQuantity <= 0)} onClick={() => onAddProducts(unaddedProducts)}>{t("smartLoading.addCategory")}</Button>
              </div>
              {effectiveOpenCategories.has(category.category) && <div className="mt-3 space-y-3">
                {category.products.map((product) => {
                  const stockProduct = products.find((item) => item.productCode === product.productCode);
                  const added = Boolean(additions[product.productCode]);
                  const productId = lostOpportunityProductId(category.category, product.productCode);
                  return <article key={product.productCode} className="rounded-md border bg-background/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button type="button" className="min-w-0 text-start" onClick={() => toggleProduct(category.category, product.productCode)} aria-expanded={effectiveOpenProducts.has(productId)}>
                        <p className="font-medium">{product.productName}</p>
                        <p className="text-xs text-muted-foreground">{product.productCode} {"\u00b7"} {t("smartLoading.productSuggestedQuantity", { value: formatLostOpportunityQuantity(product.totalQuantity, locale) })}</p>
                      </button>
                      <Button disabled={added || product.totalQuantity <= 0} onClick={() => onAddProducts([product])}>{added ? t("smartLoading.added") : t("smartLoading.addToLoading")}</Button>
                    </div>
                    {effectiveOpenProducts.has(productId) && <div className="mt-2 space-y-2 border-t pt-2">
                      {product.customers.map((customer) => <div key={customer.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm">
                        <span className="min-w-0 truncate">{customer.customerName}</span>
                        <Input className="h-8 w-24 text-center" type="number" min="0" step="0.01" value={formatLostOpportunityQuantityInput(customer.currentQuantity)} onChange={(event) => onQuantityChange(customer.id, event.target.value)} aria-label={t("smartLoading.customerSuggestedQuantity", { customer: customer.customerName })} />
                        <Button className="h-11 sm:h-8" variant="ghost" size="sm" onClick={() => onRestoreQuantity(customer.id)}>{t("smartLoading.restore")}</Button>
                      </div>)}
                    </div>}
                    <p className="mt-2 text-xs text-muted-foreground">{stockProduct ? t("smartLoading.vehicleStockQuantity", { value: stockProduct.currentVehicleStock === null ? "—" : formatQuantity(stockProduct.currentVehicleStock, locale) }) : t("smartLoading.vehicleStockUnavailable")}</p>
                  </article>;
                })}
              </div>}
            </section>;
          })}
          {warning && <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">{warning}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductRow({
  row,
  managementView,
  open,
  toggle,
  setInput,
  resetManualOverride,
  removeProduct,
}: {
  row: Row;
  managementView: boolean;
  open: boolean;
  toggle: () => void;
  setInput: (productCode: string, key: keyof Inputs, value: string) => void;
  resetManualOverride: (productCode: string) => void;
  removeProduct: (productCode: string) => void;
}) {
  const { locale, t } = useTranslation();
  const label = (key: string, fallback: string) => {
    const translated = t(key as never);
    return translated === key ? fallback : translated;
  };
  const hasManualOverride = row.input.manual !== undefined;
  // Both inputs are already Route -> Product rollups performed by the
  // Smart Loading RIE queries. This is presentation-only: it deliberately
  // does not feed the sales-rep loading recommendation calculation.
  const expectedSales = row.product.weeklyAverageSales;
  const stockDifference = row.effectiveVehicleStock === null ? null : row.effectiveVehicleStock - expectedSales;
  const stockCoversExpected = stockDifference !== null && stockDifference >= 0;
  const stockCoveragePercent = row.effectiveVehicleStock === null ? null : expectedSales <= 0 ? 100 : Math.min(100, Math.max(0, (Math.min(row.effectiveVehicleStock, expectedSales) / expectedSales) * 100));
  const stockCoverageTone = stockCoveragePercent === null
    ? null
    : stockCoveragePercent < 50
      ? "bg-rose-500/25 text-rose-800 ring-rose-500/50 dark:bg-rose-400/30 dark:text-rose-100 dark:ring-rose-300/70"
      : stockCoveragePercent < 75
        ? "bg-amber-500/25 text-amber-800 ring-amber-500/50 dark:bg-amber-400/30 dark:text-amber-100 dark:ring-amber-300/70"
        : "bg-emerald-500/25 text-emerald-800 ring-emerald-500/50 dark:bg-emerald-400/30 dark:text-emerald-100 dark:ring-emerald-300/70";

  return (
    <article className="border-t px-3 py-2">
      {managementView ? (
        <div className="grid grid-cols-[minmax(9rem,1fr)_repeat(3,minmax(4.5rem,auto))_5rem_auto] items-center gap-3 text-xs">
          <button onClick={toggle} className="min-w-0 text-right">
            <p className="truncate text-sm font-medium">{row.product.productName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{row.product.category ?? t("smartLoading.uncategorized")}</p>
          </button>
          <span className="font-medium">{row.effectiveVehicleStock === null ? "—" : formatQuantity(row.effectiveVehicleStock, locale)}</span>
          <span className="font-medium">{formatQuantity(expectedSales, locale)}</span>
          <span className="font-medium">{stockDifference === null ? "—" : formatQuantity(stockDifference, locale)}</span>
          <div className="min-w-0">
            {stockCoveragePercent === null ? "—" : <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1", stockCoverageTone)} aria-label={label("smartLoading.stockStatus", "مؤشر الحالة")}><span aria-hidden="true">{stockCoversExpected ? "↑" : "↓"}</span>{formatQuantity(Math.round(stockCoveragePercent), locale)}%</span>}
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
        </div>
      ) : (
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <button onClick={toggle} className="min-w-0 text-right">
          <p className="truncate text-sm font-medium">{row.product.productName}</p>
          <p className="text-[11px] text-muted-foreground">
            {row.product.category ?? t("smartLoading.uncategorized")} · {t("smartLoading.vehicleStock")}{" "}
            {row.effectiveVehicleStock === null ? "—" : formatQuantity(row.effectiveVehicleStock, locale)}
          </p>
        </button>
        <div className="flex items-start gap-2 text-left">
          <div>
            <p className="text-[10px] text-muted-foreground">{t("smartLoading.suggestedLoading")}</p>
          <Input
            className="h-8 w-20 text-center font-bold text-teal-700"
            type="number"
            min={row.manuallyAdded ? "1" : "0"}
            value={formatQuantityInput(row.suggested)}
            onChange={(event) => {
              const nextValue = row.manuallyAdded ? Math.max(1, parsePositiveNumber(event.target.value)) : parsePositiveNumber(event.target.value);
              setInput(row.product.productCode, "manual", String(nextValue));
            }}
          />
            {row.preliminary && <p className="mt-1 text-[10px] font-medium text-amber-700">{label("smartLoading.preliminaryNeed", "احتياج مبدئي")}</p>}
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
      )}

      {hasManualOverride && (
        <p className="mt-1 text-[11px] text-amber-700">
          {t("smartLoading.manualOverrideNote", { value: formatQuantity(row.original, locale) })}
        </p>
      )}

      {row.lostOpportunity && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
          <p className="font-semibold text-amber-800">
            {t("smartLoading.lostOpportunities")} {"\u00b7"} {row.lostOpportunity.customers.map((customer) => customer.name).join(", ")}
          </p>
          <div className="mt-1 grid gap-1 sm:grid-cols-3">
            <span>{t("smartLoading.suggestedLoading")}: {formatQuantity(row.baseSuggested, locale)}</span>
            <span>{t("smartLoading.lostOpportunities")}: {formatLostOpportunityQuantity(row.lostOpportunity.addedQuantity, locale)}</span>
            <span className="font-semibold">{t("smartLoading.totalQuantity")}: {formatQuantity(row.suggested, locale)}</span>
          </div>
          <p className="mt-1 text-amber-800">
            {row.stockAvailable
              ? `${t("smartLoading.vehicleStockQuantity", { value: row.effectiveVehicleStock === null ? "—" : formatQuantity(row.effectiveVehicleStock, locale) })}. ${t("smartLoading.reviewCapacity")}`
              : `${t("smartLoading.vehicleStockUnavailable")} ${t("smartLoading.reviewCapacity")}`}
          </p>
        </div>
      )}

      {open && (
        <div className="mt-2 grid gap-2 border-t pt-2 text-xs sm:grid-cols-2">
          {row.effectiveVehicleStock === null && <Field
            label={label("smartLoading.manualVehicleStock", "رصيد السيارة")}
            hint={label("smartLoading.manualVehicleStockHint", "أدخل الرصيد المتاح لتحويل الاحتياج المبدئي إلى توصية نهائية.")}
            value={row.input.vehicleStock ?? 0}
            onChange={(value) => setInput(row.product.productCode, "vehicleStock", value)}
          />}          <Info label={t("smartLoading.weeklyAverage")} value={formatQuantity(row.product.weeklyAverageSales, locale)} />
          <Field
            label={t("smartLoading.safetyStock")}
            hint={t("smartLoading.safetyStockHint")}
            value={row.input.safetyStock}
            onChange={(value) => setInput(row.product.productCode, "safetyStock", value)}
          />
        </div>
      )}
    </article>
  );
}

function ManagementProductRow({ row }: { row: ManagementRow }) {
  const { locale, t } = useTranslation();
  const stockDifference = row.currentVehicleStock - row.weeklyAverageSales;
  const stockCoveragePercent = row.weeklyAverageSales <= 0 ? 100 : Math.min(100, Math.max(0, (Math.min(row.currentVehicleStock, row.weeklyAverageSales) / row.weeklyAverageSales) * 100));
  const stockCoversExpected = stockDifference >= 0;
  const stockCoverageTone = stockCoveragePercent < 50
    ? "bg-rose-500/25 text-rose-800 ring-rose-500/50 dark:bg-rose-400/30 dark:text-rose-100 dark:ring-rose-300/70"
    : stockCoveragePercent < 75
      ? "bg-amber-500/25 text-amber-800 ring-amber-500/50 dark:bg-amber-400/30 dark:text-amber-100 dark:ring-amber-300/70"
      : "bg-emerald-500/25 text-emerald-800 ring-emerald-500/50 dark:bg-emerald-400/30 dark:text-emerald-100 dark:ring-emerald-300/70";
  return <article className="border-t px-3 py-2"><div className="grid grid-cols-[minmax(9rem,1fr)_repeat(3,minmax(4.5rem,auto))_5rem_auto] items-center gap-3 text-xs"><div className="min-w-0 text-right"><p className="truncate text-sm font-medium">{row.productName}</p><p className="truncate text-[11px] text-muted-foreground">{row.category ?? t("smartLoading.uncategorized")}</p></div><span className="font-medium">{formatQuantity(row.currentVehicleStock, locale)}</span><span className="font-medium">{formatQuantity(row.weeklyAverageSales, locale)}</span><span className="font-medium">{formatQuantity(stockDifference, locale)}</span><div><span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1", stockCoverageTone)}><span aria-hidden="true">{stockCoversExpected ? "↑" : "↓"}</span>{formatQuantity(Math.round(stockCoveragePercent), locale)}%</span></div><span aria-hidden="true" /></div></article>;
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-background/60 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", strong && "text-teal-700")}>{value}</p>
    </div>
  );
}

function MetricButton({ label, value, description, onClick }: { label: string; value: string; description?: string; onClick: (event: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} className="rounded-md bg-background/60 p-2 text-right hover:bg-secondary">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {description && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{description}</p>}
    </button>
  );
}

function ManagementStockAlignmentMetric({ label, value, locale }: { label: string; value: number; locale: "ar" | "en" }) {
  const percent = Math.min(100, Math.max(0, value));
  const needleRotation = -90 + percent * 1.8;
  const tone = percent < 50 ? "text-rose-500" : percent < 75 ? "text-amber-500" : "text-emerald-500";
  return (
    <Card className="h-24 min-w-0 border-border/70 bg-background/60 shadow-none">
      <CardContent className="flex h-full items-center justify-between px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-xl font-semibold", tone)}>{formatQuantity(Math.round(percent), locale)}%</p>
      </div>
      <svg viewBox="0 0 112 64" className="h-16 w-28 shrink-0" role="img" aria-label={`${label}: ${Math.round(percent)}%`}>
        <path d="M 14 56 A 42 42 0 0 1 98 56" fill="none" stroke="currentColor" strokeWidth="9" className="text-muted-foreground/30" strokeLinecap="round" />
        <path d="M 14 56 A 42 42 0 0 1 98 56" fill="none" stroke="currentColor" strokeWidth="9" className={tone} strokeLinecap="round" strokeDasharray={`${percent * 1.32} 132`} />
        <line x1="56" y1="56" x2="56" y2="22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={tone} transform={`rotate(${needleRotation} 56 56)`} />
        <circle cx="56" cy="56" r="4" fill="currentColor" className={tone} />
      </svg>
      </CardContent>
    </Card>
  );
}

function ManagementCategoryAlignment({ category, alignments }: { category: string; alignments: SmartLoadingManagementCategoryStockAlignment[] | null }) {
  const { locale, t } = useTranslation();
  const alignment = alignments?.find((item) => (item.category ?? t("smartLoading.uncategorized")) === category);
  if (!alignment) return null;
  // Classify the raw numeric percentage before rounding it for display so
  // formatting can never change the management threshold outcome.
  const numericPercent = Number(alignment.alignmentPercent);
  if (!Number.isFinite(numericPercent)) return null;
  const boundedPercent = Math.min(100, Math.max(0, numericPercent));
  const percent = Math.round(boundedPercent);
  const status = boundedPercent < 50
    ? "bg-rose-500/30 text-rose-900 ring-rose-500/70 dark:bg-rose-400/35 dark:text-rose-50 dark:ring-rose-300"
    : boundedPercent < 75
      ? "bg-amber-500/30 text-amber-900 ring-amber-500/70 dark:bg-amber-400/35 dark:text-amber-50 dark:ring-amber-300"
      : "bg-emerald-500/30 text-emerald-900 ring-emerald-500/70 dark:bg-emerald-400/35 dark:text-emerald-50 dark:ring-emerald-300";

  return (
    <span className={cn("absolute left-10 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", status)} aria-label={`${formatQuantity(percent, locale)}%`}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
      {formatQuantity(percent, locale)}%
    </span>
  );
}

function RecencyDetail({ label, value, locale }: { label: string; value: number; locale: "ar" | "en" }) {
  return <div className="rounded bg-background/50 px-2 py-1.5"><p className="text-muted-foreground">{label}</p><p className="mt-0.5 font-semibold text-foreground">{formatQuantity(value, locale)}</p></div>;
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
      <Input className="mt-1 h-11 sm:h-8" type="number" min="0" value={formatQuantityInput(value)} onChange={(event) => onChange(event.target.value)} />
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
                value={formatQuantityInput(quantity)}
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

function CategoryProductGroups({ rows, stale, referenceDate }: { rows: Row[]; stale: boolean; referenceDate?: Date }) {
  const { locale, t } = useTranslation();
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
              <span>{category} ({formatQuantity(items.length, locale)})</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
            </button>
            {open && (
              <div className="max-h-56 overflow-y-auto border-t px-2">
                {items.map((row) => (
                  <div key={row.product.productCode} className="grid grid-cols-[1fr_auto] gap-2 border-b py-1.5 text-xs last:border-0">
                    <span className="min-w-0 truncate font-medium">{row.product.productName}</span>
                    <span className="text-left text-muted-foreground">
                      {t("smartLoading.vehicleStock")} {row.effectiveVehicleStock === null ? "—" : formatQuantity(row.effectiveVehicleStock, locale)}
                      {stale && (
                        <> · {t("smartLoading.lastSale")} {formatGregorianDate(row.product.lastSaleDate) ?? "—"} · {daysSinceLastSale(row.product.lastSaleDate, referenceDate) ?? "—"} {t("smartLoading.staleDaysUnit")}</>
                      )}
                      {!stale && <> · {t("smartLoading.suggestedLoading")} {formatQuantity(row.suggested, locale)}</>}
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

function PriorityProductsPopover({
  groups,
  openGroups,
  onToggleGroup,
  onClose,
}: {
  groups: Record<string, SmartLoadingPriorityProduct[]>;
  openGroups: Set<string>;
  onToggleGroup: (category: string) => void;
  onClose: () => void;
}) {
  const { locale, t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onClick={onClose}>
      <Card className="w-[min(92vw,620px)] shadow-xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-center justify-between p-4">
          <CardTitle>{t("smartLoading.operationalPriorityProducts")}</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose}>{t("smartLoading.close")}</Button>
        </CardHeader>
        <CardContent className="max-h-[60vh] space-y-2 overflow-y-auto p-4 pt-0">
          {Object.entries(groups).map(([category, products]) => {
            const open = openGroups.has(category);
            return <section key={category} className="rounded border">
              <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold" onClick={() => onToggleGroup(category)}>
                <span>{category} ({formatQuantity(products.length, locale)})</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
              </button>
              {open && <div className="divide-y border-t px-3">
                {products.map((product) => <div key={product.productCode} className="grid grid-cols-[1fr_auto] gap-3 py-2 text-xs">
                  <span className="min-w-0"><strong className="block truncate text-sm">{product.productName}</strong><span className="text-muted-foreground">{t("smartLoading.routeCustomers")}: {formatQuantity(product.routeCustomerCount, locale)}</span></span>
                  <span className="text-left text-muted-foreground">{t("smartLoading.totalQuantity")}: {formatQuantity(product.totalQuantity, locale)}{product.currentVehicleStock !== null && <><br />{t("smartLoading.vehicleStock")}: {formatQuantity(product.currentVehicleStock, locale)}</>}</span>
                </div>)}
              </div>}
            </section>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}
function ProductListPopover({ rows, stale, referenceDate, onClose }: { rows: Row[]; stale: boolean; referenceDate?: Date; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onClick={onClose}>
      <Card className="w-[min(92vw,520px)] shadow-xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-center justify-between p-4">
          <CardTitle>{stale ? t("smartLoading.staleProductsPanelTitle") : t("smartLoading.operationalPriorityProductsPanelTitle")}</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose}>{t("smartLoading.close")}</Button>
        </CardHeader>
        <CardContent className="max-h-[60vh] overflow-y-auto p-4 pt-0">
          <CategoryProductGroups rows={rows} stale={stale} referenceDate={referenceDate} />
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

type SmartLoadingPhaseTwoProps = {
  session: Extract<SmartLoadingSession, { state: "ready" }>;
  label: (key: string, fallback: string) => string;
  locale: "ar" | "en";
  targetDate: string;
  fromDate: string;
  toDate: string;
  visitsPerWeek: 1 | 2 | 6;
  staleDaysThreshold: number;
  onStaleDaysThresholdChange: (value: number) => void;
  selectedCustomerCodes: Set<string>;
  exceptionalCustomers: SmartLoadingRouteCustomer[];
  loadingSummary: { productsToLoad: number; totalQuantity: number; priorityProducts: number; staleProducts: number };
  confirmedOrders: Record<string, number>;
  confirmedProductCode: string;
  confirmedQuantity: number;
  onPriorityClick: () => void;
  onStaleClick: () => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onVisitsPerWeekChange: (value: 1 | 2 | 6) => void;
  onCustomerSelectionChange: (codes: Set<string>, exceptionals: SmartLoadingRouteCustomer[]) => void;
  onConfirmedProductCodeChange: (value: string) => void;
  onConfirmedQuantityChange: (value: number) => void;
  onAddConfirmedOrder: () => void;
  onUpdateConfirmedOrder: (productCode: string, quantity: number) => void;
  onRemoveConfirmedOrder: (value: string) => void;
  roleCode?: string;
  onSalesRepChange: (value: string | undefined) => void;
  onManagementScopeChange: (scope: { managerId?: string; supervisorId?: string; salesRepId?: string }) => void;
};

function SmartLoadingPhaseTwo(props: SmartLoadingPhaseTwoProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftCustomerCodes, setDraftCustomerCodes] = useState<Set<string>>(new Set());
  const [draftExceptionalCustomers, setDraftExceptionalCustomers] = useState<SmartLoadingRouteCustomer[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<SmartLoadingRouteCustomer[]>([]);
  const days = props.fromDate <= props.toDate ? Math.floor((new Date(`${props.toDate}T00:00:00`).getTime() - new Date(`${props.fromDate}T00:00:00`).getTime()) / 86_400_000) + 1 : 0;
  const orders = Object.entries(props.confirmedOrders);
  const productByCode = new Map(props.session.products.map((product) => [product.productCode, product]));  const [productQuery, setProductQuery] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<SmartLoadingProduct[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);


  useEffect(() => {
    const query = productQuery.trim().toLocaleLowerCase();
    if (!query) { setProductSuggestions([]); setProductSearchLoading(false); return; }
    setProductSearchLoading(true);
    const timer = window.setTimeout(() => {
      setProductSuggestions(props.session.products.filter((product) => `${product.productName} ${product.productCode}`.toLocaleLowerCase().includes(query)).slice(0, 8));
      setActiveProductIndex(-1);
      setProductSearchLoading(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [productQuery, props.session.products]);


  useEffect(() => {
    if (!editorOpen || !customerQuery.trim()) { setCustomerResults([]); return; }
    const timer = window.setTimeout(() => { void smartLoadingApi.searchCustomers(customerQuery, [...draftCustomerCodes]).then((result) => setCustomerResults(result.customers)).catch(() => setCustomerResults([])); }, 250);
    return () => window.clearTimeout(timer);
  }, [customerQuery, draftCustomerCodes, editorOpen]);

  function openEditor() { setDraftCustomerCodes(new Set(props.selectedCustomerCodes)); setDraftExceptionalCustomers(props.exceptionalCustomers); setCustomerQuery(""); setCustomerResults([]); setEditorOpen(true); }
  function toggleRouteCustomer(code: string) { setDraftCustomerCodes((current) => { const next = new Set(current); next.has(code) ? next.delete(code) : next.add(code); return next; }); }
  function addExceptional(customer: SmartLoadingRouteCustomer) { setDraftExceptionalCustomers((current) => current.some((item) => item.customerCode === customer.customerCode) ? current : [...current, customer]); setDraftCustomerCodes((current) => new Set(current).add(customer.customerCode)); setCustomerQuery(""); setCustomerResults([]); }
  function removeExceptional(code: string) { setDraftExceptionalCustomers((current) => current.filter((customer) => customer.customerCode !== code)); setDraftCustomerCodes((current) => { const next = new Set(current); next.delete(code); return next; }); }
  function applyCustomers() { props.onCustomerSelectionChange(new Set(draftCustomerCodes), draftExceptionalCustomers); setEditorOpen(false); }
  function changeVisits(value: string) { const parsed = Number(value); if (parsed === 1 || parsed === 2 || parsed === 6) props.onVisitsPerWeekChange(parsed); }
  function selectConfirmedProduct(product: SmartLoadingProduct) {
    props.onConfirmedProductCodeChange(product.productCode);
    props.onConfirmedQuantityChange(props.confirmedOrders[product.productCode] ?? 1);
    setProductQuery(product.productName);
    setProductSuggestions([]);
    setActiveProductIndex(-1);
  }

  function handleProductSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveProductIndex((index) => Math.min(index + 1, productSuggestions.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveProductIndex((index) => Math.max(index - 1, 0)); }
    if (event.key === "Escape") { setProductSuggestions([]); setActiveProductIndex(-1); }
    if (event.key === "Enter" && activeProductIndex >= 0 && productSuggestions[activeProductIndex]) { event.preventDefault(); selectConfirmedProduct(productSuggestions[activeProductIndex]); }
  }

  if (isManagementRole(props.roleCode)) {
    return <ManagementHierarchyFilters locale={props.locale} managementStockAlignmentPercent={props.session.managementStockAlignmentPercent} managementStaleCount={props.session.staleCount} onManagementStaleClick={props.onStaleClick} onManagementScopeChange={props.onManagementScopeChange} />;
  }

  return <>
    <section className="grid items-stretch gap-3 lg:h-[26rem] lg:grid-cols-[26fr_24fr] lg:grid-rows-[1fr_1fr]" style={{ direction: "ltr" }}>
      <div dir={props.locale === "ar" ? "rtl" : "ltr"} className="order-1 grid min-h-0 gap-3 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:grid-rows-[13rem_1fr]">
        <Card className="flex h-full min-h-0 flex-col"><CardHeader className="shrink-0 pb-2"><div className="flex items-center justify-between gap-2"><div><CardTitle className="text-base">{props.label("smartLoading.routeSetup", "Route setup")}</CardTitle><CardDescription>{props.label("smartLoading.targetDate", "Prepare loading for")}: {props.targetDate}</CardDescription></div><Button size="sm" variant="outline" onClick={openEditor}>{props.label("smartLoading.editRoute", "Edit route")}</Button></div></CardHeader><CardContent className="grid gap-2 text-sm sm:grid-cols-2"><div><Label htmlFor="smart-loading-from-date" className="text-xs text-muted-foreground">{props.label("smartLoading.fromDate", "From date")}</Label><Input id="smart-loading-from-date" className="mt-1 h-8" type="date" value={props.fromDate} max={props.toDate} onChange={(event) => props.onFromDateChange(event.target.value)} /></div><div><Label htmlFor="smart-loading-to-date" className="text-xs text-muted-foreground">{props.label("smartLoading.toDate", "To date")}</Label><Input id="smart-loading-to-date" className="mt-1 h-8" type="date" value={props.toDate} min={props.fromDate} onChange={(event) => props.onToDateChange(event.target.value)} /></div><div><Label htmlFor="smart-loading-visits" className="text-xs text-muted-foreground">{props.label("smartLoading.visitsPerWeek", "Route visits pattern")}</Label><select id="smart-loading-visits" className="mt-1 h-8 w-full rounded-md border bg-background px-2" value={props.visitsPerWeek} onChange={(event) => changeVisits(event.target.value)}><option value="1">{props.label("smartLoading.onceWeekly", "Once weekly")}</option><option value="2">{props.label("smartLoading.twiceWeekly", "Twice weekly")}</option><option value="6">{props.label("smartLoading.sixWeekly", "6 times weekly")}</option></select></div><div><Label htmlFor="smart-loading-stale-days" className="text-xs text-muted-foreground">{props.label("smartLoading.staleDays", "Stale after days")}</Label><Input id="smart-loading-stale-days" className="mt-0.5 h-11 sm:h-8" type="number" min={1} value={props.staleDaysThreshold} onChange={(event) => props.onStaleDaysThresholdChange(Math.max(1, Number(event.target.value) || 1))} /></div>{days === 0 && <p role="alert" className="sm:col-span-2 text-xs text-destructive">{props.label("smartLoading.invalidDateRange", "The start date must be on or before the end date.")}</p>}</CardContent></Card>
        <Card className="glass-hero flex h-full min-h-0 flex-col"><CardHeader className="pb-1 pt-3"><CardTitle className="text-sm">{props.label("smartLoading.summaryTitle", "Loading summary")}</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-2 pb-3 text-xs"><Metric label={props.label("smartLoading.productsToLoad", "Products to load")} value={formatQuantity(props.loadingSummary.productsToLoad, props.locale)} /><Metric label={props.label("smartLoading.totalQuantity", "Total quantity")} value={formatQuantity(props.loadingSummary.totalQuantity, props.locale)} strong /><MetricButton label={props.label("smartLoading.operationalPriorityProducts", "Priority products")} value={formatQuantity(props.loadingSummary.priorityProducts, props.locale)} onClick={props.onPriorityClick} /><MetricButton label={props.label("smartLoading.staleProducts", "Stale products")} value={formatQuantity(props.loadingSummary.staleProducts, props.locale)} onClick={props.onStaleClick} /></CardContent></Card>
      </div>
      {isManagementRole(props.roleCode) && <ManagementHierarchyFilters locale={props.locale} managementStockAlignmentPercent={props.session.managementStockAlignmentPercent} managementStaleCount={props.session.staleCount} onManagementStaleClick={props.onStaleClick} onManagementScopeChange={props.onManagementScopeChange} />}
      <Card dir={props.locale === "ar" ? "rtl" : "ltr"} className="order-2 flex h-full min-h-0 flex-col lg:col-start-1 lg:row-start-1 lg:row-span-2"><CardHeader className="shrink-0 px-4 pb-1 pt-4"><CardTitle className="text-base">{props.label("smartLoading.aggregatedConfirmedOrders", "Aggregated confirmed orders")}</CardTitle><CardDescription>{props.label("smartLoading.orderTotals", "Products")}: {orders.length} · {props.label("smartLoading.totalQuantity", "Total quantity")}: {formatQuantity(orders.reduce((sum, [, quantity]) => sum + quantity, 0), props.locale)}</CardDescription></CardHeader><CardContent className="flex min-h-0 flex-1 flex-col space-y-1 p-4 pt-1"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_auto]"><div className="relative"><Input aria-label={props.label("smartLoading.searchProducts", "Search products")} className="h-8" placeholder={props.label("smartLoading.searchProducts", "Search products")} value={productQuery} onChange={(event) => setProductQuery(event.target.value)} onKeyDown={handleProductSearchKeyDown} role="combobox" aria-expanded={productSuggestions.length > 0} aria-controls="confirmed-product-suggestions" />{productSearchLoading && <span className="absolute left-3 top-2 text-xs text-muted-foreground">{props.label("smartLoading.loading", "Loading…")}</span>}{productQuery.trim() && !productSearchLoading && <div id="confirmed-product-suggestions" role="listbox" className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">{productSuggestions.length === 0 ? <p className="p-2 text-sm text-muted-foreground">{props.label("smartLoading.noResults", "No results")}</p> : productSuggestions.map((product, index) => <button key={product.productCode} type="button" role="option" aria-selected={activeProductIndex === index} className={cn("flex w-full items-center justify-between rounded px-2 py-1.5 text-right text-sm hover:bg-secondary", activeProductIndex === index && "bg-secondary")} onMouseDown={(event) => event.preventDefault()} onClick={() => selectConfirmedProduct(product)}><span>{product.productName}</span><span className="text-xs text-muted-foreground">{product.productCode}</span></button>)}</div>}</div><Input className="h-8" type="text" inputMode="numeric" pattern="[0-9]*" value={props.confirmedQuantity} onChange={(event) => props.onConfirmedQuantityChange(Math.max(1, Number(event.target.value) || 1))} /><Button className="h-8" type="button" onClick={props.onAddConfirmedOrder} disabled={!props.confirmedProductCode}>{props.confirmedOrders[props.confirmedProductCode] ? props.label("settings.save", "Save") : props.label("smartLoading.add", "Add")}</Button></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">{orders.length === 0 ? <div className="flex min-h-16 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">{props.label("smartLoading.noConfirmedOrders", "No confirmed orders added.")}</div> : orders.map(([code, quantity]) => <div key={code} className="flex items-center justify-between gap-2 rounded border p-2 text-sm"><span className="truncate">{productByCode.get(code)?.productName ?? code}</span><Input className="h-8 w-20" type="number" min={1} value={quantity} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && next > 0) props.onUpdateConfirmedOrder(code, next); }} /><Button variant="ghost" size="sm" onClick={() => props.onRemoveConfirmedOrder(code)}>{props.label("smartLoading.remove", "Remove")}</Button></div>)}</div></CardContent></Card>
    </section>
    {editorOpen && <RouteEditorDialog session={props.session} label={props.label} query={customerQuery} searchResults={customerResults} exceptionalCustomers={draftExceptionalCustomers} selected={draftCustomerCodes} onQueryChange={setCustomerQuery} onToggleRoute={toggleRouteCustomer} onAddExceptional={addExceptional} onRemoveExceptional={removeExceptional} onClose={() => setEditorOpen(false)} onApply={applyCustomers} />}
  </>;
}

function ManagementStaleRouteProductPopover({ cases, referenceDate, onClose }: { cases: SmartLoadingManagementStaleRouteProduct[]; referenceDate: Date; onClose: () => void }) {
  const { locale, t } = useTranslation();
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const groups = useMemo(() => cases.reduce<Record<string, SmartLoadingManagementStaleRouteProduct[]>>((current, item) => {
    const category = item.category ?? t("smartLoading.uncategorized");
    (current[category] ??= []).push(item);
    return current;
  }, {}), [cases, t]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onClick={onClose}>
      <Card className="w-[min(92vw,520px)] shadow-xl" onClick={(event) => event.stopPropagation()}>
        <CardHeader className="flex-row items-center justify-between p-4"><CardTitle>{t("smartLoading.staleProductsPanelTitle")}</CardTitle><Button size="sm" variant="ghost" onClick={onClose}>{t("smartLoading.close")}</Button></CardHeader>
        <CardContent className="max-h-[60vh] overflow-y-auto p-4 pt-0 space-y-2">
          {Object.entries(groups).map(([category, items]) => {
            const open = openCategories.has(category);
            return <section key={category} className="rounded border"><button className="flex w-full items-center justify-between px-2 py-1.5 text-right text-xs font-semibold" onClick={() => setOpenCategories((current) => { const next = new Set(current); if (next.has(category)) next.delete(category); else next.add(category); return next; })} type="button"><span>{category} ({formatQuantity(items.length, locale)})</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} /></button>{open && <div className="max-h-56 overflow-y-auto border-t px-2">{items.map((item) => <div key={`${item.routeId}\u0000${item.productCode}`} className="grid grid-cols-[1fr_auto] gap-2 border-b py-1.5 text-xs last:border-0"><span className="min-w-0 truncate font-medium">{item.productName}<span className="block text-muted-foreground">{item.routeId}</span></span><span className="text-left text-muted-foreground">{t("smartLoading.vehicleStock")} {formatQuantity(item.currentVehicleStock, locale)} · {t("smartLoading.lastSale")} {formatGregorianDate(item.lastSaleDate) ?? "—"} · {daysSinceLastSale(item.lastSaleDate, referenceDate) ?? "—"} {t("smartLoading.staleDaysUnit")}</span></div>)}</div>}</section>;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function isManagementRole(roleCode: string | undefined) {
  return roleCode === "COMPANY_ADMIN" || roleCode === "MANAGER" || roleCode === "SUPERVISOR";
}

function ManagementHierarchyFilters({ locale, managementStockAlignmentPercent, managementStaleCount, onManagementStaleClick, onManagementScopeChange }: { locale: "ar" | "en"; managementStockAlignmentPercent: number | null; managementStaleCount: number; onManagementStaleClick: () => void; onManagementScopeChange: (scope: { managerId?: string; supervisorId?: string; salesRepId?: string }) => void }) {
  const [managerId, setManagerId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const { t } = useTranslation();
  const hierarchy = useQuery({ queryKey: ["smart-loading", "management-hierarchy", managerId, supervisorId], queryFn: () => smartLoadingApi.getHierarchyOptions(managerId || undefined, supervisorId || undefined), placeholderData: (previous) => previous });
  const tr = locale === "ar";
  const Select = ({ label, value, options, placeholder, onChange }: { label: string; value: string; options: { value: string; label: string }[]; placeholder: string; onChange: (value: string) => void }) => <label className="grid gap-1 text-xs text-muted-foreground"><span>{label}</span><select className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  return <Card dir={tr ? "rtl" : "ltr"} className="relative z-10 order-2 flex h-full min-h-0 flex-col lg:col-start-1 lg:row-start-1 lg:row-span-2"><CardHeader className="shrink-0 px-4 pb-2 pt-4"><CardTitle className="text-base">{tr ? "الطلبات المؤكدة المجمعة" : "Aggregated confirmed orders"}</CardTitle><CardDescription>{tr ? "حدد التسلسل الإداري للوصول إلى المندوب." : "Select the management hierarchy to reach a sales rep."}</CardDescription></CardHeader><CardContent className="space-y-4 p-4 pt-1"><div className="grid gap-2 sm:grid-cols-3"><Select label={tr ? "المدير" : "Manager"} value={managerId} options={hierarchy.data?.managers ?? []} placeholder={tr ? "كل المدراء" : "All managers"} onChange={(value) => { setManagerId(value); setSupervisorId(""); setSalesRepId(""); onManagementScopeChange({ managerId: value || undefined }); }} /><Select label={tr ? "المشرف" : "Supervisor"} value={supervisorId} options={hierarchy.data?.supervisors ?? []} placeholder={tr ? "كل المشرفين" : "All supervisors"} onChange={(value) => { setSupervisorId(value); setSalesRepId(""); onManagementScopeChange({ managerId: managerId || undefined, supervisorId: value || undefined }); }} /><Select label={tr ? "مندوب المبيعات" : "Sales Rep"} value={salesRepId} options={hierarchy.data?.salesReps ?? []} placeholder={tr ? "اختر مندوبًا" : "Select a sales rep"} onChange={(value) => { setSalesRepId(value); onManagementScopeChange({ managerId: managerId || undefined, supervisorId: supervisorId || undefined, salesRepId: value || undefined }); }} /></div>{managementStockAlignmentPercent !== null && <div dir="ltr" className="grid grid-cols-3 gap-2"><ManagementStockAlignmentMetric label={tr ? "توافق مخزون الإدارة" : "Management Stock Alignment"} value={managementStockAlignmentPercent} locale={locale} /><button type="button" onClick={onManagementStaleClick} className="h-24 rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-left shadow-none transition-colors hover:bg-secondary/60"><p className="text-[10px] text-muted-foreground">{t("smartLoading.managementStaleProducts")}</p><p className="mt-1 text-3xl font-semibold text-foreground">{formatQuantity(managementStaleCount, locale)}</p></button><Card aria-label="Reserved management KPI" className="h-24 border-dashed border-border/60 bg-background/30 shadow-none" /></div>}</CardContent></Card>;
}

function SessionMetric({ label, value }: { label: string; value: string }) { return <div><p className="truncate text-[11px] text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>; }

function RouteEditorDialog({ session, label, query, searchResults, exceptionalCustomers, selected, onQueryChange, onToggleRoute, onAddExceptional, onRemoveExceptional, onClose, onApply }: { session: Extract<SmartLoadingSession, { state: "ready" }>; label: (key: string, fallback: string) => string; query: string; searchResults: SmartLoadingRouteCustomer[]; exceptionalCustomers: SmartLoadingRouteCustomer[]; selected: Set<string>; onQueryChange: (value: string) => void; onToggleRoute: (code: string) => void; onAddExceptional: (customer: SmartLoadingRouteCustomer) => void; onRemoveExceptional: (code: string) => void; onClose: () => void; onApply: () => void; }) {
  const routeCustomers = session.routeCustomers;
  const visibleSearchResults = searchResults.filter((customer) => !routeCustomers.some((routeCustomer) => routeCustomer.customerCode === customer.customerCode) && !exceptionalCustomers.some((customerItem) => customerItem.customerCode === customer.customerCode));
  return <div role="dialog" aria-modal="true" aria-label={label("smartLoading.editRoute", "Edit route")} className="fixed inset-0 z-50 flex items-end bg-black/50 p-3 sm:items-center sm:justify-center"><Card className="max-h-[85vh] w-full max-w-2xl"><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>{label("smartLoading.editRoute", "Edit route")}</CardTitle><CardDescription>{label("smartLoading.selectedCustomers", "Selected customers")}: {selected.size}/{routeCustomers.length}{exceptionalCustomers.length > 0 ? ` · ${exceptionalCustomers.length} ${label("smartLoading.exceptionalCustomer", "Exceptionally added")}` : ""}</CardDescription></div><Button variant="ghost" onClick={onClose}>{label("smartLoading.close", "Close")}</Button></div></CardHeader><CardContent className="space-y-3"><Input aria-label={label("smartLoading.searchCustomers", "Search customers")} placeholder={label("smartLoading.searchCustomers", "Search customers")} value={query} onChange={(event) => onQueryChange(event.target.value)} />{query.trim() ? <div className="max-h-36 space-y-2 overflow-y-auto">{visibleSearchResults.length === 0 ? <p className="text-sm text-muted-foreground">{label("smartLoading.noCustomersFound", "No customers found")}</p> : visibleSearchResults.map((customer) => <div key={customer.customerCode} className="flex items-center justify-between gap-2 rounded border p-2 text-sm"><span className="min-w-0 truncate">{customer.customerName} <span className="text-muted-foreground">{customer.customerCode}</span></span><Button size="sm" variant="outline" onClick={() => onAddExceptional(customer)}>{label("smartLoading.add", "Add")}</Button></div>)}</div> : null}<div className="max-h-[38vh] space-y-2 overflow-y-auto"><p className="text-xs font-medium text-muted-foreground">{label("smartLoading.routeCustomers", "Route customers")}</p>{routeCustomers.map((customer) => <label key={customer.customerCode} className="flex min-h-11 items-center gap-3 rounded border p-2 text-sm"><input type="checkbox" checked={selected.has(customer.customerCode)} onChange={() => onToggleRoute(customer.customerCode)} /><span className="min-w-0 flex-1"><span className="block truncate">{customer.customerName}</span><span className="text-xs text-muted-foreground">{customer.customerCode}</span></span></label>)}{exceptionalCustomers.length > 0 && <><p className="pt-2 text-xs font-medium text-muted-foreground">{label("smartLoading.exceptionalCustomer", "Exceptionally added")}</p>{exceptionalCustomers.map((customer) => <div key={customer.customerCode} className="flex min-h-11 items-center gap-3 rounded border p-2 text-sm"><input type="checkbox" checked={selected.has(customer.customerCode)} onChange={() => onToggleRoute(customer.customerCode)} /><span className="min-w-0 flex-1"><span className="block truncate">{customer.customerName}</span><span className="text-xs text-muted-foreground">{customer.customerCode}</span></span><Button size="sm" variant="ghost" onClick={() => onRemoveExceptional(customer.customerCode)}>{label("smartLoading.remove", "Remove")}</Button></div>)}</>}</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{label("smartLoading.close", "Close")}</Button><Button onClick={onApply}>{label("smartLoading.applyAndClose", "Apply and close")}</Button></div></CardContent></Card></div>;
}
