"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { DecisionKpiSummary } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

// The 10-KPI header row from the spec (Sales, Growth, Coverage, Orders,
// Collections, Strike Rate, Active Customers, Lost Sales, Average Order,
// Productivity) — one card per KPI, each rendered directly from
// DecisionKpiSummary with no client-side re-derivation. Null is always
// rendered as "—" (never a fabricated 0), matching the honesty convention
// documented on every nullable field in decision-analytics-studio.schemas.ts.

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

interface KpiDef {
  key: keyof DecisionKpiSummary;
  labelKey: TranslationKey;
  kind: "amount" | "count" | "pct" | "growthPct";
}

const KPI_DEFS: KpiDef[] = [
  { key: "sales", labelKey: "decisionAnalyticsStudio.kpiSales", kind: "amount" },
  { key: "salesGrowthPct", labelKey: "decisionAnalyticsStudio.kpiGrowth", kind: "growthPct" },
  { key: "coveragePct", labelKey: "decisionAnalyticsStudio.kpiCoverage", kind: "pct" },
  { key: "ordersCount", labelKey: "decisionAnalyticsStudio.kpiOrders", kind: "count" },
  { key: "collections", labelKey: "decisionAnalyticsStudio.kpiCollections", kind: "amount" },
  { key: "strikeRatePct", labelKey: "decisionAnalyticsStudio.kpiStrikeRate", kind: "pct" },
  { key: "activeCustomersCount", labelKey: "decisionAnalyticsStudio.kpiActiveCustomers", kind: "count" },
  { key: "lostSalesValue", labelKey: "decisionAnalyticsStudio.kpiLostSales", kind: "amount" },
  { key: "averageOrderValue", labelKey: "decisionAnalyticsStudio.kpiAverageOrder", kind: "amount" },
  { key: "productivity", labelKey: "decisionAnalyticsStudio.kpiProductivity", kind: "amount" },
];

function KpiCard({ def, value }: { def: KpiDef; value: number | null }) {
  const { t } = useTranslation();

  let display: React.ReactNode;
  if (value === null) {
    display = <span className="text-muted-foreground">—</span>;
  } else if (def.kind === "growthPct") {
    const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
    display = (
      <span className={cn("flex items-center gap-1", value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground")}>
        <Icon className="h-4 w-4" />
        {formatPct(value)}
      </span>
    );
  } else if (def.kind === "pct") {
    display = `${value.toFixed(1)}%`;
  } else if (def.kind === "count") {
    display = formatAmount(value);
  } else {
    display = formatAmount(value);
  }

  return (
    <Card className="glass-card rise-in flex flex-col gap-1 p-3">
      <span className="text-xs text-muted-foreground">{t(def.labelKey)}</span>
      <span className="text-xl font-semibold tracking-tight">{display}</span>
    </Card>
  );
}

export function KpiCards({ kpis }: { kpis: DecisionKpiSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {KPI_DEFS.map((def) => (
        <KpiCard key={def.key} def={def} value={kpis[def.key]} />
      ))}
    </div>
  );
}
