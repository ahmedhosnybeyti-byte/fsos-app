"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/components/translation-provider";
import type { VisitCopilotDiscoveryCustomer, VisitCopilotProspect } from "@/lib/types";

type LatLng = { lat: number; lng: number };
type DiscoveryGoogleInfoWindow = { close: () => void; open: (map: DiscoveryGoogleMap, marker: DiscoveryGoogleMarker) => void; setContent: (content: HTMLElement) => void };
type DiscoveryGoogleMarker = { setMap: (map: DiscoveryGoogleMap | null) => void; setAnimation: (animation: unknown) => void; addListener: (event: string, handler: () => void) => void };
type DiscoveryGoogleMap = { fitBounds: (bounds: DiscoveryGoogleBounds, padding?: number) => void; panTo: (position: LatLng) => void; setZoom: (zoom: number) => void; getZoom: () => number | undefined; addListener: (event: "click", handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => void };
type DiscoveryGoogleBounds = { extend: (position: LatLng) => void; isEmpty: () => boolean };
type DiscoveryMapsApi = { maps: {
  Map: new (element: HTMLElement, options: { center: LatLng; zoom: number; mapTypeControl?: boolean; streetViewControl?: boolean }) => DiscoveryGoogleMap;
  Marker: new (options: { map: DiscoveryGoogleMap; position: LatLng; title: string; icon?: string }) => DiscoveryGoogleMarker;
  LatLngBounds: new () => DiscoveryGoogleBounds;
  InfoWindow: new () => DiscoveryGoogleInfoWindow;
  Circle: new (options: { map: DiscoveryGoogleMap; center: LatLng; radius: number; fillColor: string; fillOpacity: number; strokeColor: string; strokeOpacity: number; strokeWeight: number }) => { setMap: (map: DiscoveryGoogleMap | null) => void };
  Animation: { BOUNCE: unknown };
} };

let googleMapsLoad: Promise<DiscoveryMapsApi> | null = null;

function currentGoogle(): DiscoveryMapsApi | undefined {
  return (window as unknown as { google?: DiscoveryMapsApi }).google;
}

function loadGoogleMaps(apiKey: string): Promise<DiscoveryMapsApi> {
  const google = currentGoogle();
  if (google?.maps) return Promise.resolve(google);
  if (googleMapsLoad) return googleMapsLoad;
  googleMapsLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.onload = () => {
      const loadedGoogle = currentGoogle();
      loadedGoogle?.maps ? resolve(loadedGoogle) : reject(new Error("Google Maps did not initialize"));
    };
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return googleMapsLoad;
}

function hasCoordinates(point: { lat: unknown; lon: unknown }): point is { lat: number; lon: number } {
  return typeof point.lat === "number" && Number.isFinite(point.lat) && typeof point.lon === "number" && Number.isFinite(point.lon);
}

// The map has two marker sources: blue route customers and red discovery
// prospects. While a discovery circle is active, neither source may render
// outside it; the backend remains the authority for persisted prospects.
function isInsideSearchCircle(point: { lat: number; lon: number }, center: LatLng | null, radiusMeters: number): boolean {
  if (!center) return true;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(point.lat - center.lat);
  const dLon = toRadians(point.lon - center.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(center.lat)) * Math.cos(toRadians(point.lat)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) <= radiusMeters + 0.000001;
}

export function GoogleDiscoveryMap({ customers, prospects, selectedProspectId, onSelectProspect, heightClassName, searchCenter, radiusMeters, manualCenterMode, onManualCenter }: {
  customers: VisitCopilotDiscoveryCustomer[];
  prospects: VisitCopilotProspect[];
  selectedProspectId: string | null;
  onSelectProspect: (id: string) => void;
  heightClassName: string;
  searchCenter: LatLng | null;
  radiusMeters: number;
  manualCenterMode: boolean;
  onManualCenter: (center: LatLng) => void;
}) {
  const { locale } = useTranslation();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<DiscoveryGoogleMap | null>(null);
  const infoWindowRef = useRef<DiscoveryGoogleInfoWindow | null>(null);
  const markersRef = useRef<DiscoveryGoogleMarker[]>([]);
  const prospectMarkersRef = useRef(new Map<string, DiscoveryGoogleMarker>());
  const prospectPositionsRef = useRef(new Map<string, LatLng>());
  const onSelectRef = useRef(onSelectProspect);
  const onManualCenterRef = useRef(onManualCenter);
  const manualCenterModeRef = useRef(manualCenterMode);
  const [loadFailed, setLoadFailed] = useState(false);
  onSelectRef.current = onSelectProspect;
  onManualCenterRef.current = onManualCenter;
  manualCenterModeRef.current = manualCenterMode;

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    void loadGoogleMaps(apiKey).then((google) => {
      if (cancelled || !containerRef.current) return;
      setLoadFailed(false);
      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, { center: { lat: 21.6, lng: 39.19 }, zoom: 10, mapTypeControl: false, streetViewControl: false });
        infoWindowRef.current = new google.maps.InfoWindow();
        mapRef.current.addListener("click", (event) => { if (manualCenterModeRef.current && event.latLng) onManualCenterRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() }); });
      }
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      prospectMarkersRef.current.clear();
      prospectPositionsRef.current.clear();
      const map = mapRef.current;
      const bounds = new google.maps.LatLngBounds();
      customers.filter(hasCoordinates).filter((customer) => isInsideSearchCircle(customer, searchCenter, radiusMeters)).forEach((customer) => {
        const position = { lat: customer.lat, lng: customer.lon };
        const marker = new google.maps.Marker({ map, position, title: customer.name, icon: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png" });
        marker.addListener("click", () => {
          const content = document.createElement("div"); content.dir = locale === "ar" ? "rtl" : "ltr"; content.textContent = `${customer.name}${customer.channel ? ` — ${customer.channel}` : ""}`;
          infoWindowRef.current?.setContent(content); infoWindowRef.current?.open(map, marker);
        });
        markersRef.current.push(marker); bounds.extend(position);
      });
      prospects.filter(hasCoordinates).filter((prospect) => isInsideSearchCircle(prospect, searchCenter, radiusMeters)).forEach((prospect) => {
        const position = { lat: prospect.lat, lng: prospect.lon };
        const marker = new google.maps.Marker({ map, position, title: prospect.name, icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png" });
        const openProspect = () => {
          const content = document.createElement("div"); content.dir = locale === "ar" ? "rtl" : "ltr"; content.style.cssText = `max-width:220px;padding:8px;border-radius:6px;background:${document.documentElement.classList.contains("dark") ? "#111827" : "#ffffff"};color:${document.documentElement.classList.contains("dark") ? "#f9fafb" : "#111827"};`;
          const title = document.createElement("strong"); title.textContent = prospect.name;
          const details = document.createElement("div"); details.textContent = [prospect.businessType, prospect.address, prospect.channel].filter(Boolean).join(" — ");
          content.append(title, details);
          if (prospect.photo?.url) { const image = document.createElement("img"); image.src = prospect.photo.url; image.alt = prospect.name; image.style.cssText = "display:block;width:100%;max-height:120px;object-fit:cover;margin-top:8px;border-radius:4px;"; content.append(image); }
          infoWindowRef.current?.setContent(content); infoWindowRef.current?.open(map, marker); onSelectRef.current(prospect.id);
        };
        marker.addListener("click", openProspect);
        marker.addListener("mouseover", openProspect);
        markersRef.current.push(marker); prospectMarkersRef.current.set(prospect.id, marker); prospectPositionsRef.current.set(prospect.id, position); bounds.extend(position);
      });
      if (!bounds.isEmpty()) map.fitBounds(bounds, 32);
    }).catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [apiKey, customers, locale, prospects, radiusMeters, searchCenter]);

  useEffect(() => {
    if (!apiKey || !searchCenter || !mapRef.current) return;
    let circle: { setMap: (map: DiscoveryGoogleMap | null) => void } | null = null;
    void loadGoogleMaps(apiKey).then((google) => { if (mapRef.current) circle = new google.maps.Circle({ map: mapRef.current, center: searchCenter, radius: radiusMeters, fillColor: "#2563eb", fillOpacity: 0.12, strokeColor: "#2563eb", strokeOpacity: 0.9, strokeWeight: 2 }); });
    return () => circle?.setMap(null);
  }, [apiKey, radiusMeters, searchCenter]);

  useEffect(() => {
    if (!selectedProspectId) return;
    const marker = prospectMarkersRef.current.get(selectedProspectId);
    const position = prospectPositionsRef.current.get(selectedProspectId);
    if (!marker || !position || !mapRef.current) return;
    mapRef.current.panTo(position);
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() ?? 14, 14));
    marker.setAnimation(currentGoogle()?.maps.Animation.BOUNCE ?? null);
    const timeout = window.setTimeout(() => marker.setAnimation(null), 700);
    return () => window.clearTimeout(timeout);
  }, [selectedProspectId, prospects]);

  useEffect(() => () => { markersRef.current.forEach((marker) => marker.setMap(null)); infoWindowRef.current?.close(); mapRef.current = null; }, []);

  const message = !apiKey
    ? (locale === "ar" ? "لم يتم إعداد مفتاح Google Maps." : "Google Maps API key is not configured.")
    : loadFailed
      ? (locale === "ar" ? "تعذر تحميل Google Maps. تحقق من تفعيل Maps JavaScript API وقيود المفتاح." : "Google Maps could not load. Verify Maps JavaScript API and key restrictions.")
      : null;
  if (message) return <div dir={locale === "ar" ? "rtl" : "ltr"} className={`flex ${heightClassName} items-center justify-center rounded-lg border border-border px-4 text-center text-sm text-muted-foreground`}>{message}</div>;
  return <div ref={containerRef} className={`${heightClassName} w-full rounded-lg border border-border`} />;
}
