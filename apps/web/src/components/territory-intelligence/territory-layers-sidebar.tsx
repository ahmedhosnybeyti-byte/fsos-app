"use client";

// Analysis Layers sidebar — two independent controls stacked in one panel:
//
// 1. Map Type (2026-07-29 addition): which of the 3 requested rendering
//    modes — حرارية/Heat, عنقودية/Cluster, فقاعة/Bubble — the map uses to
//    DRAW the current nodes. This replaced the old assumption that "layer"
//    meant a map-type picker; it never was one (see below), so this is a
//    genuinely new control, not a relabeling of the existing 7 buttons.
//    Choropleth (the original filled-polygon rendering) is still what the
//    map defaults to and is not exposed as a 4th button here — it stays the
//    baseline "no special mode selected" behavior website-wide, consistent
//    with every other screen's map defaulting to its most information-dense
//    view.
//
// 2. Metric (original "طبقات التحليل" content, kept and renamed only in
//    section heading): numbered layer cards, an icon + label per layer, an
//    "Active" badge on whichever metric is currently driving color/size in
//    ANY display mode (choropleth's tier fill, or heat/cluster/bubble's
//    intensity), instant one-click switching. This is unchanged in meaning
//    from the pre-2026-07-29 sidebar — it answers "which KPI is the map
//    about," not "how does the map look." Kept because Territory
//    Intelligence's Executive Insight / ranking / decision panel all still
//    read off this same activeMetric; removing it would silently break
//    those, which the user did not ask for.
//
// A persistent health-score color legend stays pinned at the bottom for both
// controls (same 5-tier color family colors both the choropleth fill and the
// heat/cluster/bubble intensity gradient's high end).

import { HeartPulse, TrendingUp, TrendingDown, Footprints, Wallet, Sparkles, ShieldAlert, Flame, CircleDot, Layers, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { TERRITORY_TIER_COLOR, type TerritoryMapDisplayMode, type TerritoryMapMetric } from "./territory-map";

export interface TerritoryLayersSidebarProps {
  activeMetric: TerritoryMapMetric;
  onSelectMetric: (metric: TerritoryMapMetric) => void;
  displayMode: TerritoryMapDisplayMode;
  onSelectDisplayMode: (mode: TerritoryMapDisplayMode) => void;
}

const DISPLAY_MODE_ITEMS: { mode: TerritoryMapDisplayMode; labelKey: TranslationKey; icon: LucideIcon }[] = [
  { mode: "heat", labelKey: "territoryIntelligence.displayModeHeat", icon: Flame },
  { mode: "cluster", labelKey: "territoryIntelligence.displayModeCluster", icon: Layers },
  { mode: "bubble", labelKey: "territoryIntelligence.displayModeBubble", icon: CircleDot },
];

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

export function TerritoryLayersSidebar({ activeMetric, onSelectMetric, displayMode, onSelectDisplayMode }: TerritoryLayersSidebarProps) {
  const { t } = useTranslation();

  return (
    <Card className="glass-card rise-in h-fit">
      <CardHeader>
        <CardTitle>{t("territoryIntelligence.layersPanelTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("territoryIntelligence.displayModeSectionTitle")}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {DISPLAY_MODE_ITEMS.map((item) => {
            const isActive = item.mode === displayMode;
            const Icon = item.icon;
            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => onSelectDisplayMode(isActive ? "choropleth" : item.mode)}
                aria-pressed={isActive}
                title={t(item.labelKey)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[11px] font-medium transition-colors",
                  isActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary/30",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>

        <p className="pt-2 text-xs font-medium text-muted-foreground">{t("territoryIntelligence.metricSectionTitle")}</p>
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
