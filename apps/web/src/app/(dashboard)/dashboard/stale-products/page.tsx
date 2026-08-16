"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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

function decisionScore(plan: SmartLoadingStaleProductPlan, targetDate: string, maximums: { stock: number; staleDays: number; customerCount: number }): number {
  const stock = plan.currentVehicleStock / maximums.stock;
  const staleDays = staleDaysSince(plan.lastSaleDate, targetDate) / maximums.staleDays;
  const customerEvidence = plan.customers.length / maximums.customerCount;
  return stock + staleDays + customerEvidence;
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
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
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
        decisionPlans: (() => {
          const maximums = {
            stock: Math.max(...items.map((plan) => plan.currentVehicleStock), 1),
            staleDays: Math.max(...items.map((plan) => staleDaysSince(plan.lastSaleDate, operationalTargetDate!)), 1),
            customerCount: Math.max(...items.map((plan) => plan.customers.length), 1),
          };
          // Equal normalization keeps stock, recency, and real customer
          // evidence comparable without changing the backend ranking.
          return [...items].sort((left, right) => decisionScore(right, operationalTargetDate!, maximums) - decisionScore(left, operationalTargetDate!, maximums));
        })(),
      }));
  }, [locale, operationalTargetDate, plans, t]);

  function openAllCategories() {
    setCollapsedCategories(new Set());
  }

  function closeAllCategories() {
    setCollapsedCategories(new Set(plansByCategory.map((group) => group.category)));
  }

  function toggleProduct(productCode: string) {
    setSelectedProductCode((current) => current === productCode ? null : productCode);
  }

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("smartLoading.staleProductsPlanTitle")}
      </h1>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard/smart-loading">
            {t("smartLoading.backToSmartLoading")}
          </Link>
        </Button>
        <Button variant="outline" onClick={openAllCategories}>
          {t("smartLoading.openAllSections")}
        </Button>
        <Button variant="outline" onClick={closeAllCategories}>
          {t("smartLoading.closeAllSections")}
        </Button>
      </div>

      {session.isLoading && <p className="text-sm text-muted-foreground">{t("smartLoading.staleProductsLoading")}</p>}
      {session.isError && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{t("smartLoading.staleProductsError")}</p>}
      {!session.isLoading && !session.isError && plans.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">{t("smartLoading.noStaleProducts")}</p>}

      {plansByCategory.map((group) => (
        <Card key={group.category}>
          <CardHeader>
            <button
              type="button"
              className="flex w-full items-center justify-between text-start"
              aria-expanded={!collapsedCategories.has(group.category)}
              onClick={() => setCollapsedCategories((current) => {
                const next = new Set(current);
                if (next.has(group.category)) next.delete(group.category);
                else next.add(group.category);
                return next;
              })}
            >
              <CardTitle>{group.category}</CardTitle>
              <span className="text-sm text-muted-foreground">{formatQuantity(group.plans.length, locale)}</span>
            </button>
          </CardHeader>
          {!collapsedCategories.has(group.category) && (
            <CardContent className="space-y-4">
              <section className="rounded-md border bg-secondary/30 p-3">
                <h2 className="font-semibold">{t("smartLoading.practicalDecision")}</h2>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {group.decisionPlans.map((plan) => (
                    <li key={plan.productCode}>
                      {plan.productName} · {t("smartLoading.vehicleStock")}: {formatQuantity(plan.currentVehicleStock, locale)} · {t("smartLoading.daysStale")}: {formatQuantity(staleDaysSince(plan.lastSaleDate, operationalTargetDate!), locale)} · {t("smartLoading.customerEvidence", { count: formatQuantity(plan.customers.length, locale) })}
                    </li>
                  ))}
                </ol>
              </section>

              <div className="overflow-x-auto rounded-md border">
                <div className="grid min-w-[640px] grid-cols-[minmax(0,1fr)_10rem_8rem_10rem] gap-3 border-b bg-secondary/50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>{t("smartLoading.productLabel")}</span>
                  <span>{t("smartLoading.vehicleStock")}</span>
                  <span>{t("smartLoading.daysStale")}</span>
                  <span>{t("smartLoading.lastSale")}</span>
                </div>
                {group.plans.map((plan) => {
                  const selected = selectedProductCode === plan.productCode;
                  return (
                    <article key={plan.productCode}>
                      <button
                        type="button"
                        className={`grid min-w-[640px] w-full grid-cols-[minmax(0,1fr)_10rem_8rem_10rem] gap-3 px-4 py-3 text-start text-sm transition-colors hover:bg-secondary/50 ${selected ? "bg-secondary" : ""}`}
                        aria-expanded={selected}
                        onClick={() => toggleProduct(plan.productCode)}
                      >
                        <span className="font-medium">{plan.productName}</span>
                        <span>{formatQuantity(plan.currentVehicleStock, locale)}</span>
                        <span>{formatQuantity(staleDaysSince(plan.lastSaleDate, operationalTargetDate!), locale)} {t("smartLoading.staleDaysUnit")}</span>
                        <span>{formatPurchaseDate(plan.lastSaleDate)}</span>
                      </button>
                      {selected && (
                        <div className="border-t bg-background p-3">
                          {plan.customers.length === 0 ? (
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
                                {plan.customers.map((customer) => (
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
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </main>
  );
}
