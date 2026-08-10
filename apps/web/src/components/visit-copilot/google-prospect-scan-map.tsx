"use client";

import { useEffect, useRef } from "react";
import type { VisitCopilotProspect } from "@/lib/types";

type LatLng = { lat: number; lng: number };
type GoogleMarker = { setMap: (map: GoogleMap | null) => void };
type GoogleMap = { fitBounds: (bounds: GoogleBounds, padding?: number) => void };
type GoogleBounds = { extend: (position: LatLng) => void };
type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: { center: LatLng; zoom: number; mapTypeControl?: boolean; streetViewControl?: boolean }) => GoogleMap;
    Marker: new (options: { map: GoogleMap; position: LatLng; title: string; label?: string }) => GoogleMarker;
    LatLngBounds: new () => GoogleBounds;
  };
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
  }
}

let googleMapsLoad: Promise<GoogleMapsApi> | null = null;

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (googleMapsLoad) return googleMapsLoad;

  googleMapsLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = () => (window.google?.maps ? resolve(window.google) : reject(new Error("Google Maps did not initialize")));
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return googleMapsLoad;
}

// Isolated from DiscoveryMap by design: this component receives only the scan
// center and results sourced from Google Places. It never accepts customers,
// routes, or Murshidak operational data.
export function GoogleProspectScanMap({
  scanCenter,
  prospects,
  heightClassName = "h-[60vh]",
}: {
  scanCenter: LatLng;
  prospects: VisitCopilotProspect[];
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    const markers: GoogleMarker[] = [];

    void loadGoogleMaps(apiKey).then((google) => {
      if (cancelled || !containerRef.current) return;
      const map = new google.maps.Map(containerRef.current, { center: scanCenter, zoom: 14, mapTypeControl: false, streetViewControl: false });
      const bounds = new google.maps.LatLngBounds();
      markers.push(new google.maps.Marker({ map, position: scanCenter, title: "Scan center", label: "S" }));
      bounds.extend(scanCenter);

      // Never mix Leaflet's operational prospects into the Google map.
      prospects.filter((prospect) => prospect.source === "GOOGLE").forEach((prospect) => {
        const position = { lat: prospect.lat, lng: prospect.lon };
        markers.push(new google.maps.Marker({ map, position, title: prospect.name }));
        bounds.extend(position);
      });
      if (prospects.some((prospect) => prospect.source === "GOOGLE")) map.fitBounds(bounds, 32);
    });

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [prospects, scanCenter]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return <div className={`flex ${heightClassName} items-center justify-center rounded-lg border border-border text-sm text-muted-foreground`}>Google Maps API key is not configured.</div>;
  }
  return <div ref={containerRef} className={`${heightClassName} w-full rounded-lg border border-border`} />;
}
