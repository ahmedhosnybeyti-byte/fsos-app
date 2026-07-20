"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
// Same SSR-safety reasoning as route-split-map.tsx / heatmap-map.tsx: only
// the stylesheet is imported statically, Leaflet's JS is dynamically
// imported inside useEffect since its module top-level code touches
// `window`.
import "leaflet/dist/leaflet.css";
import { GROUP_COLORS } from "@/components/route-planning/route-split-map";
import type { VisitEfficiencyPoint } from "@/lib/types";

// Visit Efficiency's map used to be a leaflet.heat intensity layer
// (HeatmapMap), but that consistently failed to show anything for real
// data in this screen even after fixing the two bugs found alongside it
// (duplicate keys, a Math.max(...spread) stack-overflow risk) — rather
// than keep guessing blind at a third heat-layer-specific cause, this
// switches to the same CircleMarker approach already proven reliable on
// Customer Similarity/Route Planning. Each rep gets a stable color (by
// position in the `reps` list, so filtering the rep-visibility dropdown
// doesn't shuffle colors), with a popup per visit instead of a blurred
// intensity blob.
export function VisitMap({
  points,
  reps,
  heightClassName = "h-[560px]",
}: {
  points: VisitEfficiencyPoint[];
  reps: string[];
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<CircleMarker[]>([]);

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

  // Re-render markers whenever the points/reps change.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const bounds: [number, number][] = [];
      points.forEach((p) => {
        const repIndex = reps.indexOf(p.rep);
        const color = GROUP_COLORS[(repIndex >= 0 ? repIndex : 0) % GROUP_COLORS.length];
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 6,
          fillColor: color,
          color: "#fff",
          weight: 1.5,
          fillOpacity: 0.9,
        })
          .bindPopup(`<b>${p.label}</b><br>المندوب: ${p.rep}<br>التاريخ: ${p.dateKey}<br>المسافة من الزيارة السابقة: ${p.value.toFixed(2)} كم`)
          .addTo(mapRef.current!);
        markersRef.current.push(marker);
        bounds.push([p.lat, p.lon]);
      });

      if (bounds.length > 0) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    })();

    return () => {
      cancelled = true;
    };
  }, [points, reps]);

  return <div ref={containerRef} className={`${heightClassName} w-full rounded-lg border border-border`} />;
}
