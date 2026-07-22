"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, HeatLayer } from "leaflet";
// Stylesheet import is safe statically (no `window` access at module load).
// The Leaflet JS itself, and leaflet.heat, are only ever imported inside
// useEffect — same SSR-safety reasoning as route-split-map.tsx.
import "leaflet/dist/leaflet.css";
import { heatGradientObject, radiusForZoom } from "@/components/geo-engine/color-scale";
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
}: {
  points?: HeatmapPoint[];
  maxValue?: number;
  layers?: HeatmapLayerData[];
  // Human label of the dimension `layers` was built from (e.g. "الفئة" /
  // "القناة") — shown above the toggle list so it's visually obvious which
  // question these checkboxes answer, not just a bare list of values.
  layersTitle?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const heatLayersRef = useRef<Map<string, HeatLayer>>(new Map());
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

  const resolvedLayers: HeatmapLayerData[] =
    layers && layers.length > 0 ? layers : [{ id: "__single__", label: "", color: LAYER_PALETTE[0]!, points: points ?? [], maxValue: maxValue ?? 0 }];

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

  // Rebuild every heat layer whenever the underlying data changes (new
  // query results) or the zoom level changes (radius/blur retune) —
  // visibility toggling below is a separate, cheaper effect that never
  // re-fetches or re-builds the heat canvases, and bounds-fitting is a
  // separate effect further below keyed only on the dataset itself (not
  // zoom), so it never fights the user's own zoom gesture.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      // The ambient `declare module "leaflet.heat"` in
      // src/types/leaflet-heat.d.ts doesn't reliably suppress this under
      // the project's `moduleResolution: "bundler"` setting once the real
      // (typeless) npm package is actually installed on disk — a known
      // friction point between shorthand ambient declarations and bundler
      // resolution. Side-effect-only import (attaches L.heatLayer), so
      // there's nothing to type here anyway.
      // @ts-expect-error -- see comment above; no types ship for this package
      await import("leaflet.heat");
      if (cancelled || !mapRef.current) return;

      for (const layer of heatLayersRef.current.values()) layer.remove();
      heatLayersRef.current = new Map();

      // Real multi-stop blue -> cyan -> green -> yellow -> orange -> red
      // density gradient (per the client's own reference exports, see
      // color-scale.ts) when there's exactly one layer on screen — this is
      // the normal "just show me the heat map" view. With 2+ layers up at
      // once (the category/channel comparison toggles, Task #251), each
      // layer keeps its own distinct solid hue instead — a shared gradient
      // would make overlapping layers indistinguishable from each other,
      // defeating the whole point of comparing them side by side.
      const useSharedGradient = resolvedLayers.length === 1;
      const radius = radiusForZoom(mapRef.current.getZoom());

      for (const layerData of resolvedLayers) {
        if (layerData.points.length === 0) continue;
        const safeMax = layerData.maxValue > 0 ? layerData.maxValue : 1;
        const latlngs: [number, number, number][] = layerData.points.map((p) => [p.lat, p.lon, p.value / safeMax]);

        const heatLayer = L.heatLayer(latlngs, {
          radius,
          blur: radius * 0.85,
          maxZoom: 17,
          max: 1,
          minOpacity: 0.35,
          gradient: useSharedGradient ? heatGradientObject() : heatGradientFor(layerData.color),
        });
        if (visible[layerData.id] !== false) heatLayer.addTo(mapRef.current);
        heatLayersRef.current.set(layerData.id, heatLayer);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately excludes `visible` — toggling a checkbox shouldn't tear
    // down and rebuild every heat canvas, only add/remove the one layer
    // that changed (handled by the effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, zoomTick, JSON.stringify(resolvedLayers.map((l) => ({ id: l.id, maxValue: l.maxValue, points: l.points })))]);

  // Bounds-fitting — separate effect, deliberately NOT keyed on `zoomTick`
  // (see the layer-build effect's comment above for why: re-fitting on
  // every zoom the user just performed would fight their own zoom gesture).
  useEffect(() => {
    if (!mapRef.current) return;
    const allBounds: [number, number][] = [];
    for (const layerData of resolvedLayers) for (const p of layerData.points) allBounds.push([p.lat, p.lon]);
    if (allBounds.length > 0) mapRef.current.fitBounds(allBounds, { padding: [24, 24] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, JSON.stringify(resolvedLayers.map((l) => ({ id: l.id, points: l.points })))]);

  // Cheap add/remove of already-built heat canvases when a checkbox is
  // toggled — no re-computation of the heat data itself.
  useEffect(() => {
    if (!mapRef.current) return;
    for (const [id, heatLayer] of heatLayersRef.current.entries()) {
      const shouldShow = visible[id] !== false;
      const isShown = mapRef.current.hasLayer(heatLayer);
      if (shouldShow && !isShown) heatLayer.addTo(mapRef.current);
      else if (!shouldShow && isShown) heatLayer.remove();
    }
  }, [visible]);

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
