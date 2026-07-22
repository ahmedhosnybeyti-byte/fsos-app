"use client";

// Analysis Layers sidebar — client mockup: numbered layer cards, an icon +
// label per layer, an "Active" badge on whichever layer is currently driving
// the map's fill color, instant one-click switching, and a persistent
// health-score color legend pinned at the bottom. Purely a restyle/selector
// UI over TerritoryMapMetric — no new data, no new i18n keys (translation
// keys for all 7 layers already existed pre-redesign as
// territoryIntelligence.metric*).

import { HeartPulse, TrendingUp, TrendingDown, Footprints, Wallet, Sparkles, ShieldAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { TERRITORY_TIER_COLOR, type TerritoryMapMetric } from "./territory-map";

export interface TerritoryLayersSidebarProps {
  activeMetric: TerritoryMapMetric;
  onSelectMetric: (metric: TerritoryMapMetric) => void;
}

// Small local helper/constant, deliberately duplicated per-module rather
// than imported from the old page.tsx's non-exported METRIC_LABEL_KEY — same
// isolation convention this codebase already uses (see sgi.service.ts /
// heatmap.service.ts comments). Order here is the client mockup's numbered
// order and covers all 7 TerritoryMapMetric members exactly.
const LAYER_ITEMS: { metric: TerritoryMapMetric; labelKey: TranslationKey; icon: LucideIcon }[] = [
  { metric: "healthScore", labelKey: "territoryIntelligence.metricHealthScore", icon: HeartPulse },
  { metric: "salesGrowthPct", labelKey: "territoryIntelligence.metricSalesGrowth", icon: TrendingUp },
  { metric: "lostSalesCount", labelKey: "territoryIntelligence.metricLostSales", icon: TrendingDown },
  { metric: "visitCoveragePct", labelKey: "territoryIntelligence.metricVisitCoverage", icon: Footprints },
  { metric: "collectionHealthPct", labelKey: "territoryIntelligence.metricCollectionHealth", icon: Wallet },
  { metric: "opportunityValueSar", labelKey: "territoryIntelligence.metricOpportunityValue", icon: Sparkles },
  { metric: "riskLevel", labelKey: "territoryIntelligence.metricRiskLevel", icon: ShieldAlert },
];

// Legend order + label keys — same tiers/colors as TERRITORY_TIER_COLOR,
// duplicated locally (not imported) since the old page.tsx's TIER_LABEL_KEY
// isn't exported.
const TIER_LEGEND: { tier: string; labelKey: TranslationKey }[] = [
  { tier: "excellent", labelKey: "territoryIntelligence.tierExcellent" },
  { tier: "good", labelKey: "territoryIntelligence.tierGood" },
  { tier: "average", labelKey: "territoryIntelligence.tierAverage" },
  { tier: "weak", labelKey: "territoryIntelligence.tierWeak" },
  { tier: "veryWeak", labelKey: "territoryIntelligence.tierVeryWeak" },
];

export function TerritoryLayersSidebar({ activeMetric, onSelectMetric }: TerritoryLayersSidebarProps) {
  const { t } = useTranslation();

  return (
    <Card className="glass-card rise-in h-fit">
      <CardHeader>
        <CardTitle>{t("territoryIntelligence.layersPanelTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {LAYER_ITEMS.map((item, index) => {
          const isActive = item.metric === activeMetric;
          const Icon = item.icon;
          return (
            <button
              key={item.metric}
              type="button"
              onClick={() => onSelectMetric(item.metric)}
              aria-pressed={isActive}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-start text-sm transition-colors",
                isActive ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/30",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("min-w-0 flex-1 truncate font-medium", isActive ? "text-primary" : "text-foreground")}>
                {t(item.labelKey)}
              </span>
              {isActive && <Badge variant="default">{t("territoryIntelligence.layerActiveBadge")}</Badge>}
            </button>
          );
        })}

        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("territoryIntelligence.metricHealthScore")}</p>
          <div className="space-y-1">
            {TIER_LEGEND.map((entry) => (
              <div key={entry.tier} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: TERRITORY_TIER_COLOR[entry.tier] }} />
                <span className="text-muted-foreground">{t(entry.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
