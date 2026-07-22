"use client";

import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";

// Geo Intelligence Engine — Phase 3 breadcrumb, for the client-approved
// "City -> Territory -> Customer -> Invoice" drill chain. Same visual
// pattern as territory-intelligence/page.tsx's own (non-exported)
// TerritoryBreadcrumb component, copied rather than imported (that one is a
// page-local function, not a shared export) — reuses its root label
// translation key directly ("territoryIntelligence.breadcrumbRoot") instead
// of adding a duplicate key.
//
// Deliberately has NO separate drillPath state of its own — both segments
// below are pure derivations of the SAME GeoFilters object already driving
// the map/KPIs/chart/table (cityValues[0] / customerCodes[0]), per the
// client's explicit "reuse the existing Global Analysis State, do not
// introduce duplicate state management" requirement. "City -> Territory" is
// one segment, not two: in this codebase's own established vocabulary a
// City IS a Territory (see decisionAnalyzeByDimensionSchema's
// `territory, // Customers.City` and territory-intelligence's whole
// city-boundary system) — clicking into a city's aggregate point already
// means "you're now inside that territory." "Invoice" is the Detail Table
// rendered below the map, always reflecting current scope — same
// established convention decision-analytics-studio's own drill chain uses
// for its final level (see chart's DRILL_CHAIN_NEXT comment).
export function GeoBreadcrumb({
  cityLabel,
  customerLabel,
  onGoRoot,
  onGoCity,
}: {
  cityLabel: string | null;
  customerLabel: string | null;
  onGoRoot: () => void;
  onGoCity: () => void;
}) {
  const { t } = useTranslation();
  const isRoot = !cityLabel;
  const isCity = Boolean(cityLabel) && !customerLabel;

  return (
    <div className="glass-card rise-in flex flex-wrap items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm">
      <button
        type="button"
        onClick={onGoRoot}
        className={cn("rounded px-1.5 py-0.5 transition-colors", isRoot ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
      >
        {t("territoryIntelligence.breadcrumbRoot")}
      </button>
      {cityLabel && (
        <span className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" />
          <button
            type="button"
            onClick={onGoCity}
            disabled={isCity}
            className={cn("rounded px-1.5 py-0.5 transition-colors", isCity ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {cityLabel}
          </button>
        </span>
      )}
      {customerLabel && (
        <span className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" />
          <span className="rounded px-1.5 py-0.5 font-medium text-foreground">{customerLabel}</span>
        </span>
      )}
    </div>
  );
}
