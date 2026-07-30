"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker, HeatLayer, Layer, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/components/translation-provider";
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
// single-rebuild-effect pattern (that file's own comment identifies this
// as exactly what prevents modes from leaving stale layers behind each
// other), same leaflet.heat params, same color-scale.ts helpers
// (radiusForZoom/heatGradientObject/colorForRatio — imported, not
// reimplemented) so the heat layer here is visually identical to Decision
// Analytics Studio's.
//
// 2026-07-30 follow-up fix: this map's nodes must always be real customer
// locations, never a single per-city summary point. The caller
// (territory-intelligence/page.tsx) now always fetches company-wide
// customer points via heatmapApi.query({ metric: "sales" }) — independent
// of the City -> Customer drill-down hierarchy used elsewhere on the page
// (breadcrumb / decision panel / ranking list) — and passes those in here.
// Reported bug this fixes: selecting a city-level node collapsed an entire
// city into one dot; that was the hierarchy engine's own city-level
// centroid, correctly represented, just not what belongs on this map.
//
// Metric caveat: the 7 TerritoryMapMetric values (healthScore,
// salesGrowthPct, ...) used elsewhere on this page are city-level
// aggregates with no per-customer equivalent, so this map's `value` field
// is always the customer's real sales figure — see the notice rendered by
// the caller next to the metric picker.
export type TerritoryPointMapMode = "points" | "cluster" | "heat";

export interface TerritoryPointMapNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  value: number;
}

const MIN_RADIUS = 7;
const MAX_RADIUS = 30;
const SELECTED_STROKE = "#1d4ed8";
const DEFAULT_STROKE = "#ffffff";
const POINT_FILL = "#2563eb";

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
// blank spreadsheet cell often decodes to. Note: heatmapApi already
// excludes bad coordinates server-side (excludedBadCoordinates field on
// the response) — this is a defensive second layer, not the primary
// filter, matching how mini-heatmap.tsx treats its own already-filtered
// points prop.
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
  totalValue: number;
  single: TerritoryPointMapNode | null;
}

function buildBuckets(nodes: TerritoryPointMapNode[], cellSize: number): Bucket[] {
  const buckets = new Map<string, Bucket & { latSum: number; lonSum: number }>();
  for (const n of nodes) {
    const key = `${Math.floor(n.lat / cellSize)}_${Math.floor(n.lon / cellSize)}`;
    const b = buckets.get(key);
    if (b) {
      b.count += 1;
      b.totalValue += n.value;
      b.latSum += n.lat;
      b.lonSum += n.lon;
      b.single = null;
    } else {
      buckets.set(key, { lat: n.lat, lon: n.lon, count: 1, totalValue: n.value, single: n, latSum: n.lat, lonSum: n.lon });
    }
  }
  return Array.from(buckets.values()).map((b) => ({ lat: b.latSum / b.count, lon: b.lonSum / b.count, count: b.count, totalValue: b.totalValue, single: b.single }));
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

  // Real coordinates only — never a fabricated fallback. Nodes with
  // invalid lat/lon are excluded from every mode; their count is shown as
  // an honest on-map disclosure (never silently dropped).
  const { validNodes, invalidCount } = useMemo(() => {
    const valid = nodes.filter((n) => isValidCoordinate(n.lat, n.lon));
    return { validNodes: valid, invalidCount: nodes.length - valid.length };
  }, [nodes]);

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
  // (coordinate-valid) node set.
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

      const maxValue = validNodes.reduce((m, n) => Math.max(m, n.value), 0);
      const safeMax = maxValue > 0 ? maxValue : 1;

      if (mode === "points") {
        // Independent marker per node — no polygons, no merging, no heat.
        for (const n of validNodes) {
          const isSelected = n.id === selectedNodeId;
          const ratio = n.value / safeMax;
          const marker = L.circleMarker([n.lat, n.lon], {
            radius: 8,
            color: isSelected ? SELECTED_STROKE : DEFAULT_STROKE,
            weight: isSelected ? 3 : 1.5,
            fillColor: colorForRatio(ratio),
            fillOpacity: 0.85,
          });
          marker.bindTooltip(`${n.name} — ${formatValue(n.value)}`);
          marker.on("click", () => onSelectNode(n.id, n.name));
          marker.addTo(map);
          pointMarkersRef.current.set(n.id, marker);
        }
      } else if (mode === "heat") {
        // @ts-expect-error -- no types ship for leaflet.heat, same as every
        // other heat mode in this app (heatmap-map.tsx, geo-engine's
        // heat-map-mode.tsx, mini-heatmap.tsx).
        await import("leaflet.heat");
        if (cancelled || mapRef.current !== map) return;
        const radius = radiusForZoom(map.getZoom());
        const latlngs: [number, number, number][] = validNodes.map((n) => [n.lat, n.lon, n.value / safeMax]);
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
        // cluster
        const cellSize = cellSizeForZoom(map.getZoom());
        const buckets = buildBuckets(validNodes, cellSize);
        const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0);
        const maxBucketValue = buckets.reduce((m, b) => Math.max(m, b.totalValue), 1) || 1;

        for (const b of buckets) {
          const isCluster = b.count > 1;
          const isSelected = !isCluster && b.single ? b.single.id === selectedNodeId : false;
          const sizeRatio = isCluster ? b.count / Math.max(maxCount, 1) : 0.3;
          const radius = MIN_RADIUS + Math.sqrt(sizeRatio) * (MAX_RADIUS - MIN_RADIUS);
          const ratio = b.totalValue / maxBucketValue;

          const marker = L.circleMarker([b.lat, b.lon], {
            radius,
            color: isSelected ? SELECTED_STROKE : "#ffffff",
            weight: isCluster ? 2 : isSelected ? 3 : 1.5,
            fillColor: isCluster ? colorForRatio(ratio) : POINT_FILL,
            fillOpacity: isCluster ? 0.85 : 0.78,
          });
          const label = isCluster
            ? `${b.count.toLocaleString("en-US")} — ${formatValue(b.totalValue)}`
            : `${b.single?.name ?? ""} — ${formatValue(b.totalValue)}`;
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
  }, [mapReady, validNodes, mode, zoomTick]);

  // Fit bounds on data changes only — deliberately excludes `mode`/
  // `zoomTick` so switching modes or zooming keeps the current view instead
  // of fighting the user's own pan/zoom (same reasoning as
  // mini-heatmap.tsx / territory-map.tsx's original choropleth effect).
  // This is what satisfies "keep the same map center/zoom across mode
  // changes."
  useEffect(() => {
    if (!mapRef.current || validNodes.length === 0) return;
    mapRef.current.fitBounds(
      validNodes.map((n) => [n.lat, n.lon] as [number, number]),
      { padding: [24, 24] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, validNodes]);

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
