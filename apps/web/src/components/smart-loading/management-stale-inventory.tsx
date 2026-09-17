"use client";

import { AlertTriangle, CircleCheck } from "lucide-react";
import type { SmartLoadingManagementStaleRouteProduct } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/dashboard/kpi-card";
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
      <Card className="glass-card h-full min-h-36 w-full border-success/20 bg-success/5">
        <CardContent className="flex min-h-36 items-center gap-2 p-4 text-sm text-success">
          <CircleCheck className="h-5 w-5 shrink-0" />
          {t("smartLoading.noStaleInventory")}
        </CardContent>
      </Card>
    );
  }

  return (
    <section
      aria-labelledby="management-stale-inventory-title"
      className="group w-full min-w-0"
    >
      <div id="management-stale-inventory-title" className="relative min-h-36">
        <KpiCard
          icon={AlertTriangle}
          label={t("smartLoading.staleInventory")}
          value={formatQuantity(people.length, locale)}
          caption={t("smartLoading.peopleNeedAttention")}
          glow="warning"
        />
        <Card className="glass-card invisible absolute start-0 top-full z-30 -mt-1 w-72 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <CardContent className="p-3">
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
        </CardContent>
        </Card>
      </div>
    </section>
  );
}
