"use client";

import { AlertTriangle, CircleCheck } from "lucide-react";
import type { SmartLoadingManagementStaleRouteProduct } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/components/translation-provider";
import { formatQuantity } from "@/lib/utils";

type ManagementStaleInventoryProps = {
  cases: readonly SmartLoadingManagementStaleRouteProduct[];
  onSelectPerson: (person: { employeeId: string; employeeName: string }) => void;
};

export function ManagementStaleInventory({ cases, onSelectPerson }: ManagementStaleInventoryProps) {
  const { locale, t } = useTranslation();
  const peopleById = new Map<string, { employeeId: string; employeeName: string; affectedRouteIds: Set<string> }>();

  for (const item of cases) {
    const person = peopleById.get(item.responsibleEmployeeId) ?? {
      employeeId: item.responsibleEmployeeId,
      employeeName: item.responsibleEmployeeName,
      affectedRouteIds: new Set<string>(),
    };
    person.affectedRouteIds.add(item.routeId);
    peopleById.set(person.employeeId, person);
  }

  const people = [...peopleById.values()].sort((left, right) =>
    right.affectedRouteIds.size - left.affectedRouteIds.size
    || left.employeeName.localeCompare(right.employeeName),
  );

  if (people.length === 0) {
    return (
      <Card className="max-w-sm border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex min-h-36 items-center gap-2 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          <CircleCheck className="h-5 w-5 shrink-0" />
          {t("smartLoading.noStaleInventory")}
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      aria-labelledby="management-stale-inventory-title"
      className="group relative w-full max-w-sm"
    >
      <Card className="glass-card rise-in h-40 border-amber-500/20 transition-colors group-hover:border-amber-500/45 group-focus-visible:border-amber-500/45">
        <CardContent className="flex h-full flex-col justify-between p-4">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" />
            <h2 id="management-stale-inventory-title" className="text-sm font-semibold tracking-tight">
              {t("smartLoading.staleInventory")}
            </h2>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {formatQuantity(people.length, locale)} {t("smartLoading.peopleNeedAttention")}
          </p>
        </CardContent>
      </Card>

      <div className="invisible absolute start-0 top-full z-30 mt-2 w-72 rounded-lg border bg-popover p-3 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <p className="mb-2 text-sm font-semibold">{t("smartLoading.staleInventory")}</p>
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
      </div>
    </section>
  );
}
