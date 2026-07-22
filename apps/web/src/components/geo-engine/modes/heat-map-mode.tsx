"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CircleMarker, HeatLayer } from "leaflet";
import { heatGradientObject, radiusForZoom } from "../color-scale";
import type { GeoMapCanvasHandle } from "../geo-map-canvas";
import type { GeoPoint } from "@/lib/types";

// Geo Intelligence Engine — Heat Map mode (Phase 2). Replaces the old
// heatmap-map.tsx's fixed radius=22/blur=18/single-hue-alpha gradient with
// what the client's own reference exports actually show: radius/blur that
// respond to zoom level (so the map reads sensibly whether you're looking
// at all of Saudi Arabia or one street), and a real multi-stop blue -> cyan
// -> green -> yellow -> orange -> red gradient by intensity (color-scale.ts)
// instead of one color at varying opacity. heatmap-map.tsx itself is left
// completely untouched by this file — swapping the standalone Heat Map
// screen onto this mode is a deliberate follow-up step, not done here.
//
// Radius/blur formula: at low zoom (city/country view) points need a large
// radius to read as a smooth density surface; at high zoom (street view)
// a large radius would just be one giant blob over a few streets, so radius
// shrinks as you zoom in — same qualitative behavior Leaflet.heat's own
// `radius`/`blur` are meant to be manually retuned for per zoom level, done
// here automatically via a `zoomend` listener instead of a fixed constant.
// `radiusForZoom` itself now lives in color-scale.ts, shared with the
// standalone Heat Map screen's heatmap-map.tsx (2026-07-22 unification).

export function HeatMapMode({
  canvasRef,
  points,
  ready,
  onPointClick,
}: {
  canvasRef: RefObject<GeoMapCanvasHandle | null>;
  points: GeoPoint[];
  // A version counter, not a boolean — see geo-engine/page.tsx's
  // `mapReadyTick` comment for why.
  ready: number;
  // Phase 3 cross-filtering — leaflet.heat renders a single canvas overlay
  // with no per-point DOM nodes to attach a click listener to, so this mode
  // additionally lays down one fully-transparent CircleMarker per point
  // (see the click-targets effect below) purely as a click target — no
  // visual change to the heat gradient itself, just makes "select any
  // geographic object" work here too, same as the other 3 modes.
  onPointClick?: (point: GeoPoint) => void;
}) {
  const layerRef = useRef<HeatLayer | null>(null);
  const clickTargetsRef = useRef<CircleMarker[]>([]);
  const [zoomTick, setZoomTick] = useState(0);

  useEffect(() => {
    const map = canvasRef.current?.getMap();
    if (!map) return;
    const onZoom = () => setZoomTick((n) => n + 1);
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const map = canvasRef.current?.getMap();
    const L = canvasRef.current?.getLeaflet();
    if (!map || !L) return;
    let cancelled = false;

    (async () => {
      // @ts-expect-error -- no types ship for leaflet.heat; same ambient-
      // declaration friction documented in heatmap-map.tsx.
      await import("leaflet.heat");
      if (cancelled) return;

      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }
      if (points.length === 0) return;

      const maxValue = points.reduce((m, p) => Math.max(m, p.value), 0);
      const safeMax = maxValue > 0 ? maxValue : 1;
      const latlngs: [number, number, number][] = points.map((p) => [p.lat, p.lon, p.value / safeMax]);

      const radius = radiusForZoom(map.getZoom());
      const layer = L.heatLayer(latlngs, {
        radius,
        blur: radius * 0.85,
        maxZoom: 17,
        max: 1,
        minOpacity: 0.35,
        gradient: heatGradientObject(),
      });
      layer.addTo(map);
      layerRef.current = layer;
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately excludes fitBounds — this effect also re-runs on
    // `zoomTick` (dynamic radius/blur re-tuning), and re-fitting bounds on
    // every zoom the user just performed would fight their own zoom
    // gesture. Bounds-fitting is a separate effect below, keyed only on the
    // dataset itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, zoomTick]);

  useEffect(() => {
    const map = canvasRef.current?.getMap();
    if (!map || points.length === 0) return;
    const bounds: [number, number][] = points.map((p) => [p.lat, p.lon]);
    map.fitBounds(bounds, { padding: [24, 24] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points]);

  // Invisible click targets — see the `onPointClick` prop comment above.
  // Separate from the heat-layer effect (which also reruns on zoom) so
  // these don't get rebuilt every zoomend for no reason.
  useEffect(() => {
    const map = canvasRef.current?.getMap();
    const L = canvasRef.current?.getLeaflet();
    if (!map || !L) return;

    for (const m of clickTargetsRef.current) m.remove();
    clickTargetsRef.current = [];
    if (!onPointClick) return;

    for (const p of points) {
      const target = L.circleMarker([p.lat, p.lon], { radius: 14, opacity: 0, fillOpacity: 0, interactive: true });
      target.on("click", () => onPointClick(p));
      target.addTo(map);
      clickTargetsRef.current.push(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points]);

  useEffect(
    () => () => {
      layerRef.current?.remove();
      layerRef.current = null;
      for (const m of clickTargetsRef.current) m.remove();
      clickTargetsRef.current = [];
    },
    [],
  );

  return null;
}
