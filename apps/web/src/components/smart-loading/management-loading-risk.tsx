"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleCheck } from "lucide-react";
import type { SmartLoadingManagementLoadingRiskPerson } from "@field-sales-os/schemas";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/components/translation-provider";
import { formatQuantity } from "@/lib/utils";

type ManagementLoadingRiskProps = {
  targetDate: string;
  onSelectPerson: (person: SmartLoadingManagementLoadingRiskPerson) => void;
  onViewAll: () => void;
};

export function ManagementLoadingRisk({ targetDate, onSelectPerson, onViewAll }: ManagementLoadingRiskProps) {
  const { locale, t } = useTranslation();
  const query = useQuery({
    queryKey: ["smart-loading", "management-risks", "loading", targetDate],
    queryFn: () => smartLoadingApi.getManagementLoadingRisk(targetDate),
    staleTime: 60_000,
  });
  const people = query.data?.people ?? [];
  const affectedPersonCount = query.data?.affectedPersonCount ?? 0;

  if (query.isLoading) {
    return <Skeleton className="h-40 w-full max-w-sm" />;
  }

  if (query.isError) {
    return (
      <Card className="max-w-sm border-destructive/30 bg-destructive/10">
        <CardContent className="p-4 text-sm text-destructive">
          {t("smartLoading.loadingRiskLoadError")}
        </CardContent>
      </Card>
    );
  }

  if (people.length === 0) {
    return (
      <Card className="max-w-sm border-emerald-500/20 bg-emerald-500/5">
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
      className="group relative w-full max-w-sm cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={onViewAll}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onViewAll();
        }
      }}
    >
      <Card className="glass-card rise-in h-40 border-amber-500/20 transition-colors group-hover:border-amber-500/45 group-focus-visible:border-amber-500/45">
        <CardContent className="flex h-full flex-col justify-between p-4">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
            <h2 id="management-loading-risk-title" className="text-sm font-semibold tracking-tight">
              {t("smartLoading.loadingRisk")}
            </h2>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {formatQuantity(affectedPersonCount, locale)} {t("smartLoading.peopleNeedAttention")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={(event) => {
              event.stopPropagation();
              onViewAll();
            }}
          >
            {t("smartLoading.viewRisks")}
          </Button>
        </CardContent>
      </Card>

      <div className="invisible absolute start-0 top-full z-30 mt-2 w-72 translate-y-1 rounded-lg border bg-popover p-3 opacity-0 shadow-lg transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <p className="mb-2 text-sm font-semibold">{t("smartLoading.loadingRisk")}</p>
        <div className="space-y-1">
          {people.slice(0, 4).map((person) => (
            <button
              key={person.employeeId}
              type="button"
              className="block w-full truncate rounded px-2 py-1.5 text-start text-sm hover:bg-muted focus-visible:bg-muted"
              onClick={(event) => {
                event.stopPropagation();
                onSelectPerson(person);
              }}
            >
              {person.employeeName}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start"
          onClick={(event) => {
            event.stopPropagation();
            onViewAll();
          }}
        >
          {t("smartLoading.viewAll")}
        </Button>
      </div>
    </section>
  );
}
