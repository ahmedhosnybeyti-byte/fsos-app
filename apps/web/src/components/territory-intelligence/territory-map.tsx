"use client";

import { useEffect, useRef, useState } from "react";
import type { Layer, Map as LeafletMap, PathOptions } from "leaflet";
// Stylesheet import is safe statically (no `window` access at module load).
// The Leaflet JS itself is only ever imported inside useEffect — same
// SSR-safety pattern as heatmap-map.tsx.
import "leaflet/dist/leaflet.css";
import type { TerritorySummaryItem } from "@/lib/types";
import { useTranslation } from "@/components/translation-provider";
import { normalizeTerritoryName, type BoundaryFeatureIndex } from "./boundary-registry";

// riskLevel is a client-computed 7th layer (100 - healthScore, banded with
// the inverse of the healthScore tier coloring) — see colorForNode below.
export type TerritoryMapMetric =
  | "healthScore"
  | "salesGrowthPct"
  | "lostSalesCount"
  | "visitCoveragePct"
  | "collectionHealthPct"
  | "opportunityValueSar"
  | "riskLevel";

// Generic node shape shared with hierarchy-engine.ts's HierarchyLevelNode —
// duplicated here (not imported) so this map component has no compile-time
// dependency on the hierarchy engine; the orchestrator's page.tsx is what
// wires HierarchyLevelNode[] into this prop.
export interface TerritoryMapNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  healthScore: number | null;
  metricValue: number;
  raw?: unknown; // TerritorySummaryItem when isPolygonLevel, undefined otherwise
}

export interface TerritoryMapProps {
  nodes: TerritoryMapNode[]; // current hierarchy level's nodes (from useTerritoryHierarchy)
  isPolygonLevel: boolean; // from the current HierarchyLevelDef
  activeMetric: TerritoryMapMetric;
  selectedNodeId: string | null;
  onSelectNode: (id: string, name: string) => void;
  boundaryIndex: BoundaryFeatureIndex | null; // from loadBoundaryIndex(), null while loading/unavailable
  // Geo Intelligence Engine's Territory/Choropleth mode (Phase 2) reuses
  // this component as-is for its polygon rendering, but its nodes carry a
  // plain GeoPoint value (no TerritorySummaryItem — `raw` is always
  // undefined for that caller), so colorForNode's activeMetric switch has
  // nothing to read. Optional and additive: when provided, this REPLACES
  // colorForNode entirely for polygon-level nodes; Territory Intelligence's
  // own page.tsx doesn't pass it, so its behavior is byte-for-byte
  // unchanged.
  colorForValue?: (node: TerritoryMapNode) => string;
}

// 5-tier health-score palette — same red -> amber -> green family as this
// app's --destructive/--warning/--success CSS variables (see globals.css:
// --destructive 0 72% 51%, --warning 38 92% 45%, --success 142 71% 40%),
// resolved to raw hex here because Leaflet's canvas/SVG renderer can't
// consume `hsl(var(--x))` custom properties the way Tailwind classes can.
// Kept exported under this exact name — other territory-intelligence
// modules (the ranking list, the decision panel) import it directly.
export const TERRITORY_TIER_COLOR: Record<string, string> = {
  excellent: "#16a34a",
  good: "#84cc16",
  average: "#eab308",
  weak: "#f97316",
  veryWeak: "#dc2626",
};

const NO_DATA_COLOR = "#94a3b8";
const SELECTED_STROKE = "#1d4ed8";
const DEFAULT_STROKE = "#ffffff";

// A layer that can be uniformly restyled/reordered regardless of whether it
// came from L.polygon, L.circleMarker, or L.geoJSON (GeoJSON layers don't
// extend Path but do implement setStyle themselves; bringToFront is a Path
// method GeoJSON layers don't have, hence optional here).
type StyleableLayer = Layer & {
  setStyle: (style: PathOptions) => unknown;
  bringToFront?: () => unknown;
};

// Same 5-band-threshold family used for visitCoveragePct/collectionHealthPct
// (higher = better). null -> gray (no data).
function bandHighIsGood(value: number | null): string {
  if (value === null) return NO_DATA_COLOR;
  if (value >= 80) return TERRITORY_TIER_COLOR.excellent!;
  if (value >= 60) return TERRITORY_TIER_COLOR.good!;
  if (value >= 40) return TERRITORY_TIER_COLOR.average!;
  if (value >= 20) return TERRITORY_TIER_COLOR.weak!;
  return TERRITORY_TIER_COLOR.veryWeak!;
}

// riskLevel's bands — same 5-color family and same thresholds as
// bandHighIsGood, but INVERTED direction: high risk = red, low risk = green.
function bandRisk(risk: number): string {
  if (risk >= 80) return TERRITORY_TIER_COLOR.veryWeak!;
  if (risk >= 60) return TERRITORY_TIER_COLOR.weak!;
  if (risk >= 40) return TERRITORY_TIER_COLOR.average!;
  if (risk >= 20) return TERRITORY_TIER_COLOR.good!;
  return TERRITORY_TIER_COLOR.excellent!;
}

// Fill color for a polygon-level node, derived from its raw TerritorySummaryItem
// per the active analytical layer. Only meaningful when isPolygonLevel — the
// caller never invokes this for Customer-level point nodes.
function colorForNode(node: TerritoryMapNode, activeMetric: TerritoryMapMetric, maxOpportunity: number): string {
  const raw = node.raw as TerritorySummaryItem | undefined;
  if (!raw) return NO_DATA_COLOR;

  switch (activeMetric) {
    case "healthScore":
      return TERRITORY_TIER_COLOR[raw.tier] ?? TERRITORY_TIER_COLOR.average!;
    case "salesGrowthPct": {
      const v = raw.metrics.salesGrowthPct;
      if (v === null) return NO_DATA_COLOR;
      if (v >= 10) return TERRITORY_TIER_COLOR.excellent!;
      if (v >= 0) return TERRITORY_TIER_COLOR.good!;
      if (v >= -10) return TERRITORY_TIER_COLOR.weak!;
      return TERRITORY_TIER_COLOR.veryWeak!;
    }
    case "lostSalesCount": {
      const v = raw.metrics.lostSalesCount;
      if (v === 0) return TERRITORY_TIER_COLOR.excellent!;
      if (v <= 3) return TERRITORY_TIER_COLOR.average!;
      if (v <= 8) return TERRITORY_TIER_COLOR.weak!;
      return TERRITORY_TIER_COLOR.veryWeak!;
    }
    case "visitCoveragePct":
      return bandHighIsGood(raw.metrics.visitCoveragePct);
    case "collectionHealthPct":
      return bandHighIsGood(raw.metrics.collectionHealthPct);
    case "opportunityValueSar": {
      if (maxOpportunity <= 0) return NO_DATA_COLOR;
      const ratio = raw.opportunityValueSar / maxOpportunity;
      if (ratio >= 0.75) return TERRITORY_TIER_COLOR.excellent!;
      if (ratio >= 0.5) return TERRITORY_TIER_COLOR.good!;
      if (ratio >= 0.25) return TERRITORY_TIER_COLOR.average!;
      return TERRITORY_TIER_COLOR.weak!;
    }
    case "riskLevel": {
      const risk = 100 - raw.healthScore;
      return bandRisk(risk);
    }
    default:
      return NO_DATA_COLOR;
  }
}

// Shared style object for BOTH the real-boundary GeoJSON path and the
// generated-fallback L.polygon — the client mandated the two look visually
// identical (color from the active metric layer, thicker highlighted stroke
// when selected), so callers never branch on which source produced the
// geometry when computing style, only when computing the geometry itself.
function polygonStyle(fillColor: string, isSelected: boolean): PathOptions {
  return {
    color: isSelected ? SELECTED_STROKE : DEFAULT_STROKE,
    weight: isSelected ? 4 : 1.5,
    fillColor,
    fillOpacity: 0.75,
  };
}

// Deterministic N-sided (9-vertex) irregular polygon around a point, used
// whenever a node's name has no match in the loaded boundary index. Radius
// is a fixed reasonable default with per-node jitter seeded by the node's id
// so fallback shapes aren't all identical circles — same visual family as
// the real boundary shapes (an area, not a circle marker), per the client's
// explicit "do not use large circles" mandate.
function generateFallbackPolygon(lat: number, lon: number, seedKey: string): [number, number][] {
  const seed = Array.from(seedKey).reduce((s, c) => s + c.charCodeAt(0), 0);
  const baseRadius = 0.11;
  const n = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n;
    const wobble = 0.7 + 0.3 * Math.sin(ang * 3 + seed);
    const r = baseRadius * wobble;
    const dLat = r * Math.sin(ang);
    const dLon = (r * Math.cos(ang)) / Math.cos((lat * Math.PI) / 180);
    pts.push([lat + dLat, lon + dLon]);
  }
  pts.push(pts[0]!);
  return pts;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function interpolateColor(hexA: string, hexB: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(hexA);
  const [br, bg, bb] = hexToRgb(hexB);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

// Customer-level points are raw point data, not a health tier — a relative
// gradient within the CURRENT set of visible nodes (highest metricValue =
// green, lowest = muted gray/blue) rather than TERRITORY_TIER_COLOR.
const POINT_LOW_COLOR = "#64748b";
const POINT_HIGH_COLOR = "#16a34a";

function pointColorFor(value: number, min: number, max: number): string {
  if (max <= min) return POINT_HIGH_COLOR;
  const ratio = (value - min) / (max - min);
  return interpolateColor(POINT_LOW_COLOR, POINT_HIGH_COLOR, ratio);
}

function formatTooltipValue(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function TerritoryMap({ nodes, isPolygonLevel, activeMetric, selectedNodeId, onSelectNode, boundaryIndex, colorForValue }: TerritoryMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<Map<string, StyleableLayer>>(new Map());
  // Map init is async (dynamic import), so a build effect that fires before
  // it finishes must bail out and re-run once ready — same fix heatmap-map.tsx
  // applies for its heat-layer effect.
  const [mapReady, setMapReady] = useState(false);
  // True once the current rebuild found at least one polygon-level node with
  // no match in boundaryIndex (i.e. it fell back to a generated shape) — used
  // to show the "approximate demo boundaries" disclosure honestly, only when
  // it's actually true for what's currently on screen.
  const [fallbackUsed, setFallbackUsed] = useState(false);

  // One-time map init.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current).setView([21.6, 39.19], 7);
      // Same CartoDB Positron basemap as heatmap-map.tsx (no API key, no
      // rate-limiting issue like the raw OSM tile server has at this volume).
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild every polygon/point layer when the node list, level kind, active
  // metric, or boundary index changes. Territory/customer counts here are a
  // handful to a few dozen, so a full rebuild is simpler than an incremental
  // diff approach.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      for (const layer of layersRef.current.values()) layer.remove();
      layersRef.current = new Map();

      const bounds: [number, number][] = [];
      let usedFallback = false;

      if (isPolygonLevel) {
        const maxOpportunity = nodes.reduce((max, n) => {
          const raw = n.raw as TerritorySummaryItem | undefined;
          return raw ? Math.max(max, raw.opportunityValueSar) : max;
        }, 0);

        for (const node of nodes) {
          const isSelected = node.id === selectedNodeId;
          const fillColor = colorForValue ? colorForValue(node) : colorForNode(node, activeMetric, maxOpportunity);
          const feature = boundaryIndex?.byName.get(normalizeTerritoryName(node.name));

          let layer: StyleableLayer;
          if (feature) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- feature's geometry is intentionally loosely typed (see boundary-registry.ts); Leaflet accepts any valid GeoJSON object at runtime.
            layer = L.geoJSON(feature as any, {
              style: () => polygonStyle(fillColor, isSelected),
            }) as unknown as StyleableLayer;
          } else {
            usedFallback = true;
            const pts = generateFallbackPolygon(node.lat, node.lon, node.id);
            layer = L.polygon(pts, polygonStyle(fillColor, isSelected));
          }
          layer.bindTooltip(node.name);
          layer.on("click", () => onSelectNode(node.id, node.name));
          layer.addTo(mapRef.current);
          layersRef.current.set(node.id, layer);
          bounds.push([node.lat, node.lon]);
        }
      } else {
        const values = nodes.map((n) => n.metricValue);
        const min = values.length > 0 ? Math.min(...values) : 0;
        const max = values.length > 0 ? Math.max(...values) : 0;

        for (const node of nodes) {
          const isSelected = node.id === selectedNodeId;
          const fillColor = pointColorFor(node.metricValue, min, max);
          const marker = L.circleMarker([node.lat, node.lon], {
            radius: 7,
            color: isSelected ? SELECTED_STROKE : DEFAULT_STROKE,
            weight: isSelected ? 4 : 1.5,
            fillColor,
            fillOpacity: 0.9,
          });
          marker.bindTooltip(`${node.name} — ${formatTooltipValue(node.metricValue)}`);
          marker.on("click", () => onSelectNode(node.id, node.name));
          marker.addTo(mapRef.current);
          layersRef.current.set(node.id, marker);
          bounds.push([node.lat, node.lon]);
        }
      }

      if (bounds.length > 0) mapRef.current.fitBounds(bounds, { padding: [24, 24] });
      setFallbackUsed(usedFallback);
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately excludes `selectedNodeId` — selecting a node should just
    // restyle its layer (effect below), not re-fit the map's viewport every
    // click. It's still read once per rebuild (via the closure above) so a
    // rebuild triggered by other deps changing keeps the current selection's
    // stroke correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, nodes, isPolygonLevel, activeMetric, boundaryIndex, colorForValue]);

  // Cheap restyle on selection change — no rebuild, no re-fit.
  useEffect(() => {
    for (const [id, layer] of layersRef.current.entries()) {
      const selected = id === selectedNodeId;
      layer.setStyle({ color: selected ? SELECTED_STROKE : DEFAULT_STROKE, weight: selected ? 4 : 1.5 });
      if (selected) layer.bringToFront?.();
    }
  }, [selectedNodeId]);

  return (
    <div className="relative h-[560px] min-w-0">
      <div ref={containerRef} className="h-full min-w-0 rounded-lg border border-border" />
      {isPolygonLevel && fallbackUsed && (
        <div className="absolute bottom-1 start-1 z-[1000] rounded bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
          {t("territoryIntelligence.boundarySourcePlaceholder")}
        </div>
      )}
    </div>
  );
}
