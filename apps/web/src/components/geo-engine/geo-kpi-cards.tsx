"use client";

import { Card } from "@/components/ui/card";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

// Geo Intelligence Engine — Phase 3 KPI Cards row. Deliberately small (4
// cards, not DAS's 10) — Geo Engine already has exactly one selected KPI at
// a time (the KpiSelect in GeoFilterBar), so "the KPI cards" here means
// summarizing the CURRENT query result, not a fixed multi-metric dashboard.
// Every number comes straight off GeoQueryResult — zero new backend fields,
// zero re-derivation.
function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function KpiCard({ labelKey, value }: { labelKey: TranslationKey; value: number }) {
  const { t } = useTranslation();
  return (
    <Card className="glass-card rise-in flex flex-col gap-1 p-3">
      <span className="text-xs text-muted-foreground">{t(labelKey)}</span>
      <span className="text-xl font-semibold tracking-tight">{formatAmount(value)}</span>
    </Card>
  );
}

export function GeoKpiCards({
  totalValue,
  maxValue,
  pointsCount,
  excludedBadCoordinates,
}: {
  totalValue: number;
  maxValue: number;
  pointsCount: number;
  excludedBadCoordinates: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard labelKey="geoEngine.kpiCardTotal" value={totalValue} />
      <KpiCard labelKey="geoEngine.kpiCardMax" value={maxValue} />
      <KpiCard labelKey="geoEngine.kpiCardPoints" value={pointsCount} />
      <KpiCard labelKey="geoEngine.kpiCardExcluded" value={excludedBadCoordinates} />
    </div>
  );
}
