"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleCheck } from "lucide-react";
import type { SmartLoadingManagementLoadingRiskPerson } from "@field-sales-os/schemas";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/components/translation-provider";
import { formatQuantity } from "@/lib/utils";

type ManagementLoadingRiskProps = {
  targetDate: string;
  onSelectPerson: (person: SmartLoadingManagementLoadingRiskPerson) => void;
};

export function ManagementLoadingRisk({ targetDate, onSelectPerson }: ManagementLoadingRiskProps) {
  const { locale, t } = useTranslation();
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const query = useQuery({
    queryKey: ["smart-loading", "management-risks", "loading", targetDate],
    queryFn: () => smartLoadingApi.getManagementLoadingRisk(targetDate),
    staleTime: 60_000,
  });
  // The API already returns a small management-only result. Ordering it by
  // affected products, then routes, surfaces the largest operational risk
  // without changing the risk calculation or requesting extra data.
  const people = [...(query.data?.people ?? [])].sort((left, right) =>
    right.affectedProductCount - left.affectedProductCount
    || right.affectedRouteCount - left.affectedRouteCount
    || left.employeeName.localeCompare(right.employeeName),
  );
  const affectedPersonCount = query.data?.affectedPersonCount ?? 0;

  if (query.isLoading) {
    return <Skeleton className="h-40 w-full max-w-sm" />;
  }

  if (query.isError) {
    return (
      <Card className="glass-card max-w-sm border-destructive/30 bg-destructive/10">
        <CardContent className="p-4 text-sm text-destructive">
          {t("smartLoading.loadingRiskLoadError")}
        </CardContent>
      </Card>
    );
  }

  if (people.length === 0) {
    return (
      <Card className="glass-card max-w-sm border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex min-h-36 items-center gap-2 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck className="h-5 w-5 shrink-0" />
          {t("smartLoading.noLoadingRisk")}
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      aria-labelledby="management-loading-risk-title"
      className="group relative w-full max-w-sm self-start"
      onMouseEnter={() => setPopoverOpen(true)}
      onMouseLeave={() => setPopoverOpen(false)}
    >
      <div id="management-loading-risk-title">
        <KpiCard
          icon={AlertTriangle}
          label={t("smartLoading.loadingRisk")}
          value={formatQuantity(affectedPersonCount, locale)}
          caption={t("smartLoading.peopleNeedAttention")}
          glow="warning"
        />
      </div>

      {isPopoverOpen && (
        <Card className="glass-card absolute start-0 top-[calc(100%-0.25rem)] z-30 w-72">
          <CardContent className="p-3">
            <p className="mb-2 text-sm font-semibold">{t("smartLoading.loadingRisk")}</p>
            <div className="space-y-1">
              {people.slice(0, 4).map((person) => (
                <button
                  key={person.employeeId}
                  type="button"
                  className="block w-full truncate rounded px-2 py-1.5 text-start text-sm hover:bg-muted focus-visible:bg-muted"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPopoverOpen(false);
                    onSelectPerson(person);
                  }}
                >
                  {person.employeeName}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
