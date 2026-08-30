"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/components/translation-provider";
import { formatQuantity } from "@/lib/utils";
import type { SmartLoadingStaleProductPlan } from "@field-sales-os/schemas";

function formatPurchaseDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`)
    .toLocaleDateString("en-GB", { calendar: "gregory", day: "2-digit", month: "2-digit", year: "numeric" })
    .replaceAll("/", "-");
}

function staleDaysSince(lastSaleDate: string, targetDate: string): number {
  return Math.floor((Date.parse(`${targetDate}T00:00:00.000Z`) - Date.parse(`${lastSaleDate}T00:00:00.000Z`)) / 86_400_000);
}

function decisionScore(plan: SmartLoadingStaleProductPlan, targetDate: string, maximums: { stock: number; staleDays: number; customerCount: number }): number {
  return plan.currentVehicleStock / maximums.stock
    + staleDaysSince(plan.lastSaleDate, targetDate) / maximums.staleDays
    + plan.customers.length / maximums.customerCount;
}

type StaleInventoryTableProps = {
  plans: readonly SmartLoadingStaleProductPlan[];
  targetDate: string;
  onSelectProduct: (plan: SmartLoadingStaleProductPlan) => void;
  showBulkControls?: boolean;
};

export function StaleInventoryTable({ plans, targetDate, onSelectProduct, showBulkControls = false }: StaleInventoryTableProps) {
  const { locale, t } = useTranslation();
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
      .sort(([leftCategory, leftItems], [rightCategory, rightItems]) => (
        rightItems.reduce((total, plan) => total + plan.currentVehicleStock, 0)
        - leftItems.reduce((total, plan) => total + plan.currentVehicleStock, 0)
        || leftCategory.localeCompare(rightCategory, locale)
      ))
      .map(([category, items]) => {
        const maximums = {
          stock: Math.max(...items.map((plan) => plan.currentVehicleStock), 1),
          staleDays: Math.max(...items.map((plan) => staleDaysSince(plan.lastSaleDate, targetDate)), 1),
          customerCount: Math.max(...items.map((plan) => plan.customers.length), 1),
        };
        return {
          category,
          plans: [...items].sort((left, right) => (
            right.currentVehicleStock - left.currentVehicleStock
            || staleDaysSince(right.lastSaleDate, targetDate) - staleDaysSince(left.lastSaleDate, targetDate)
            || left.productName.localeCompare(right.productName, locale)
          )),
          decisionPlans: [...items].sort((left, right) => decisionScore(right, targetDate, maximums) - decisionScore(left, targetDate, maximums)),
        };
      });
  }, [locale, plans, t, targetDate]);

  if (plans.length === 0) {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">{t("smartLoading.noStaleProducts")}</p>;
  }

  return (
    <div className="space-y-3">
      {showBulkControls && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCollapsedCategories(new Set())}>
            {t("smartLoading.openAllSections")}
          </Button>
          <Button variant="outline" onClick={() => setCollapsedCategories(new Set(plansByCategory.map((group) => group.category)))}>
            {t("smartLoading.closeAllSections")}
          </Button>
        </div>
      )}
      {plansByCategory.map((group) => (
        <Card key={group.category} className="glass-card overflow-hidden">
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
              <section className="glow-ai rounded-lg p-3">
                <h2 className="font-semibold">{t("smartLoading.practicalDecision")}</h2>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {group.decisionPlans.map((plan) => (
                    <li key={plan.productCode}>
                      {plan.productName} · {t("smartLoading.vehicleStock")}: {formatQuantity(plan.currentVehicleStock, locale)} · {t("smartLoading.daysStale")}: {formatQuantity(staleDaysSince(plan.lastSaleDate, targetDate), locale)} · {t("smartLoading.customerEvidence", { count: formatQuantity(plan.customers.length, locale) })}
                    </li>
                  ))}
                </ol>
              </section>
              <div className="overflow-x-auto rounded-lg border border-border bg-background/30">
                <div className="grid min-w-[640px] grid-cols-[minmax(0,1fr)_10rem_8rem_10rem] gap-3 border-b border-border/60 bg-secondary/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>{t("smartLoading.productLabel")}</span>
                  <span>{t("smartLoading.vehicleStock")}</span>
                  <span>{t("smartLoading.daysStale")}</span>
                  <span>{t("smartLoading.lastSale")}</span>
                </div>
                {group.plans.map((plan) => (
                  <button
                    key={plan.productCode}
                    type="button"
                    className="grid min-w-[640px] w-full grid-cols-[minmax(0,1fr)_10rem_8rem_10rem] gap-3 px-4 py-3 text-start text-sm transition-colors hover:bg-secondary/50"
                    onClick={() => onSelectProduct(plan)}
                  >
                    <span className="font-medium">{plan.productName}</span>
                    <span>{formatQuantity(plan.currentVehicleStock, locale)}</span>
                    <span>{formatQuantity(staleDaysSince(plan.lastSaleDate, targetDate), locale)} {t("smartLoading.staleDaysUnit")}</span>
                    <span>{formatPurchaseDate(plan.lastSaleDate)}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

export function StaleDisposalPlan({ plan, targetDate, onBack }: { plan: SmartLoadingStaleProductPlan; targetDate: string; onBack: () => void }) {
  const { locale, t } = useTranslation();

  return (
    <Card className="glass-card overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{plan.productName}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("smartLoading.vehicleStock")}: {formatQuantity(plan.currentVehicleStock, locale)} · {t("smartLoading.daysStale")}: {formatQuantity(staleDaysSince(plan.lastSaleDate, targetDate), locale)} {t("smartLoading.staleDaysUnit")}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          {t("smartLoading.backToStaleInventory")}
        </Button>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
