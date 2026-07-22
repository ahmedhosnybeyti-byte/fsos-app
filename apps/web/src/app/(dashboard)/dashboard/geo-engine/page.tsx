"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe2, Info } from "lucide-react";
import { geoEngineApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { GeoFilterBar } from "@/components/geo-engine/geo-filter-bar";
import { GeoMapCanvas, type GeoMapCanvasHandle } from "@/components/geo-engine/geo-map-canvas";
import { HeatMapMode } from "@/components/geo-engine/modes/heat-map-mode";
import { BubbleMapMode } from "@/components/geo-engine/modes/bubble-map-mode";
import { ClusterMapMode } from "@/components/geo-engine/modes/cluster-map-mode";
import { TerritoryMapMode } from "@/components/geo-engine/modes/territory-map-mode";
import { GeoBreadcrumb } from "@/components/geo-engine/geo-breadcrumb";
import { GeoKpiCards } from "@/components/geo-engine/geo-kpi-cards";
import { GeoChart } from "@/components/geo-engine/geo-chart";
import { GeoDetailTable } from "@/components/geo-engine/geo-detail-table";
import { ExecutiveTools } from "@/components/geo-engine/executive-tools";
import { AiInsightPanel } from "@/components/decision-analytics-studio/ai-insight-panel";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { GeoFilters, GeoGroupBy, GeoKpi, GeoPoint } from "@/lib/types";

// Geo Intelligence Engine (Executive Map Redesign Spec, client-approved
// 3-phase plan). Phase 1 (engine + unified filters) and Phase 2 (Heat/
// Bubble/Cluster/Territory map modes) both shipped and were validated by the
// client directly in this screen. This is now Phase 3 (approved 2026-07-22,
// "one integrated implementation"): Drill Down (City -> Territory ->
// Customer -> Invoice), Cross Filtering across the whole workspace, an AI
// Insight Panel reusing the existing SGI service, and Executive tools
// (Fullscreen / Reset View / Export Image / Export PDF).
//
// Global Analysis State: everything the workspace reads from and writes to
// lives in ONE `state` object below (filters + kpi + groupBy + mode) — same
// architectural pattern Decision Analytics Studio already established
// (state.analyzeBy + state.filters there; see that page's own comment) per
// the client's explicit "reuse the existing Global Analysis State, do not
// introduce duplicate state management" requirement. Drill-down breadcrumbs
// are NOT separately tracked state — they're pure derivations of
// state.filters.cityValues/customerCodes (see GeoBreadcrumb's comment).
// Selecting a map point/chart bar narrows THIS SAME filters object, which is
// also what the KPI cards/chart/AI panel/detail table are all keyed on via
// one `useQuery` — so any selection reactively updates every widget with no
// separate "Update" click and no page refresh, matching the Cross Filtering
// requirement directly.

export type GeoMapMode = "heat" | "bubble" | "cluster" | "territory";

interface GeoAnalysisState {
  filters: GeoFilters;
  kpi: GeoKpi;
  groupBy: GeoGroupBy;
  mode: GeoMapMode;
}

const MODES: { mode: GeoMapMode; labelKey: TranslationKey }[] = [
  { mode: "heat", labelKey: "geoEngine.modeHeat" },
  { mode: "bubble", labelKey: "geoEngine.modeBubble" },
  { mode: "cluster", labelKey: "geoEngine.modeCluster" },
  { mode: "territory", labelKey: "geoEngine.modeTerritory" },
];

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultFilters(): GeoFilters {
  const now = new Date();
  return {
    dateFrom: toLocalIso(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: toLocalIso(now),
  };
}

function defaultState(): GeoAnalysisState {
  return { filters: defaultFilters(), kpi: "sales", groupBy: "customer", mode: "heat" };
}

export default function GeoEnginePage() {
  const { t } = useTranslation();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<GeoMapCanvasHandle>(null);
  // A version counter, not a boolean: switching away from Territory mode and
  // back unmounts/remounts GeoMapCanvas (a brand new Leaflet map instance
  // each time), and a boolean stuck at `true` from the previous instance
  // would never flip to trigger the mode components' effects again for the
  // new instance. Incrementing on every `onReady` always produces a fresh
  // value.
  const [mapReadyTick, setMapReadyTick] = useState(0);

  const [state, setState] = useState<GeoAnalysisState>(defaultState);

  const queryResult = useQuery({
    queryKey: ["geo-engine", "query", state],
    queryFn: () => geoEngineApi.query({ ...state.filters, kpi: state.kpi, groupBy: state.groupBy }),
    placeholderData: (prev) => prev,
  });
  const result = queryResult.data;

  function setFilters(next: GeoFilters) {
    setState((prev) => ({ ...prev, filters: next }));
  }

  function setKpi(next: GeoKpi) {
    setState((prev) => ({ ...prev, kpi: next }));
  }

  function setGroupBy(next: GeoGroupBy) {
    setState((prev) => ({ ...prev, groupBy: next }));
  }

  // Choropleth needs one shape per territory, so switching TO Territory mode
  // always resets groupBy to "city"; switching AWAY from it always resets to
  // "customer" (Heat/Bubble/Cluster need many individual points to show real
  // geographic spread — grouping by city collapses everything into one tiny
  // centroid blob, confirmed against a live client screenshot). Folded into
  // the mode setter itself (not a separate effect) so both fields update in
  // one atomic state change.
  function setMode(next: GeoMapMode) {
    setState((prev) => ({ ...prev, mode: next, groupBy: next === "territory" ? "city" : "customer" }));
  }

  // Cross Filtering / Drill Down — the single handler every map point AND
  // every chart bar click goes through (see GeoChart's own comment on why
  // that's deliberate). Two cases, distinguished by what's currently on
  // screen:
  //  - groupBy === "city" (only true in Territory mode): the clicked point
  //    IS a city/territory aggregate — drill into it by narrowing
  //    cityValues and switching to a point-based mode (Bubble) so there's
  //    something to see, mirroring Territory Intelligence's own
  //    polygon-level -> point-level convention.
  //  - groupBy === "customer": the clicked point is one specific customer —
  //    narrow customerCodes AND cityValues (from the point's own `city`
  //    field) together, so the breadcrumb's City/Territory segment
  //    populates from the very same click.
  function handlePointClick(point: GeoPoint) {
    setState((prev) => {
      if (prev.groupBy === "city") {
        return {
          ...prev,
          mode: "bubble",
          groupBy: "customer",
          filters: { ...prev.filters, cityValues: [point.name], customerCodes: undefined },
        };
      }
      return {
        ...prev,
        filters: { ...prev.filters, cityValues: point.city ? [point.city] : prev.filters.cityValues, customerCodes: [point.id] },
      };
    });
  }

  function goRoot() {
    setState((prev) => ({ ...prev, filters: { ...prev.filters, cityValues: undefined, customerCodes: undefined } }));
  }

  function goCity() {
    setState((prev) => ({ ...prev, filters: { ...prev.filters, customerCodes: undefined } }));
  }

  function handleReset() {
    setState(defaultState());
  }

  // Assigned to a local const first (TS can't narrow `state.filters.cityValues[0]`
  // off a condition on `state.filters.cityValues?.length` unless the property
  // is captured in a stable local first), AND `?? null` after the index
  // access — this repo's tsconfig.base.json sets `noUncheckedIndexedAccess`,
  // so `cityValues[0]` is typed `string | undefined` regardless of the
  // `.length === 1` check right above it (TS doesn't correlate a length
  // comparison with index-in-bounds), which is what broke the production
  // build twice: `string | undefined` isn't assignable to GeoBreadcrumb's
  // `string | null` prop. Same documented gotcha as PROJECT_LOG.md's
  // Route Planning entry.
  const cityValues = state.filters.cityValues;
  const cityLabel = cityValues && cityValues.length === 1 ? (cityValues[0] ?? null) : null;
  const customerCodes = state.filters.customerCodes;
  const selectedCustomerCode = customerCodes && customerCodes.length === 1 ? (customerCodes[0] ?? null) : null;
  const customerLabel = useMemo(() => {
    if (!selectedCustomerCode) return null;
    return result?.points.find((p) => p.id === selectedCustomerCode)?.name ?? selectedCustomerCode;
  }, [selectedCustomerCode, result]);

  const isPermissionDenied = queryResult.error instanceof ApiError && queryResult.error.status === 403;

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="crystal-badge h-11 w-11 bg-cyan-600/15 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400">
            <Globe2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("geoEngine.title")}</h1>
            <p className="text-muted-foreground">{t("geoEngine.subtitle")}</p>
          </div>
        </div>
        <ExecutiveTools targetRef={workspaceRef} onReset={handleReset} />
      </div>

      <div ref={workspaceRef} className="space-y-6 bg-background p-1">
        <div className="glass-card rise-in flex items-start gap-2.5 rounded-lg border border-border p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("geoEngine.phase3Notice")}</p>
        </div>

        <Card className="glass-card rise-in rise-d1">
          <CardHeader>
            <CardTitle>{t("geoEngine.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <GeoFilterBar
              filters={state.filters}
              onChangeFilters={setFilters}
              kpi={state.kpi}
              onChangeKpi={setKpi}
              groupBy={state.groupBy}
              onChangeGroupBy={setGroupBy}
              allowGroupByChoice={state.mode === "territory"}
            />

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">{t("geoEngine.modeLabel")}</span>
              <div className="flex flex-wrap gap-1.5">
                {MODES.map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => setMode(m.mode)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      state.mode === m.mode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary/40",
                    )}
                  >
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
              {queryResult.isFetching && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Spinner className="h-3.5 w-3.5" />
                  {t("geoEngine.loading")}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <GeoBreadcrumb cityLabel={cityLabel} customerLabel={customerLabel} onGoRoot={goRoot} onGoCity={goCity} />

        {isPermissionDenied ? (
          <p className="py-16 text-center text-sm text-destructive">{t("geoEngine.errorLoad")}</p>
        ) : queryResult.isError || !result ? (
          queryResult.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Spinner className="h-5 w-5" />
              {t("geoEngine.loading")}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-destructive">{t("geoEngine.errorLoad")}</p>
          )
        ) : (
          <div className="space-y-6">
            <GeoKpiCards totalValue={result.totalValue} maxValue={result.maxValue} pointsCount={result.points.length} excludedBadCoordinates={result.excludedBadCoordinates} />

            {result.points.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("geoEngine.emptyResult")}</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <Card className="glass-card rise-in rise-d2">
                  <CardContent className="pt-6">
                    {state.mode === "territory" ? (
                      <TerritoryMapMode points={result.points} onPointClick={handlePointClick} />
                    ) : (
                      <>
                        <GeoMapCanvas ref={canvasRef} onReady={() => setMapReadyTick((n) => n + 1)} className="h-[560px] min-w-0 rounded-lg border border-border" />
                        {state.mode === "heat" && <HeatMapMode canvasRef={canvasRef} points={result.points} ready={mapReadyTick} onPointClick={handlePointClick} />}
                        {state.mode === "bubble" && <BubbleMapMode canvasRef={canvasRef} points={result.points} ready={mapReadyTick} onPointClick={handlePointClick} />}
                        {state.mode === "cluster" && <ClusterMapMode canvasRef={canvasRef} points={result.points} ready={mapReadyTick} onPointClick={handlePointClick} />}
                      </>
                    )}
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <GeoChart points={result.points} selectedId={selectedCustomerCode} onPointClick={handlePointClick} />
                  <AiInsightPanel insights={result.insights} />
                </div>
              </div>
            )}

            <GeoDetailTable filters={state.filters} />
          </div>
        )}
      </div>
    </div>
  );
}
