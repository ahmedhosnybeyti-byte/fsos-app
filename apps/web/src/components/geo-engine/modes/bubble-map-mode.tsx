"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { CircleMarker } from "leaflet";
import { colorForRatio } from "../color-scale";
import type { GeoMapCanvasHandle } from "../geo-map-canvas";
import type { GeoPoint } from "@/lib/types";

// Geo Intelligence Engine — Bubble Map mode (Phase 2): "دوائر متدرجة الحجم.
// الحجم = قيمة الـKPI." Circle AREA (not radius) scales linearly with
// value — using radius directly would make a 4x-larger value look only
// ~2x bigger visually, which reads as understating the difference; area
// scaling (radius ∝ sqrt(value)) is the standard fix and matches how a
// human actually perceives "twice as big." Fill color reuses the same
// blue->red intensity scale as Heat Map mode so switching modes doesn't
// switch color languages.
const MIN_RADIUS = 6;
const MAX_RADIUS = 34;

export function BubbleMapMode({
  canvasRef,
  points,
  ready,
  onPointClick,
}: {
  canvasRef: RefObject<GeoMapCanvasHandle | null>;
  points: GeoPoint[];
  ready: number;
  onPointClick?: (point: GeoPoint) => void;
}) {
  const markersRef = useRef<CircleMarker[]>([]);

  useEffect(() => {
    const map = canvasRef.current?.getMap();
    const L = canvasRef.current?.getLeaflet();
    if (!map || !L) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    if (points.length === 0) return;

    const maxValue = points.reduce((m, p) => Math.max(m, p.value), 0);
    const safeMax = maxValue > 0 ? maxValue : 1;
    const bounds: [number, number][] = [];

    for (const p of points) {
      const ratio = p.value / safeMax;
      // Area-proportional: radius ∝ sqrt(ratio), not ratio itself.
      const radius = MIN_RADIUS + Math.sqrt(ratio) * (MAX_RADIUS - MIN_RADIUS);
      const marker = L.circleMarker([p.lat, p.lon], {
        radius,
        color: "#ffffff",
        weight: 1.5,
        fillColor: colorForRatio(ratio),
        fillOpacity: 0.75,
      });
      marker.bindTooltip(`${p.name} — ${Math.round(p.value).toLocaleString("en-US")}`);
      if (onPointClick) marker.on("click", () => onPointClick(p));
      marker.addTo(map);
      markersRef.current.push(marker);
      bounds.push([p.lat, p.lon]);
    }
    map.fitBounds(bounds, { padding: [24, 24] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points]);

  useEffect(
    () => () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
    },
    [],
  );

  return null;
}
