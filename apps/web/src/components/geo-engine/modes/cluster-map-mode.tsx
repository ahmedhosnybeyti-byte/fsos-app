"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Layer } from "leaflet";
import { colorForRatio } from "../color-scale";
import type { GeoMapCanvasHandle } from "../geo-map-canvas";
import type { GeoPoint } from "@/lib/types";

// Geo Intelligence Engine — Cluster Map mode (Phase 2): "دمج العملاء عند
// Zoom Out. تفكيكهم عند Zoom In." Implemented as a hand-rolled zoom-aware
// grid clustering (bucket points into a lat/lon grid whose cell size
// shrinks as you zoom in, re-bucketed on every `zoomend`) rather than
// pulling in the `leaflet.markercluster` plugin as a new dependency — this
// sandbox has repeatedly hit long stalls/timeouts installing even a single
// new npm package into apps/web (see PROJECT_LOG.md's Decision Analytics
// Studio entry), and this simpler approach delivers the exact behavior the
// spec asks for (merge far out, expand near in) without that risk. Can be
// swapped for `leaflet.markercluster` later if the client wants that
// library's exact visual style (spiderfy on click, etc.) — nothing else
// in the Geo Intelligence Engine depends on which implementation this mode
// uses internally.
//
// Grid cell size ~= 8 / 2^zoom degrees: wide buckets (~14km) at a
// country-level zoom (6), sub-100m buckets by street-level zoom (14+), so
// individual customers effectively stop merging once you've zoomed in
// enough to tell them apart on the map anyway.
function cellSizeForZoom(zoom: number): number {
  return 8 / Math.pow(2, zoom);
}

interface ClusterBucket {
  lat: number;
  lon: number;
  count: number;
  totalValue: number;
  point: GeoPoint | null; // set only when count === 1, for the tooltip's real name
}

function buildBuckets(points: GeoPoint[], cellSize: number): ClusterBucket[] {
  const buckets = new Map<string, ClusterBucket & { latSum: number; lonSum: number }>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cellSize)}_${Math.floor(p.lon / cellSize)}`;
    const b = buckets.get(key);
    if (b) {
      b.count += 1;
      b.totalValue += p.value;
      b.latSum += p.lat;
      b.lonSum += p.lon;
      b.point = null;
    } else {
      buckets.set(key, { lat: p.lat, lon: p.lon, count: 1, totalValue: p.value, point: p, latSum: p.lat, lonSum: p.lon });
    }
  }
  return Array.from(buckets.values()).map((b) => ({ lat: b.latSum / b.count, lon: b.lonSum / b.count, count: b.count, totalValue: b.totalValue, point: b.point }));
}

const MIN_RADIUS = 8;
const MAX_RADIUS = 32;

export function ClusterMapMode({
  canvasRef,
  points,
  ready,
  onPointClick,
}: {
  canvasRef: RefObject<GeoMapCanvasHandle | null>;
  points: GeoPoint[];
  ready: number;
  // Only fires for single-point buckets (a real, identifiable geographic
  // object) — clicking a multi-point cluster still just zooms in, since
  // there's no single object to select there.
  onPointClick?: (point: GeoPoint) => void;
}) {
  const layersRef = useRef<Layer[]>([]);
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

    for (const l of layersRef.current) l.remove();
    layersRef.current = [];
    if (points.length === 0) return;

    const cellSize = cellSizeForZoom(map.getZoom());
    const buckets = buildBuckets(points, cellSize);
    const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0);
    const maxValue = buckets.reduce((m, b) => Math.max(m, b.totalValue), 1) || 1;

    for (const b of buckets) {
      const isCluster = b.count > 1;
      const sizeRatio = isCluster ? b.count / Math.max(maxCount, 1) : 0.3;
      const radius = MIN_RADIUS + Math.sqrt(sizeRatio) * (MAX_RADIUS - MIN_RADIUS);
      const colorRatio = b.totalValue / maxValue;

      const marker = L.circleMarker([b.lat, b.lon], {
        radius,
        color: "#ffffff",
        weight: isCluster ? 2 : 1.5,
        fillColor: colorForRatio(colorRatio),
        fillOpacity: isCluster ? 0.85 : 0.7,
      });

      const label = isCluster ? `${b.count.toLocaleString("en-US")} — ${Math.round(b.totalValue).toLocaleString("en-US")}` : `${b.point?.name ?? ""} — ${Math.round(b.totalValue).toLocaleString("en-US")}`;
      marker.bindTooltip(label);

      if (isCluster) {
        // "تفكيكهم عند Zoom In" — click a cluster to zoom into it; the
        // zoomend listener above then re-buckets at the new (smaller) cell
        // size, which naturally splits this cluster into smaller ones or
        // individual points.
        marker.on("click", () => map.setView([b.lat, b.lon], Math.min(map.getZoom() + 3, 16)));
      } else if (onPointClick && b.point) {
        const point = b.point;
        marker.on("click", () => onPointClick(point));
      }

      marker.addTo(map);
      layersRef.current.push(marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, zoomTick]);

  useEffect(() => {
    const map = canvasRef.current?.getMap();
    if (!map || points.length === 0) return;
    map.fitBounds(
      points.map((p) => [p.lat, p.lon] as [number, number]),
      { padding: [24, 24] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points]);

  useEffect(
    () => () => {
      for (const l of layersRef.current) l.remove();
      layersRef.current = [];
    },
    [],
  );

  return null;
}
