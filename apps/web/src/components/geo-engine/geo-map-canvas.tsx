"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

// Geo Intelligence Engine — shared Leaflet lifecycle primitive (Phase 1,
// "المحرك الموحد"). Every existing map component in this app (heatmap-map
// .tsx, decision-analytics-studio/mini-heatmap.tsx, territory-intelligence/
// territory-map.tsx) independently duplicates the exact same ~25-line
// "create the Leaflet map once, dynamic-import Leaflet client-side only,
// add the CartoDB Positron tile layer, clean up on unmount" block. This
// component is that block, extracted ONCE — every future map mode (Heat,
// Bubble, Cluster, Choropleth in Phase 2) mounts on top of it via `onReady`
// and does its own layer-building in its own effect, exactly like those
// three existing components already do, just without re-deriving the map
// lifecycle each time.
//
// Deliberately does NOT touch heatmap-map.tsx / mini-heatmap.tsx /
// territory-map.tsx — those keep working exactly as they do today. Phase 2
// is where their rendering gets migrated onto this shared primitive, per
// the client's explicit Phase 1 scope ("المحرك الموحد + الفلاتر + البنية"
// only, not yet the map modes themselves).
//
// Same CartoDB Positron basemap + same default Saudi-area center/zoom as
// every existing map component, so a screen migrated onto this primitive
// later looks visually identical on first paint.
export interface GeoMapCanvasHandle {
  getMap: () => LeafletMap | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Leaflet module itself (`L`), not a specific typed export; callers need the raw namespace to construct layers (L.heatLayer, L.circleMarker, L.geoJSON, ...).
  getLeaflet: () => any;
}

export interface GeoMapCanvasProps {
  className?: string;
  defaultCenter?: [number, number];
  defaultZoom?: number;
  // Fired once, right after the map + tile layer are created and attached to
  // the DOM — the seam every mode-specific layer-builder effect keys off of
  // (same role `mapReady` state plays in the three pre-existing components,
  // just centralized here instead of re-implemented per component).
  onReady?: () => void;
}

export const GeoMapCanvas = forwardRef<GeoMapCanvasHandle, GeoMapCanvasProps>(function GeoMapCanvas(
  { className, defaultCenter = [21.6, 39.19], defaultZoom = 6, onReady },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see GeoMapCanvasHandle.getLeaflet
  const leafletRef = useRef<any>(null);
  const [, setMapReadyTick] = useState(0);

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    getLeaflet: () => leafletRef.current,
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current).setView(defaultCenter, defaultZoom);
      // Same CartoDB Positron basemap as every existing map component in
      // this app — no API key, no rate-limiting issue at this traffic
      // volume (see heatmap-map.tsx's comment on why raw OSM tiles were
      // dropped).
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      leafletRef.current = L;
      mapRef.current = map;
      setMapReadyTick((n) => n + 1);
      onReady?.();
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className ?? "h-[560px] min-w-0 rounded-lg border border-border"} />;
});
