"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker, HeatLayer, Layer, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { TerritoryCustomerMetric } from "@/lib/types";
import { colorForRatio, heatGradientObject, radiusForZoom } from "@/components/geo-engine/color-scale";

// Territory Intelligence's point-based map (2026-07-30 rewrite, explicit
// product request). Deliberately a NEW, separate component from
// territory-map.tsx rather than a modification of it — that file is shared
// with Geo Intelligence Engine's own Territory/Choropleth mode
// (geo-engine/modes/territory-map-mode.tsx), which relies on its real
// GeoJSON polygon rendering (isPolygonLevel/boundaryIndex/colorForValue).
// Changing or removing that behavior would have silently broken a screen
// nobody asked to touch, so territory-map.tsx is untouched and this file
// exists purely for Territory Intelligence's own map.
//
// Reference implementation: Decision Analytics Studio's MiniHeatmap
// (components/decision-analytics-studio/mini-heatmap.tsx, read as a
// reference only, not modified). Ported here rather than duplicated
// blind: same "clear every layer type, then draw only the active mode"
// single-rebuild-effect pattern, same leaflet.heat params, same
// color-scale.ts helpers (radiusForZoom/heatGradientObject/colorForRatio —
// imported, not reimplemented).
//
// 2026-07-30 (3rd pass) — real metric wiring. Every node now carries the
// SAME 7-metric value (healthScore/salesGrowthPct/.../riskLevel) the
// City-level sidebar/cards already use, computed per customer by the
// backend (territory-intelligence.service.ts's getCustomerPoints(), not a
// different formula reimplemented here) — the caller
// (territory-intelligence/page.tsx) fetches via
// territoryIntelligenceApi.customerPoints(activeMetric, city) and this
// component only ever renders whatever metric it's handed. No more fixed
// "sales" value regardless of the picker.
export type TerritoryPointMapMode = "points" | "cluster" | "heat";

export interface TerritoryPointMapNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  metric: TerritoryCustomerMetric;
  rawValue: number | null;
  normalizedValue: number; // 0-1, already computed server-side (see territoryCustomerPointSchema)
}

const MIN_RADIUS = 7;
const MAX_RADIUS = 30;
const SELECTED_STROKE = "#1d4ed8";
const DEFAULT_STROKE = "#ffffff";
const POINT_FILL = "#2563eb";

// Per-metric aggregation strategy for cluster mode's collapsed marker
// color/tooltip value, and for the co-located-group marker in points mode
// — explicit product requirement: "sum" for counts/money, "average" for
// percentages/scores, never one blanket rule. riskLevel/healthScore/
// salesGrowthPct/visitCoveragePct/collectionHealthPct are all 0-100-ish
// scores or percentages -> average. lostSalesCount (a per-customer 0/1
// flag) and opportunityValueSar (money) are naturally additive -> sum.
const METRIC_AGGREGATION: Record<TerritoryCustomerMetric, "sum" | "average"> = {
  healthScore: "average",
  salesGrowthPct: "average",
  lostSalesCount: "sum",
  visitCoveragePct: "average",
  collectionHealthPct: "average",
  opportunityValueSar: "sum",
  riskLevel: "average",
};

const METRIC_LABEL_KEY: Record<TerritoryCustomerMetric, TranslationKey> = {
  healthScore: "territoryIntelligence.metricHealthScore",
  salesGrowthPct: "territoryIntelligence.metricSalesGrowth",
  lostSalesCount: "territoryIntelligence.metricLostSales",
  visitCoveragePct: "territoryIntelligence.metricVisitCoverage",
  collectionHealthPct: "territoryIntelligence.metricCollectionHealth",
  opportunityValueSar: "territoryIntelligence.metricOpportunityValue",
  riskLevel: "territoryIntelligence.metricRiskLevel",
};

function aggregate(values: number[], strategy: "sum" | "average"): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((s, v) => s + v, 0);
  return strategy === "sum" ? sum : sum / values.length;
}

export interface TerritoryPointMapProps {
  nodes: TerritoryPointMapNode[];
  mode: TerritoryPointMapMode;
  selectedNodeId: string | null;
  onSelectNode: (id: string, name: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  excludedBadCoordinates?: number;
}

// A location is only ever real data or excluded — never a fabricated
// fallback coordinate. Same bounds as the rest of the app's coordinate
// validation (visit-copilot.service.ts's isSaneCoordinate): finite,
// within real lat/lon ranges, and not the (0,0) null-island sentinel a
// blank spreadsheet cell often decodes to. The backend already excludes
// bad coordinates (excludedBadCoordinates) — this is a defensive second
// layer, not the primary filter.
function isValidCoordinate(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

function formatValue(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

// Same zoom-aware grid-cell approach as mini-heatmap.tsx's
// cellSizeForZoom/buildBuckets, ported (not reimplemented from scratch) —
// cell shrinks as you zoom in, so clusters split apart naturally.
function cellSizeForZoom(zoom: number): number {
  return 8 / Math.pow(2, zoom);
}

interface Bucket {
  lat: number;
  lon: number;
  count: number;
  aggregatedValue: number; // per METRIC_AGGREGATION — sum or average of the bucket's rawValue (nulls excluded)
  normalizedRatio: number; // 0-1 average of member normalizedValue, for color
  single: TerritoryPointMapNode | null;
}

// Exact-coordinate grouping for "points" mode — distinct from cluster
// mode's zoom-aware grid bucketing above. Multiple customers can
// legitimately share one coordinate (e.g. a mall, a shared building, or a
// city-level fallback address entered for several accounts) — coordinates
// are never nudged or fabricated to visually separate them (explicit
// requirement). Instead, a co-located group renders as one marker with a
// count badge in its tooltip; clicking it "spiderfies" — temporarily
// arranges the group's real markers in a small ring around the shared
// point so each one is individually visible and clickable, without ever
// moving their underlying coordinates.
function groupByExactCoordinate(nodes: TerritoryPointMapNode[]): Map<string, TerritoryPointMapNode[]> {
  const groups = new Map<string, TerritoryPointMapNode[]>();
  for (const n of nodes) {
    const key = `${n.lat.toFixed(6)},${n.lon.toFixed(6)}`;
    const existing = groups.get(key);
    if (existing) existing.push(n);
    else groups.set(key, [n]);
  }
  return groups;
}

// Small ring offset in degrees for spiderfied markers — visually distinct
// at typical city zoom levels (~11-15) without drifting far enough to look
// like a different location.
const SPIDERFY_RADIUS_DEG = 0.0009;

function spiderfyOffsets(count: number): Array<{ dLat: number; dLon: number }> {
  const offsets: Array<{ dLat: number; dLon: number }> = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    offsets.push({ dLat: Math.sin(angle) * SPIDERFY_RADIUS_DEG, dLon: Math.cos(angle) * SPIDERFY_RADIUS_DEG });
  }
  return offsets;
}

function buildBuckets(nodes: TerritoryPointMapNode[], cellSize: number, strategy: "sum" | "average"): Bucket[] {
  const buckets = new Map<
    string,
    { latSum: number; lonSum: number; count: number; values: number[]; ratioSum: number; single: TerritoryPointMapNode | null }
  >();
  for (const n of nodes) {
    const key = `${Math.floor(n.lat / cellSize)}_${Math.floor(n.lon / cellSize)}`;
    const b = buckets.get(key);
    if (b) {
      b.count += 1;
      if (n.rawValue !== null) b.values.push(n.rawValue);
      b.ratioSum += n.normalizedValue;
      b.latSum += n.lat;
      b.lonSum += n.lon;
      b.single = null;
    } else {
      buckets.set(key, {
        latSum: n.lat,
        lonSum: n.lon,
        count: 1,
        values: n.rawValue !== null ? [n.rawValue] : [],
        ratioSum: n.normalizedValue,
        single: n,
      });
    }
  }
  return Array.from(buckets.values()).map((b) => ({
    lat: b.latSum / b.count,
    lon: b.lonSum / b.count,
    count: b.count,
    aggregatedValue: aggregate(b.values, strategy),
    normalizedRatio: b.ratioSum / b.count,
    single: b.single,
  }));
}

export function TerritoryPointMap({ nodes, mode, selectedNodeId, onSelectNode, isLoading, isError, excludedBadCoordinates = 0 }: TerritoryPointMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // Every layer type this component can ever draw, each in its own ref so
  // the rebuild effect can unconditionally clear all three before drawing
  // the active mode — this is the exact fix for "layers from the previous
  // type stay behind," ported from mini-heatmap.tsx's own comment on why
  // it does the same thing.
  const pointMarkersRef = useRef<Map<string, CircleMarker>>(new Map());
  const clusterLayersRef = useRef<Layer[]>([]);
  const heatLayerRef = useRef<HeatLayer | null>(null);
  const heatClickTargetsRef = useRef<Layer[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [zoomTick, setZoomTick] = useState(0);
  // Which exact-coordinate groups (see groupByExactCoordinate) are
  // currently "spiderfied" open in points mode — a Set of the group's
  // coordinate key, not customer ids, since the whole point is that
  // several customers share one key. Reset whenever the node set changes
  // so switching city/scope never leaves a stale spiderfied group.
  const [spiderfiedKeys, setSpiderfiedKeys] = useState<Set<string>>(new Set());

  const activeMetric: TerritoryCustomerMetric = nodes[0]?.metric ?? "healthScore";
  const aggregationStrategy = METRIC_AGGREGATION[activeMetric];

  // Real coordinates only — never a fabricated fallback. Nodes with
  // invalid lat/lon are excluded from every mode; their count is shown as
  // an honest on-map disclosure (never silently dropped).
  const { validNodes, invalidCount } = useMemo(() => {
    const valid = nodes.filter((n) => isValidCoordinate(n.lat, n.lon));
    return { validNodes: valid, invalidCount: nodes.length - valid.length };
  }, [nodes]);

  // A fresh node set (new scope, new metric, new data) invalidates any
  // previously spiderfied group — its coordinate key may not even exist
  // anymore, and switching metric shouldn't leave a stale expand state.
  useEffect(() => {
    setSpiderfiedKeys(new Set());
  }, [validNodes]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([21.6, 39.19], 7);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);
      map.on("zoomend", () => setZoomTick((n) => n + 1));
      mapRef.current = map;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The single rebuild effect — clears every layer type first (so a mode
  // switch can never leave the previous mode's layers behind, doubled or
  // otherwise), then draws only `mode`'s layer for the current
  // (coordinate-valid) node set, colored/weighted by each node's own
  // normalizedValue (server-computed for the currently selected metric —
  // this component never re-derives it).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || mapRef.current !== map) return;

      for (const marker of pointMarkersRef.current.values()) marker.remove();
      pointMarkersRef.current = new Map();
      for (const l of clusterLayersRef.current) l.remove();
      clusterLayersRef.current = [];
      for (const l of heatClickTargetsRef.current) l.remove();
      heatClickTargetsRef.current = [];
      if (heatLayerRef.current) {
        heatLayerRef.current.remove();
        heatLayerRef.current = null;
      }

      if (validNodes.length === 0) return;

      if (mode === "points") {
        // One marker per distinct coordinate (no polygons, no zoom-aware
        // merging — that's cluster mode's job). Coordinates are never
        // nudged/fabricated: when several customers share an exact
        // coordinate, that group draws as one marker with a count in its
        // tooltip; clicking it spiderfies the group open instead of
        // silently hiding all-but-one.
        const groups = groupByExactCoordinate(validNodes);
        for (const [key, groupNodes] of groups) {
          if (groupNodes.length === 1 || spiderfiedKeys.has(key)) {
            const offsets = groupNodes.length > 1 ? spiderfyOffsets(groupNodes.length) : [{ dLat: 0, dLon: 0 }];
            groupNodes.forEach((n, i) => {
              const isSelected = n.id === selectedNodeId;
              const offset = offsets[i] ?? { dLat: 0, dLon: 0 };
              const marker = L.circleMarker([n.lat + offset.dLat, n.lon + offset.dLon], {
                radius: 8,
                color: isSelected ? SELECTED_STROKE : DEFAULT_STROKE,
                weight: isSelected ? 3 : 1.5,
                fillColor: colorForRatio(n.normalizedValue),
                fillOpacity: 0.85,
              });
              const valueLabel = n.rawValue === null ? t("territoryIntelligence.metricNoData") : formatValue(n.rawValue);
              marker.bindTooltip(`${n.name} — ${t(METRIC_LABEL_KEY[n.metric])}: ${valueLabel}`);
              marker.on("click", () => onSelectNode(n.id, n.name));
              marker.addTo(map);
              pointMarkersRef.current.set(n.id, marker);
            });
          } else {
            const values = groupNodes.map((n) => n.rawValue).filter((v): v is number => v !== null);
            const aggregatedValue = aggregate(values, aggregationStrategy);
            const avgRatio = groupNodes.reduce((s, n) => s + n.normalizedValue, 0) / groupNodes.length;
            const marker = L.circleMarker([groupNodes[0]!.lat, groupNodes[0]!.lon], {
              radius: 10,
              color: DEFAULT_STROKE,
              weight: 2,
              fillColor: colorForRatio(avgRatio),
              fillOpacity: 0.9,
            });
            marker.bindTooltip(
              `${t("territoryIntelligence.coLocatedCustomers", { count: groupNodes.length })} — ${t(METRIC_LABEL_KEY[activeMetric])}: ${formatValue(aggregatedValue)}`,
            );
            marker.on("click", () => setSpiderfiedKeys((prev) => new Set(prev).add(key)));
            marker.addTo(map);
          }
        }
      } else if (mode === "heat") {
        // @ts-expect-error -- no types ship for leaflet.heat, same as every
        // other heat mode in this app (heatmap-map.tsx, geo-engine's
        // heat-map-mode.tsx, mini-heatmap.tsx).
        await import("leaflet.heat");
        if (cancelled || mapRef.current !== map) return;
        const radius = radiusForZoom(map.getZoom());
        const latlngs: [number, number, number][] = validNodes.map((n) => [n.lat, n.lon, n.normalizedValue]);
        const layer = L.heatLayer(latlngs, {
          radius,
          blur: radius * 0.85,
          maxZoom: 17,
          max: 1,
          minOpacity: 0.35,
          gradient: heatGradientObject(),
        });
        layer.addTo(map);
        heatLayerRef.current = layer;
        // leaflet.heat draws one canvas with no per-point DOM — invisible
        // click targets keep "click a territory to open its panel" working,
        // same technique as mini-heatmap.tsx / geo-engine's heat mode.
        for (const n of validNodes) {
          const target = L.circleMarker([n.lat, n.lon], { radius: 14, opacity: 0, fillOpacity: 0, interactive: true });
          target.on("click", () => onSelectNode(n.id, n.name));
          target.addTo(map);
          heatClickTargetsRef.current.push(target);
        }
      } else {
        // cluster — color now driven by the bucket's aggregated metric
        // value (sum or average per METRIC_AGGREGATION), not a fixed
        // single color. Radius (size) is still purely a function of
        // customer count, per the explicit "رقم العنقود يظل عدد العملاء"
        // requirement — aggregation only changes color/tooltip.
        const cellSize = cellSizeForZoom(map.getZoom());
        const buckets = buildBuckets(validNodes, cellSize, aggregationStrategy);
        const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0);

        for (const b of buckets) {
          const isCluster = b.count > 1;
          const isSelected = !isCluster && b.single ? b.single.id === selectedNodeId : false;
          const sizeRatio = isCluster ? b.count / Math.max(maxCount, 1) : 0.3;
          const radius = MIN_RADIUS + Math.sqrt(sizeRatio) * (MAX_RADIUS - MIN_RADIUS);

          const marker = L.circleMarker([b.lat, b.lon], {
            radius,
            color: isSelected ? SELECTED_STROKE : "#ffffff",
            weight: isCluster ? 2 : isSelected ? 3 : 1.5,
            fillColor: colorForRatio(b.normalizedRatio),
            fillOpacity: isCluster ? 0.85 : 0.78,
          });
          const metricLabel = t(METRIC_LABEL_KEY[activeMetric]);
          const label = isCluster
            ? `${b.count.toLocaleString("en-US")} ${t("territoryIntelligence.customersCountSuffix")} — ${metricLabel}: ${formatValue(b.aggregatedValue)} (${aggregationStrategy === "sum" ? t("territoryIntelligence.aggregationSum") : t("territoryIntelligence.aggregationAverage")})`
            : `${b.single?.name ?? ""} — ${metricLabel}: ${formatValue(b.aggregatedValue)}`;
          marker.bindTooltip(label);

          if (isCluster) {
            // Splits apart on click (zoom in) — never stays merged forever.
            marker.on("click", () => map.setView([b.lat, b.lon], Math.min(map.getZoom() + 3, 16)));
            clusterLayersRef.current.push(marker);
          } else if (b.single) {
            const single = b.single;
            marker.on("click", () => onSelectNode(single.id, single.name));
            pointMarkersRef.current.set(single.id, marker);
          }
          marker.addTo(map);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, validNodes, mode, zoomTick, spiderfiedKeys, activeMetric]);

  // Fit bounds ONLY when the underlying customer set actually changes
  // (new scope/city, or the first load) — NOT merely because the active
  // metric changed while the scope/customer-list stayed the same. Tracked
  // via a stable signature of node ids rather than the `validNodes` array
  // reference (which changes identity on every metric switch even when the
  // customer set is identical), per the explicit "لا تعمل fitBounds جديدًا
  // لمجرد تغيير المؤشر" requirement.
  const nodeIdsSignature = useMemo(() => validNodes.map((n) => n.id).sort().join("|"), [validNodes]);
  useEffect(() => {
    if (!mapRef.current || validNodes.length === 0) return;
    mapRef.current.fitBounds(
      validNodes.map((n) => [n.lat, n.lon] as [number, number]),
      { padding: [24, 24] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, nodeIdsSignature]);

  // Cheap restyle on selection change, no rebuild — reaches "points" mode
  // markers and cluster mode's count===1 buckets (both keyed in
  // pointMarkersRef); heat mode's click targets have no visible style.
  useEffect(() => {
    if (mode === "heat") return;
    for (const [id, marker] of pointMarkersRef.current.entries()) {
      const isSelected = id === selectedNodeId;
      marker.setStyle({ color: isSelected ? SELECTED_STROKE : DEFAULT_STROKE, weight: isSelected ? 3 : 1.5 });
      if (isSelected) marker.bringToFront();
    }
  }, [selectedNodeId, mode]);

  useEffect(
    () => () => {
      for (const marker of pointMarkersRef.current.values()) marker.remove();
      for (const l of clusterLayersRef.current) l.remove();
      for (const l of heatClickTargetsRef.current) l.remove();
      heatLayerRef.current?.remove();
    },
    [],
  );

  const excludedCoordinateCount = Math.max(invalidCount, excludedBadCoordinates);

  return (
    <div className="relative h-[560px] min-w-0">
      <div ref={containerRef} className="h-full min-w-0 rounded-lg border border-border" />
      {/* Legend — updates to the active metric's label so the map always
          discloses what its colors mean, per explicit requirement. */}
      {!isLoading && !isError && validNodes.length > 0 && (
        <div className="absolute top-2 end-2 z-[1000] rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-[11px] shadow-sm">
          <p className="mb-1 font-medium text-foreground">{t(METRIC_LABEL_KEY[activeMetric])}</p>
          <div className="flex items-center gap-1">
            <span className="h-2 w-10 rounded-full" style={{ background: "linear-gradient(to right, #2563eb, #22c55e, #eab308, #f97316, #dc2626)" }} />
          </div>
          <div className="mt-0.5 flex justify-between text-muted-foreground">
            <span>{t("territoryIntelligence.legendLow")}</span>
            <span>{t("territoryIntelligence.legendHigh")}</span>
          </div>
        </div>
      )}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-background/70 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          {t("territoryIntelligence.loading")}
        </div>
      )}
      {!isLoading && isError && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 text-sm text-destructive">
          {t("territoryIntelligence.errorLoad")}
        </div>
      )}
      {!isLoading && !isError && excludedCoordinateCount > 0 && (
        <div className="absolute bottom-1 start-1 z-[1000] rounded bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
          {t("territoryIntelligence.invalidCoordinatesNotice", { count: excludedCoordinateCount })}
        </div>
      )}
      {!isLoading && !isError && validNodes.length === 0 && excludedCoordinateCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 text-sm text-muted-foreground">
          {t("territoryIntelligence.emptyState")}
        </div>
      )}
    </div>
  );
}
