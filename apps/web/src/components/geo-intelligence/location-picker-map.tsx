"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
// Stylesheet import is safe statically (no `window` access at module load).
// The Leaflet JS itself is only ever imported inside useEffect — same
// SSR-safety reasoning as route-split-map.tsx / heatmap-map.tsx.
import "leaflet/dist/leaflet.css";

// Single-marker click-to-place map for Step 1's "pin on the map" location
// method. Deliberately minimal — no clustering, no heat layer, just one
// draggable marker the rep can drop on the customer's real location.
//
// Uses a custom divIcon instead of Leaflet's default L.marker icon —
// Leaflet's default blue-teardrop icon references PNG assets by a relative
// path that doesn't resolve correctly once bundled through Next.js/webpack,
// so it silently renders as nothing (or a tiny broken-image icon) instead of
// throwing. A divIcon is just inline HTML/CSS, so it has no external asset
// to fail to load — same fix already used for the "new customer" marker in
// resolved-customers-map.tsx.
// Real map-pin silhouette (teardrop + white dot) instead of a plain circle —
// same shape as the "new customer" marker in resolved-customers-map.tsx, so
// the location-picking concept looks consistent across Step 1 and the
// results view. iconAnchor points at the pin's tip (bottom-center), i.e. the
// actual picked coordinate, not the visual center of the whole shape.
function pinIcon(L: typeof import("leaflet")) {
  const w = 22;
  const h = 30;
  return L.divIcon({
    className: "",
    html: `<svg width="${w}" height="${h}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45));cursor:grab;">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="#fff"/>
    </svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
}

export function LocationPickerMap({
  lat,
  lon,
  onPick,
}: {
  lat: number | null;
  lon: number | null;
  onPick: (lat: number, lon: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // One-time map init — click anywhere places/moves the marker; dragging the
  // marker also updates the location.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const startLat = lat ?? 21.6;
      const startLon = lon ?? 39.19;
      const map = L.map(containerRef.current).setView([startLat, startLon], lat !== null ? 14 : 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        onPickRef.current(e.latlng.lat, e.latlng.lng);
      });

      // Always show a draggable pin, even before anything's been picked —
      // an empty map with "click to place a pin" and no visible pin is
      // confusing (a rep looking at it has no cue *where* to click or that
      // clicking does anything). Drop it at the map's starting center and
      // immediately report that as the picked location so the visible pin
      // and the actual state always agree.
      const marker = L.marker([startLat, startLon], { draggable: true, icon: pinIcon(L) }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onPickRef.current(pos.lat, pos.lng);
      });
      markerRef.current = marker;
      if (lat === null || lon === null) onPickRef.current(startLat, startLon);

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in sync when lat/lon change from outside the map (GPS
  // button, manual coordinate inputs).
  useEffect(() => {
    if (!mapRef.current || lat === null || lon === null) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lon]);
      } else {
        const marker = L.marker([lat, lon], { draggable: true, icon: pinIcon(L) }).addTo(mapRef.current);
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onPickRef.current(pos.lat, pos.lng);
        });
        markerRef.current = marker;
      }
      mapRef.current.setView([lat, lon], Math.max(mapRef.current.getZoom(), 14));
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return <div ref={containerRef} className="h-[360px] w-full rounded-lg border border-border" />;
}
