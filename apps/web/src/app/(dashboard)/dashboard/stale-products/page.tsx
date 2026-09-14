"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StaleDisposalPlan, StaleInventoryTable } from "@/components/smart-loading/stale-inventory-workflow";
import { useTranslation } from "@/components/translation-provider";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { DEFAULT_SMART_LOADING_STALE_DAYS } from "@field-sales-os/schemas";

export default function StaleProductsPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const targetDate = searchParams.get("targetDate") ?? undefined;
  const salesRepId = searchParams.get("salesRepId")?.trim() || undefined;
  const requestedThreshold = Number(searchParams.get("staleDaysThreshold"));
  const staleDaysThreshold = Number.isInteger(requestedThreshold) && requestedThreshold > 0
    ? requestedThreshold
    : DEFAULT_SMART_LOADING_STALE_DAYS;
  const session = useQuery({
    queryKey: ["smart-loading", "stale-products", targetDate, staleDaysThreshold, salesRepId],
    queryFn: () => smartLoadingApi.getSession(targetDate, staleDaysThreshold, salesRepId),
  });
  const plans = session.data?.state === "ready" ? session.data.staleProductPlans : [];
  const operationalTargetDate = session.data?.state === "ready" ? session.data.targetDate : targetDate;
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const selectedPlan = plans.find((plan) => plan.productCode === selectedProductCode) ?? null;

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("smartLoading.staleProductsPlanTitle")}
      </h1>
      <Button asChild variant="outline">
        <Link href="/dashboard/smart-loading">
          {t("smartLoading.backToSmartLoading")}
        </Link>
      </Button>
      {session.isLoading && <p className="text-sm text-muted-foreground">{t("smartLoading.staleProductsLoading")}</p>}
      {session.isError && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{t("smartLoading.staleProductsError")}</p>}
      {!session.isLoading && !session.isError && operationalTargetDate && (
        selectedPlan ? (
          <StaleDisposalPlan
            plan={selectedPlan}
            targetDate={operationalTargetDate}
            onBack={() => setSelectedProductCode(null)}
          />
        ) : (
          <StaleInventoryTable
            plans={plans}
            targetDate={operationalTargetDate}
            onSelectProduct={(plan) => setSelectedProductCode(plan.productCode)}
            showBulkControls
          />
        )
      )}
    </main>
  );
}
