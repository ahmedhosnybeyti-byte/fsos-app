"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
// Safe to import statically even in a component whose first render happens
// server-side: it's a stylesheet, not code that touches `window`. The
// Leaflet JS itself is NOT imported statically anywhere in this file —
// that only happens inside useEffect (see below), because Leaflet's module
// top-level code touches `window` and would throw during SSR.
import "leaflet/dist/leaflet.css";
import type { RoutePlanningSplitResult } from "@/lib/types";

// Exported so pages that render a color legend next to this map (e.g.
// Customer Similarity) use the exact same palette/order instead of
// guessing — see customer-similarity/page.tsx's <GroupLegend>.
export const GROUP_COLORS = ["#e74c3c", "#2980b9", "#27ae60", "#f39c12", "#8e44ad", "#16a085", "#d35400", "#2c3e50", "#c0392b", "#7f8c8d"];

// Route Performance Map (GVE catalog upgrade): a green/amber/red tier per
// route based on its deviation from the per-group target, instead of an
// arbitrary palette color per group. Lets a manager spot underperforming
// routes on the map itself, not just in the results table below it.
const PERFORMANCE_COLORS = { good: "#27ae60", ok: "#f39c12", bad: "#e74c3c" } as const;

function performanceTier(total: number, target: number): keyof typeof PERFORMANCE_COLORS {
  if (target <= 0) return "ok";
  const dev = (total - target) / target;
  if (dev >= -0.1) return "good";
  if (dev >= -0.3) return "ok";
  return "bad";
}

export function RouteSplitMap({
  result,
  mode,
  labels,
  colorBy = "group",
  heightClassName = "h-[560px]",
}: {
  result: RoutePlanningSplitResult;
  mode: "before" | "after";
  labels?: string[];
  colorBy?: "group" | "performance";
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

  // Re-render markers whenever the result or before/after toggle changes.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const totals = mode === "after" ? result.afterTotals : result.beforeTotals;

      const bounds: [number, number][] = [];
      result.records.forEach((r) => {
        const groupIndex = mode === "after" ? r.after : r.before;
        const groupLabel = labels?.[groupIndex] ?? `مجموعة ${groupIndex + 1}`;
        let color = GROUP_COLORS[groupIndex % GROUP_COLORS.length];
        let perfNote = "";
        if (colorBy === "performance") {
          const tier = performanceTier(totals[groupIndex] ?? 0, result.target);
          color = PERFORMANCE_COLORS[tier];
          perfNote = `<br>الأداء: ${tier === "good" ? "جيد" : tier === "ok" ? "متوسط" : "ضعيف"}`;
        }
        const marker = L.circleMarker([r.lat, r.lon], {
          radius: 6,
          fillColor: color,
          color: "#fff",
          weight: 1.5,
          fillOpacity: 0.9,
        })
          .bindPopup(`<b>${r.label}</b> (${r.id})<br>مبيعات: ${r.sales.toLocaleString("en-US")}<br>الخط: ${groupLabel}${perfNote}`)
          .addTo(mapRef.current!);
        markersRef.current.push(marker);
        bounds.push([r.lat, r.lon]);
      });

      if (bounds.length > 0) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    })();

    return () => {
      cancelled = true;
    };
  }, [result, mode, labels, colorBy]);

  return <div ref={containerRef} className={`${heightClassName} w-full rounded-lg border border-border`} />;
}
