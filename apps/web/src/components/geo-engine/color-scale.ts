// Geo Intelligence Engine — shared intensity color scale (Phase 2). The
// client's explicit reference (the 3 uploaded Folium heat-map exports) and
// spec both want "كل ما تكون الكثافة عالية بيتحول للون البرتقالي ثم
// الأحمر" — a real multi-stop blue -> cyan -> green -> yellow -> orange ->
// red gradient driven by relative intensity, not a single fixed hue. Used
// by both the Heat Map mode (as a `leaflet.heat` `gradient` object, which
// wants 0..1 stops) and the Bubble/Cluster modes (as a discrete per-point
// fill color via `colorForRatio`), so all three modes read as one visual
// family instead of three different color languages.
export const HEAT_GRADIENT_STOPS: [number, string][] = [
  [0.0, "#1d4ed8"], // blue
  [0.35, "#06b6d4"], // cyan
  [0.55, "#22c55e"], // green
  [0.7, "#eab308"], // yellow
  [0.85, "#f97316"], // orange
  [1.0, "#dc2626"], // red
];

// `leaflet.heat`'s own `gradient` option shape: a plain object keyed by
// 0..1 stop position.
export function heatGradientObject(): Record<number, string> {
  return Object.fromEntries(HEAT_GRADIENT_STOPS);
}

// Shared zoom-responsive radius helper — originally local to Heat Map mode's
// heat-map-mode.tsx, extracted here (2026-07-22) so the standalone Heat Map
// screen's heatmap-map.tsx can share the exact same "large radius at a
// country-level zoom, shrinks as you zoom in" behavior instead of its old
// fixed radius=22 constant, per the client's "unify the shared map widget"
// approval. See heat-map-mode.tsx's original comment for the full rationale.
export function radiusForZoom(zoom: number): number {
  const r = 42 - zoom * 2.2;
  return Math.max(14, Math.min(42, r));
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
}

// Same 6-stop scale, evaluated at an arbitrary ratio for discrete markers
// (Bubble/Cluster modes) — interpolates linearly between the two nearest
// stops so a ratio of 0.6 (say) lands visibly between green and yellow,
// not snapped to one or the other.
export function colorForRatio(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  for (let i = 0; i < HEAT_GRADIENT_STOPS.length - 1; i++) {
    const [stopA, colorA] = HEAT_GRADIENT_STOPS[i]!;
    const [stopB, colorB] = HEAT_GRADIENT_STOPS[i + 1]!;
    if (r >= stopA && r <= stopB) {
      const t = stopB === stopA ? 0 : (r - stopA) / (stopB - stopA);
      const [ar, ag, ab] = hexToRgb(colorA);
      const [br, bg, bb] = hexToRgb(colorB);
      return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
    }
  }
  return HEAT_GRADIENT_STOPS[HEAT_GRADIENT_STOPS.length - 1]![1];
}
