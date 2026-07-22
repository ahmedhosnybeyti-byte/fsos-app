"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker, Marker } from "leaflet";
// Stylesheet import is safe statically (no `window` access at module load).
// The Leaflet JS itself is only ever imported inside useEffect — same
// SSR-safety reasoning as route-split-map.tsx / heatmap-map.tsx.
import "leaflet/dist/leaflet.css";
import type { GeoIntelligenceResolvedCustomer } from "@/lib/types";

// Real map-pin silhouette (teardrop + white dot), not a plain circle — same
// shape used by location-picker-map.tsx's pin, so the "new customer" marker
// reads as the same location-marking concept throughout Step 1 and the
// results view. iconAnchor points at the pin's tip (bottom-center), i.e.
// the actual coordinate, not the visual center of the whole shape.
function pinIcon(L: typeof import("leaflet"), color: string) {
  const w = 27;
  const h = 36;
  return L.divIcon({
    className: "",
    html: `<svg width="${w}" height="${h}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.45))">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4.5" fill="#fff"/>
    </svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
}

// Plots the resolved reference-customer set from a geo-intelligence
// analyze() result on a map — replaces the plain table so it's immediately
// clear *where* these customers are relative to the new customer, not just
// their names/distances. The new customer's captured location gets a
// visually distinct pin (red, bigger, its own popup) so it never blends
// into the reference set.
//
// Map creation and marker plotting are done in ONE effect (not split into a
// "create map once" + "plot markers on change" pair) — splitting them caused
// a real bug: this component only mounts once real results exist, so both
// effects fire in the same commit; the marker effect would see
// `mapRef.current` still null (map creation is async) and bail out
// permanently, since `customers`/`newCustomerLocation` don't necessarily
// change again afterward to give it a second chance. Keeping map init and
// marker plotting in the same async flow removes that race entirely.
export function ResolvedCustomersMap({
  customers,
  newCustomerLocation,
  centerLabel = "العميل الجديد",
  centerName,
  neighborLabel = "عميل مرجعي (تلقائي)",
}: {
  customers: GeoIntelligenceResolvedCustomer[];
  newCustomerLocation: { lat: number; lon: number };
  // Reused as-is by Customer Comparison, where the center pin is an
  // EXISTING target customer being compared against neighbors, not a
  // brand-new one — these let the caller relabel the pin/legend/popup
  // without forking the component.
  centerLabel?: string;
  centerName?: string;
  neighborLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<(CircleMarker | Marker)[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        const map = L.map(containerRef.current).setView([newCustomerLocation.lat, newCustomerLocation.lon], 13);
        // See heatmap-map.tsx for why this isn't the raw OSM tile server —
        // same rate-limiting issue, same fix, applied consistently.
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
          subdomains: "abcd",
          maxZoom: 20,
        }).addTo(map);
        mapRef.current = map;
      }
      const map = mapRef.current;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const bounds: [number, number][] = [[newCustomerLocation.lat, newCustomerLocation.lon]];

      customers.forEach((c) => {
        const color = c.source === "auto" ? "#2980b9" : "#27ae60";
        const marker = L.circleMarker([c.lat, c.lon], {
          radius: 7,
          fillColor: color,
          color: "#fff",
          weight: 1.5,
          fillOpacity: 0.9,
        })
          .bindPopup(
            `<b>${c.name}</b> (${c.id})<br>${c.distanceKm !== null ? `المسافة: ${c.distanceKm.toFixed(2)} كم<br>` : ""}المصدر: ${c.source === "auto" ? "تلقائي" : "يدوي"}`,
          )
          .addTo(map);
        markersRef.current.push(marker);
        bounds.push([c.lat, c.lon]);
      });

      const centerPopup = centerName ? `<b>${centerName}</b><br>${centerLabel}` : `<b>${centerLabel}</b>`;
      const newMarker = L.marker([newCustomerLocation.lat, newCustomerLocation.lon], { icon: pinIcon(L, "#e74c3c"), zIndexOffset: 1000 })
        .bindPopup(centerPopup)
        .addTo(map);
      markersRef.current.push(newMarker);

      map.fitBounds(bounds, { padding: [32, 32] });
    })();

    return () => {
      cancelled = true;
    };
  }, [customers, newCustomerLocation, centerLabel, centerName]);

  // Map teardown only on unmount — separate from the effect above so
  // switching customers/location doesn't destroy and recreate the map.
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div>
      <div ref={containerRef} className="h-[460px] w-full rounded-lg border border-border" />
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-white" style={{ background: "#e74c3c" }} /> {centerLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border border-white" style={{ background: "#2980b9" }} /> {neighborLabel}
        </span>
        {customers.some((c) => c.source === "manual") && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border border-white" style={{ background: "#27ae60" }} /> عميل مرجعي (يدوي)
          </span>
        )}
      </div>
    </div>
  );
}
