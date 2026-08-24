"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Layer, Map as LeafletMap, HeatLayer } from "leaflet";
// Stylesheet import is safe statically (no `window` access at module load).
// The Leaflet JS itself, and leaflet.heat, are only ever imported inside
// useEffect — same SSR-safety reasoning as route-split-map.tsx.
import "leaflet/dist/leaflet.css";
import { colorForRatio, heatGradientObject, radiusForZoom } from "@/components/geo-engine/color-scale";
import type { HeatmapPoint } from "@/lib/types";

// 2026-07-21 — multi-layer support (Task #251, product request): the user
// wants several dimension values (e.g. a handful of product categories, or
// a handful of sales channels) shown as SEPARATE heat layers on the SAME
// map at once, each toggleable on/off with its own checkbox — the same
// interaction the earlier static Python-generated reference export
// (FSOS_Geo_Sales_HeatMap_2026_By_Category.html) already had via Leaflet's
// native layer control. Backend needs no change for this: the existing
// single-category/single-scope-value query endpoint is simply called once
// per selected value (see heatmap/page.tsx), and each result becomes one
// entry in `layers` here.
//
// Single-layer callers (new-customer/page.tsx's Category Distribution
// preview) keep using the old `points`/`maxValue` props unchanged — this
// component wraps them into a one-element layer internally, so nothing
// about that call site had to change. The toggle panel itself only renders
// once there are 2+ layers; with exactly one layer this looks and behaves
// exactly as it did before.
export interface HeatmapLayerData {
  id: string;
  label: string;
  color: string;
  points: HeatmapPoint[];
  maxValue: number;
}

export type HeatmapDisplayMode = "heat" | "bubble" | "cluster";

function clusterCellSize(zoom: number): number {
  return 8 / Math.pow(2, zoom);
}

// A handful of visually distinct hues, cycled by layer index — same role
// leaflet.heat's own `gradient` option plays for a single layer, just one
// solid hot-color per layer instead of a value-driven gradient, so two
// overlapping layers stay visually distinguishable from each other. Only
// used when 2+ layers are on screen at once (comparison mode) — see the
// gradient-selection comment in the layer-build effect below.
export const LAYER_PALETTE = ["#2980b9", "#e74c3c", "#27ae60", "#f39c12", "#9b59b6", "#16a085", "#d35400", "#2c3e50"];

function heatGradientFor(color: string): Record<number, string> {
  return { 0.2: `${color}33`, 0.5: `${color}99`, 1.0: color };
}

export function HeatmapMap({
  points,
  maxValue,
  layers,
  layersTitle,
  mode = "heat",
  cityFocusKey,
}: {
  points?: HeatmapPoint[];
  maxValue?: number;
  layers?: HeatmapLayerData[];
  // Human label of the dimension `layers` was built from (e.g. "الفئة" /
  // "القناة") — shown above the toggle list so it's visually obvious which
  // question these checkboxes answer, not just a bare list of values.
  layersTitle?: string;
  mode?: HeatmapDisplayMode;
  // Changes only when the Heatmap's City selection changes. It deliberately
  // moves Leaflet's viewport without recreating the map or its data layers.
  cityFocusKey?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const heatLayersRef = useRef<Map<string, HeatLayer>>(new Map());
  const pointLayersRef = useRef<Layer[]>([]);
  const hasInitialViewportRef = useRef(false);
  const lastCityFocusKeyRef = useRef<string | undefined>(undefined);
  // 2026-07-21 bug fix: the map itself is created asynchronously (dynamic
  // `import("leaflet")` inside the init effect below), so on a HeatmapMap's
  // very first mount — which, in this app, is already carrying real query
  // results (ResultView only renders once a result exists) — the
  // heat-layer-build effect used to run BEFORE `mapRef.current` was set,
  // bail out via its `if (!mapRef.current) return`, and then never run
  // again, because nothing else changes to re-trigger it. `mapReady` is set
  // once map init actually finishes and is added to the heat-layer effect's
  // dependency array below, so that effect correctly re-runs the moment the
  // map becomes available instead of only on data changes.
  const [mapReady, setMapReady] = useState(false);
  // Zoom-responsive radius/blur (2026-07-22 unification with Geo Engine's
  // Heat Map mode, see radiusForZoom's comment in color-scale.ts) needs to
  // know the map's current zoom level to recompute on every `zoomend` — kept
  // as its own effect/dependency (not folded into the bounds-fit below) for
  // the same reason heat-map-mode.tsx splits them: re-fitting bounds on
  // every zoom the user just performed would fight their own zoom gesture.
  const [zoomTick, setZoomTick] = useState(0);

  const resolvedLayers = useMemo<HeatmapLayerData[]>(
    () => (layers && layers.length > 0 ? layers : [{ id: "__single__", label: "", color: LAYER_PALETTE[0]!, points: points ?? [], maxValue: maxValue ?? 0 }]),
    [layers, points, maxValue],
  );

  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(resolvedLayers.map((l) => [l.id, true])));

  // New layer ids (e.g. a category added after the initial render) default
  // to visible; ids no longer present are dropped so the toggle list never
  // accumulates stale entries from a previous query.
  useEffect(() => {
    setVisible((prev) => {
      const next: Record<string, boolean> = {};
      for (const l of resolvedLayers) next[l.id] = prev[l.id] ?? true;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedLayers.map((l) => l.id).join("|")]);

  // One-time map init.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current).setView([21.6, 39.19], 10);
      // 2026-07-21: the raw OSM tile server (tile.openstreetmap.org)
      // aggressively rate-limits non-humanitarian apps per its own tile
      // usage policy — under real dev/demo traffic this showed up as large
      // blank/solid-color patches on the map where tiles silently failed to
      // load, while nearby tiles (that happened to still be cached) loaded
      // fine. CartoDB's free Positron basemap has no such restriction for
      // this volume of traffic and needs no API key — same tiles the
      // reference static export already used successfully.
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);
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

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const onZoom = () => setZoomTick((n) => n + 1);
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [mapReady]);

  // The three display modes consume the exact same query points. Only their
  // Leaflet layer differs: density canvas, value-sized circles, or zoom-aware
  // grid clusters. No filtering or aggregation is done in the map component.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      for (const layer of heatLayersRef.current.values()) layer.remove();
      heatLayersRef.current = new Map();
      for (const layer of pointLayersRef.current) layer.remove();
      pointLayersRef.current = [];

      const visibleLayers = resolvedLayers.filter((layerData) => visible[layerData.id] !== false);
      const entries = visibleLayers.flatMap((layerData) => layerData.points.map((point) => ({ point, color: layerData.color })));
      if (entries.length === 0) return;

      if (mode === "heat") {
        // @ts-expect-error -- leaflet.heat ships without usable TypeScript types.
        await import("leaflet.heat");
        if (cancelled || !mapRef.current) return;
        const useSharedGradient = visibleLayers.length === 1;
        const radius = radiusForZoom(mapRef.current.getZoom());

        for (const layerData of visibleLayers) {
          const safeMax = layerData.maxValue > 0 ? layerData.maxValue : 1;
          const latlngs: [number, number, number][] = layerData.points.map((p) => [p.lat, p.lon, p.value / safeMax]);
          const heatLayer = L.heatLayer(latlngs, {
            radius,
            blur: radius * 0.85,
            maxZoom: 17,
            max: 1,
            minOpacity: 0.35,
            gradient: useSharedGradient ? heatGradientObject() : heatGradientFor(layerData.color),
          }).addTo(mapRef.current);
          heatLayersRef.current.set(layerData.id, heatLayer);
        }
        return;
      }

      const maxValue = entries.reduce((max, entry) => Math.max(max, entry.point.value), 0) || 1;

      if (mode === "bubble") {
        for (const { point, color } of entries) {
          const ratio = point.value / maxValue;
          const marker = L.circleMarker([point.lat, point.lon], {
            radius: 4 + Math.sqrt(ratio) * 16,
            color: "#ffffff",
            weight: 1.5,
            fillColor: visibleLayers.length === 1 ? colorForRatio(ratio) : color,
            fillOpacity: 0.75,
          });
          marker.bindTooltip(`${point.label} — ${Math.round(point.value).toLocaleString("en-US")}`);
          marker.addTo(mapRef.current);
          pointLayersRef.current.push(marker);
        }
        return;
      }

      const cellSize = clusterCellSize(mapRef.current.getZoom());
      const buckets = new Map<string, { latSum: number; lonSum: number; count: number; totalValue: number }>();
      for (const { point } of entries) {
        const key = `${Math.floor(point.lat / cellSize)}_${Math.floor(point.lon / cellSize)}`;
        const bucket = buckets.get(key) ?? { latSum: 0, lonSum: 0, count: 0, totalValue: 0 };
        bucket.latSum += point.lat;
        bucket.lonSum += point.lon;
        bucket.count += 1;
        bucket.totalValue += point.value;
        buckets.set(key, bucket);
      }
      const values = Array.from(buckets.values());
      const maxCount = values.reduce((max, bucket) => Math.max(max, bucket.count), 1);
      const maxClusterValue = values.reduce((max, bucket) => Math.max(max, bucket.totalValue), 1);

      for (const bucket of values) {
        const ratio = bucket.totalValue / maxClusterValue;
        const marker = L.circleMarker([bucket.latSum / bucket.count, bucket.lonSum / bucket.count], {
          radius: 8 + Math.sqrt(bucket.count / maxCount) * 24,
          color: "#ffffff",
          weight: bucket.count > 1 ? 2 : 1.5,
          fillColor: colorForRatio(ratio),
          fillOpacity: 0.85,
        });
        marker.bindTooltip(`${bucket.count.toLocaleString("en-US")} — ${Math.round(bucket.totalValue).toLocaleString("en-US")}`);
        marker.on("click", () => mapRef.current?.setView([bucket.latSum / bucket.count, bucket.lonSum / bucket.count], Math.min((mapRef.current?.getZoom() ?? 10) + 3, 16)));
        marker.addTo(mapRef.current);
        pointLayersRef.current.push(marker);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, mode, zoomTick, resolvedLayers, visible]);

  // Set the initial viewport once. Refreshes only replace the data layers,
  // preserving the user's current center and zoom.
  useEffect(() => {
    if (!mapRef.current || hasInitialViewportRef.current) return;
    const allBounds: [number, number][] = [];
    for (const layerData of resolvedLayers) for (const p of layerData.points) allBounds.push([p.lat, p.lon]);
    if (allBounds.length > 0) {
      mapRef.current.fitBounds(allBounds, { padding: [24, 24] });
      hasInitialViewportRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, resolvedLayers]);

  // City selection is a navigation intent, unlike an ordinary data refresh:
  // fit the new result once, while preserving the existing Leaflet instance,
  // filters, and display mode. This is intentionally separate from the
  // initial-viewport effect so user pan/zoom is never overridden on refresh.
  useEffect(() => {
    if (!mapRef.current || !cityFocusKey || lastCityFocusKeyRef.current === cityFocusKey) return;
    const bounds: [number, number][] = [];
    for (const layerData of resolvedLayers) for (const point of layerData.points) bounds.push([point.lat, point.lon]);
    if (bounds.length === 0) return;
    mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    lastCityFocusKeyRef.current = cityFocusKey;
  }, [mapReady, cityFocusKey, resolvedLayers]);

  const showToggles = resolvedLayers.length > 1;

  // 2026-07-21: per explicit user feedback, the toggle list moved OUT of a
  // floating `absolute` overlay drawn on top of the map canvas (that overlay
  // was rendering as a garbled scribble — it sat inside a Leaflet pane
  // stacking context fighting the map's own panning/zoom transforms) and
  // into a normal sibling column inside the result card, alongside the map
  // rather than on top of it. Placement (start side, i.e. the right in this
  // RTL app) was left to our judgment by the user ("يسار او يمين براحتك").
  return (
    <div className={showToggles ? "flex flex-col gap-3 md:flex-row" : undefined}>
      {showToggles && (
        <div className="glass-card shrink-0 space-y-2 rounded-lg border border-border p-3 text-sm md:w-56">
          {layersTitle && <p className="mb-1 text-xs font-semibold text-muted-foreground">{layersTitle}</p>}
          <div className="space-y-1.5">
            {resolvedLayers.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={visible[l.id] !== false}
                  onChange={(e) => setVisible((prev) => ({ ...prev, [l.id]: e.target.checked }))}
                  className="h-3.5 w-3.5 shrink-0 accent-current"
                  style={{ accentColor: l.color }}
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="truncate">{l.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div ref={containerRef} className="h-[560px] min-w-0 flex-1 rounded-lg border border-border" />
    </div>
  );
}
