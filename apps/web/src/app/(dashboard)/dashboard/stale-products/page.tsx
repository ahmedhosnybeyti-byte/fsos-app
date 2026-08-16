"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/components/translation-provider";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { formatQuantity } from "@/lib/utils";
import { DEFAULT_SMART_LOADING_STALE_DAYS, type SmartLoadingStaleProductPlan } from "@field-sales-os/schemas";

function formatPurchaseDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`)
    .toLocaleDateString("en-GB", { calendar: "gregory", day: "2-digit", month: "2-digit", year: "numeric" })
    .replaceAll("/", "-");
}

function staleDaysSince(lastSaleDate: string, targetDate: string): number {
  return Math.floor((Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${lastSaleDate}T00:00:00.000Z`)) / 86_400_000);
}

export default function StaleProductsPage() {
  const { locale, t } = useTranslation();
  const searchParams = useSearchParams();
  const targetDate = searchParams.get("targetDate") ?? undefined;
  const requestedThreshold = Number(searchParams.get("staleDaysThreshold"));
  const staleDaysThreshold = Number.isInteger(requestedThreshold) && requestedThreshold > 0
    ? requestedThreshold
    : DEFAULT_SMART_LOADING_STALE_DAYS;
  const session = useQuery({
    queryKey: ["smart-loading", "stale-products", targetDate, staleDaysThreshold],
    queryFn: () => smartLoadingApi.getSession(targetDate, staleDaysThreshold),
  });
  const plans = session.data?.state === "ready" ? session.data.staleProductPlans : [];
  const operationalTargetDate = session.data?.state === "ready" ? session.data.targetDate : targetDate;
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const plansByCategory = useMemo(() => {
    const groups = new Map<string, SmartLoadingStaleProductPlan[]>();
    for (const plan of plans) {
      const category = plan.category || t("smartLoading.uncategorized");
      const items = groups.get(category) ?? [];
      items.push(plan);
      groups.set(category, items);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right, locale))
      .map(([category, items]) => ({
        category,
        plans: items.sort((left, right) => left.productName.localeCompare(right.productName, locale)),
      }));
  }, [locale, plans, t]);
  const selectedPlan = plans.find((plan) => plan.productCode === selectedProductCode) ?? null;

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("smartLoading.staleProductsPlanTitle")}
      </h1>

      {session.isLoading && <p className="text-sm text-muted-foreground">{t("smartLoading.staleProductsLoading")}</p>}
      {session.isError && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{t("smartLoading.staleProductsError")}</p>}
      {!session.isLoading && !session.isError && plans.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">{t("smartLoading.noStaleProducts")}</p>}

      {plansByCategory.map((group) => (
        <Card key={group.category}>
          <CardHeader>
            <CardTitle>{group.category}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {group.plans.map((plan) => (
              <button
                key={plan.productCode}
                type="button"
                className={`min-w-56 rounded-md border p-3 text-start text-sm transition-colors hover:bg-secondary ${selectedPlan?.productCode === plan.productCode ? "border-primary bg-secondary" : ""}`}
                aria-pressed={selectedPlan?.productCode === plan.productCode}
                onClick={() => setSelectedProductCode(plan.productCode)}
              >
                <p className="font-medium">{plan.productName}</p>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                  <p>{t("smartLoading.vehicleStock")}: {formatQuantity(plan.currentVehicleStock, locale)}</p>
                  <p>{t("smartLoading.daysStale")}: {formatQuantity(staleDaysSince(plan.lastSaleDate, operationalTargetDate!), locale)} {t("smartLoading.staleDaysUnit")}</p>
                  <p>{t("smartLoading.lastSale")}: {formatPurchaseDate(plan.lastSaleDate)}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      ))}

      {plans.length > 0 && !selectedPlan && <p className="text-sm text-muted-foreground">{t("smartLoading.selectStaleProduct")}</p>}

      {selectedPlan && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedPlan.productName}</CardTitle>
            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <p>{t("smartLoading.vehicleStock")}: <span className="font-medium text-foreground">{formatQuantity(selectedPlan.currentVehicleStock, locale)}</span></p>
              <p>{t("smartLoading.daysStale")}: <span className="font-medium text-foreground">{formatQuantity(staleDaysSince(selectedPlan.lastSaleDate, operationalTargetDate!), locale)} {t("smartLoading.staleDaysUnit")}</span></p>
              <p>{t("smartLoading.lastSale")}: <span className="font-medium text-foreground">{formatPurchaseDate(selectedPlan.lastSaleDate)}</span></p>
            </div>
          </CardHeader>
          <CardContent>
            {selectedPlan.customers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("smartLoading.noPurchasingCustomers")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("smartLoading.customer")}</TableHead>
                    <TableHead>{t("smartLoading.totalPurchasedQuantity")}</TableHead>
                    <TableHead>{t("smartLoading.purchaseFrequency")}</TableHead>
                    <TableHead>{t("smartLoading.lastPurchaseDate")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPlan.customers.map((customer) => (
                    <TableRow key={customer.customerCode}>
                      <TableCell>{customer.customerName}</TableCell>
                      <TableCell>{formatQuantity(customer.totalQuantity, locale)}</TableCell>
                      <TableCell>{formatQuantity(customer.purchaseFrequency, locale)}</TableCell>
                      <TableCell>{formatPurchaseDate(customer.lastPurchaseDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
