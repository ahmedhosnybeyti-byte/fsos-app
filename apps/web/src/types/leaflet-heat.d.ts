// "leaflet.heat" (https://github.com/Leaflet/Leaflet.heat) has no official
// @types package with a version that matches how it's used here, so this
// hand-written ambient declaration stands in for it. The import itself is a
// pure side effect (it attaches L.heatLayer onto the Leaflet module) — see
// components/heatmap/heatmap-map.tsx for the dynamic import.
declare module "leaflet.heat";

import type { Layer } from "leaflet";

declare module "leaflet" {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  type HeatLatLngTuple = [number, number, number?];

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: HeatLatLngTuple[]): this;
    addLatLng(latlng: HeatLatLngTuple): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
  }

  function heatLayer(latlngs: HeatLatLngTuple[], options?: HeatLayerOptions): HeatLayer;
}
