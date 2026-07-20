"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, HeatLayer } from "leaflet";
// Stylesheet import is safe statically (no `window` access at module load).
// The Leaflet JS itself, and leaflet.heat, are only ever imported inside
// useEffect — same SSR-safety reasoning as route-split-map.tsx.
import "leaflet/dist/leaflet.css";
import type { HeatmapPoint } from "@/lib/types";

export function HeatmapMap({ points, maxValue }: { points: HeatmapPoint[]; maxValue: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const heatLayerRef = useRef<HeatLayer | null>(null);

  // One-time map init.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current).setView([21.6, 39.19], 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render the heat layer whenever points/maxValue change.
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

      if (heatLayerRef.current) {
        heatLayerRef.current.remove();
        heatLayerRef.current = null;
      }

      if (points.length === 0) return;

      // leaflet.heat normalizes intensity against its own `max` option —
      // scale every point's weight relative to the biggest value in this
      // result set so the hottest spot is always visibly "hot".
      const safeMax = maxValue > 0 ? maxValue : 1;
      const latlngs: [number, number, number][] = points.map((p) => [p.lat, p.lon, p.value / safeMax]);

      heatLayerRef.current = L.heatLayer(latlngs, {
        radius: 22,
        blur: 18,
        maxZoom: 14,
        max: 1,
        gradient: { 0.2: "#2980b9", 0.4: "#27ae60", 0.6: "#f39c12", 0.8: "#e67e22", 1.0: "#e74c3c" },
      }).addTo(mapRef.current);

      const bounds: [number, number][] = points.map((p) => [p.lat, p.lon]);
      mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    })();

    return () => {
      cancelled = true;
    };
  }, [points, maxValue]);

  return <div ref={containerRef} className="h-[560px] w-full rounded-lg border border-border" />;
}
