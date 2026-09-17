import type { Map as LeafletMap } from "leaflet";

// Keep every operational Leaflet surface on one provider. Carto's unauthenticated
// endpoint can now return an "API KEY REQUIRED" image tile, which gets repeated
// across the map. The app has no browser-safe Carto/MapTiler key configured;
// the Google Maps key is exclusively for Google Maps JS and must not be reused.
// Esri's public Light Gray Canvas layer is the supported, keyless fallback and
// keeps the prior light basemap presentation. Attribution is deliberately
// retained as required by the provider.
const OPERATIONAL_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const OPERATIONAL_TILE_ATTRIBUTION = "Tiles &copy; <a href=\"https://www.esri.com/\">Esri</a> &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community";

export function addOperationalBasemap(L: typeof import("leaflet"), map: LeafletMap) {
  return L.tileLayer(OPERATIONAL_TILE_URL, {
    attribution: OPERATIONAL_TILE_ATTRIBUTION,
    maxZoom: 20,
  }).addTo(map);
}
