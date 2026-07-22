"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker, HeatLayer, Layer } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DecisionHeatmapTerritory } from "@/lib/types";
import { useTranslation } from "@/components/translation-provider";
import { heatGradientObject, radiusForZoom, colorForRatio } from "@/components/geo-engine/color-scale";
import { cn } from "@/lib/utils";

// Mini Heat Map — always City-grouped (see decision-analytics-studio.
// schemas.ts's decisionHeatmapTerritorySchema comment), geographic context
// bound bidirectionally into the shared Global Analysis State: clicking a
// dot toggles that City into/out of the active `cityValues` filter (which
// re-runs the query and re-renders the charts/KPIs), and any City already
// active in the filter is drawn highlighted here even if the click that put
// it there came from a chart bar instead of this map — satisfying the
// client's explicit "charts must be linked to the heat map" requirement.
//
// 2026-07-22: client explicitly asked this map to offer the same Heat /
// Bubble / Cluster switch as the Geo Intelligence Engine ("زي الشاشة اللي
// في الصورة الاختيارات الثلاثة"). This stays a self-contained Leaflet
// instance (not migrated onto Geo Engine's shared GeoMapCanvas — that would
// be a bigger refactor for a widget this small) but reuses Geo Engine's own
// color-scale helpers (heatGradientObject/radiusForZoom/colorForRatio) and
// ports its Heat/Cluster rendering logic in a compact form, so this map
// reads as the same visual family as Geo Engine. Fill colors are now
// semantic (colorForRatio) instead of one fixed blue, per the Chart Color
// Standard — selection is still shown via a distinct border/weight, not by
// overriding the fill, matching the convention introduced with the chart
// color engine.

type MiniMapMode = "heat" | "bubble" | "cluster";

const MIN_RADIUS = 6;
const MAX_RADIUS = 26;
const SELECTED_COLOR = "#f59e0b";

// Same "grid bucket that shrinks with zoom" approach as Geo Engine's
// cluster-map-mode.tsx, ported here in compact form (kept local since this
// map isn't on the shared GeoMapCanvas).
function cellSizeForZoom(zoom: number): number {
  return 8 / Math.pow(2, zoom);
}

interface Bucket {
  lat: number;
  lon: number;
  count: number;
  totalSales: number;
  point: DecisionHeatmapTerritory | null; // set only when count === 1
}

function buildBuckets(points: DecisionHeatmapTerritory[], cellSize: number): Bucket[] {
  const buckets = new Map<string, Bucket & { latSum: number; lonSum: number }>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cellSize)}_${Math.floor(p.lon / cellSize)}`;
    const b = buckets.get(key);
    if (b) {
      b.count += 1;
      b.totalSales += p.sales;
      b.latSum += p.lat;
      b.lonSum += p.lon;
      b.point = null;
    } else {
      buckets.set(key, { lat: p.lat, lon: p.lon, count: 1, totalSales: p.sales, point: p, latSum: p.lat, lonSum: p.lon });
    }
  }
  return Array.from(buckets.values()).map((b) => ({ lat: b.latSum / b.count, lon: b.lonSum / b.count, count: b.count, totalSales: b.totalSales, point: b.point }));
}

export function MiniHeatmap({
  points,
  selectedCityIds,
  onToggleCity,
}: {
  points: DecisionHeatmapTerritory[];
  selectedCityIds: string[];
  onToggleCity: (id: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const heatLayerRef = useRef<HeatLayer | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map()); // single-city markers only (bubble mode, cluster mode's count===1 buckets)
  const clusterLayersRef = useRef<Layer[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mode, setMode] = useState<MiniMapMode>("bubble");
  const [zoomTick, setZoomTick] = useState(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([21.6, 39.19], 6);
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

  // Clears + rebuilds every layer type on every render pass, then draws only
  // the active mode's layer — simplest way to keep the three modes from
  // ever fighting over stale markers/heat layers left behind by a mode switch.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (cancelled || !map) return;

      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current = new Map();
      for (const l of clusterLayersRef.current) l.remove();
      clusterLayersRef.current = [];
      if (heatLayerRef.current) {
        heatLayerRef.current.remove();
        heatLayerRef.current = null;
      }
      if (points.length === 0) return;

      const maxSales = points.reduce((m, p) => Math.max(m, p.sales), 0);
      const safeMax = maxSales > 0 ? maxSales : 1;

      if (mode === "heat") {
        // @ts-expect-error -- no types ship for leaflet.heat, same as Geo Engine's heat-map-mode.tsx.
        await import("leaflet.heat");
        if (cancelled || mapRef.current !== map) return;
        const radius = radiusForZoom(map.getZoom());
        const latlngs: [number, number, number][] = points.map((p) => [p.lat, p.lon, p.sales / safeMax]);
        const layer = L.heatLayer(latlngs, { radius, blur: radius * 0.85, maxZoom: 17, max: 1, minOpacity: 0.35, gradient: heatGradientObject() });
        layer.addTo(map);
        heatLayerRef.current = layer;
        // Invisible click targets, same technique as Geo Engine's heat mode
        // — the heat layer itself is one canvas with no per-point DOM.
        for (const p of points) {
          const target = L.circleMarker([p.lat, p.lon], { radius: 12, opacity: 0, fillOpacity: 0, interactive: true });
          target.on("click", () => onToggleCity(p.id, p.name));
          target.addTo(map);
          markersRef.current.set(p.id, target);
        }
      } else if (mode === "bubble") {
        for (const p of points) {
          const isSelected = selectedCityIds.includes(p.id);
          const ratio = p.sales / safeMax;
          const radius = MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
          const marker = L.circleMarker([p.lat, p.lon], {
            radius,
            color: isSelected ? SELECTED_COLOR : "#ffffff",
            weight: isSelected ? 3 : 1,
            fillColor: colorForRatio(ratio),
            fillOpacity: isSelected ? 0.9 : 0.75,
          });
          marker.bindTooltip(`${p.name} — ${Math.round(p.sales).toLocaleString("en-US")}`);
          marker.on("click", () => onToggleCity(p.id, p.name));
          marker.addTo(map);
          markersRef.current.set(p.id, marker);
        }
      } else {
        // cluster
        const cellSize = cellSizeForZoom(map.getZoom());
        const buckets = buildBuckets(points, cellSize);
        const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0);
        for (const b of buckets) {
          const isCluster = b.count > 1;
          const isSelected = !isCluster && b.point ? selectedCityIds.includes(b.point.id) : false;
          const sizeRatio = isCluster ? b.count / Math.max(maxCount, 1) : 0.3;
          const radius = MIN_RADIUS + Math.sqrt(sizeRatio) * (MAX_RADIUS - MIN_RADIUS);
          const ratio = b.totalSales / safeMax;
          const marker = L.circleMarker([b.lat, b.lon], {
            radius,
            color: isSelected ? SELECTED_COLOR : "#ffffff",
            weight: isCluster ? 2 : isSelected ? 3 : 1,
            fillColor: colorForRatio(ratio),
            fillOpacity: isCluster ? 0.85 : isSelected ? 0.9 : 0.75,
          });
          const label = isCluster
            ? `${b.count.toLocaleString("en-US")} — ${Math.round(b.totalSales).toLocaleString("en-US")}`
            : `${b.point?.name ?? ""} — ${Math.round(b.totalSales).toLocaleString("en-US")}`;
          marker.bindTooltip(label);
          if (isCluster) {
            marker.on("click", () => map.setView([b.lat, b.lon], Math.min(map.getZoom() + 3, 16)));
            clusterLayersRef.current.push(marker);
          } else if (b.point) {
            const point = b.point;
            marker.on("click", () => onToggleCity(point.id, point.name));
            markersRef.current.set(point.id, marker);
          }
          marker.addTo(map);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, points, mode, zoomTick]);

  // Bounds-fitting kept in its own effect, deliberately excluding
  // mode/zoomTick — re-fitting on every mode switch or zoom the user just
  // performed would fight their own interaction (same reasoning as Geo
  // Engine's heat-map-mode.tsx).
  useEffect(() => {
    if (!mapRef.current || points.length === 0) return;
    mapRef.current.fitBounds(
      points.map((p) => [p.lat, p.lon] as [number, number]),
      { padding: [24, 24] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, points]);

  // Cheap restyle on selection change, no rebuild — only reaches markers
  // that exist for a single city (bubble mode always, cluster mode's
  // count===1 buckets, heat mode's invisible click targets which have no
  // visible style to restyle anyway).
  useEffect(() => {
    for (const [id, marker] of markersRef.current.entries()) {
      if (mode === "heat") continue; // invisible targets — nothing to restyle
      const isSelected = selectedCityIds.includes(id);
      marker.setStyle({ color: isSelected ? SELECTED_COLOR : "#ffffff", weight: isSelected ? 3 : 1 });
      if (isSelected) marker.bringToFront();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCityIds]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {(["heat", "bubble", "cluster"] as MiniMapMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {t(m === "heat" ? "geoEngine.modeHeat" : m === "bubble" ? "geoEngine.modeBubble" : "geoEngine.modeCluster")}
          </button>
        ))}
      </div>
      <div className="relative h-[300px] min-w-0">
        <div ref={containerRef} className="h-full min-w-0 rounded-lg border border-border" />
        {points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70 text-sm text-muted-foreground">
            {t("decisionAnalyticsStudio.emptyResult")}
          </div>
        )}
      </div>
    </div>
  );
}
