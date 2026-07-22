// FSOS Chart Color & Visual Intelligence Standard v1.0 — Unified Semantic
// Color Engine (Chart Intelligence Engine, Phase 1). Single source of truth
// for how any chart element (bar/slice/rectangle/point) gets colored, so
// every chart across the app speaks the same visual language instead of one
// fixed hue per component (today: chart-engine.tsx's "#2563eb everywhere"
// and geo-chart.tsx's "#0891b2 everywhere" — confirmed via repo-wide audit,
// 2026-07-22, to be the only two chart-rendering files in the whole app).
//
// Two coloring strategies exist, per the client's explicit spec, chosen
// AUTOMATICALLY per series — no branching required in the calling chart
// component, no separate chart implementation per strategy:
//
//  - Target-Based Coloring: used whenever the series carries a real target
//    value (today: only Sales Rep / Supervisor performance in Decision
//    Analytics Studio, sourced from the RIE "Targets" canonical entity —
//    see decision-analytics-studio.service.ts's buildRepTargetTotals/
//    decisionChartGroupSchema's new `target` field). Colors by actual/
//    target ratio: >=110% excellent(green), 90-110% stable(yellow),
//    70-89% warning(orange), <70% critical(red) — the client's own
//    published thresholds.
//  - Relative Semantic Coloring: used whenever no target exists for the
//    dimension being charted (Customers, Products, Cities, Territories,
//    Lost Sales, or any other dimension before targets are ever wired up
//    for it). Colors by the item's own percentile rank WITHIN THE
//    CURRENTLY FILTERED dataset being charted — never a fixed global
//    threshold, since "high sales" for one filtered slice can be "low" for
//    another (this is the client's "Dynamic Distribution... never assume
//    fixed thresholds when no business target exists" requirement).
//
// The strategy is decided ONCE per series (not per point): if ANY point in
// the series carries a real target, the WHOLE series uses Target-Based
// Coloring — matching "the displayed KPI includes valid target values" as
// a series-level/KPI-level property (e.g. "this is a Sales Rep chart with
// targets loaded this period"), not a per-bar coin flip. An individual
// point that has no target of its own (a rep with no Targets row this
// month) rides along the same visual language as "no data" (gray) rather
// than silently reverting to relative ranking for just that one bar, which
// would visually contradict its target-based siblings on the same axis.
//
// Selection state (the user clicking a bar/point) is intentionally NOT
// modeled here — callers keep indicating selection via a stroke/outline on
// top of the semantic fill, so a selected item's business meaning (its
// real color) stays visible instead of being replaced by an unrelated
// "selected" color. See chart-engine.tsx / geo-chart.tsx for the stroke
// convention.

export type SemanticStatus = "excellent" | "stable" | "warning" | "critical" | "neutral" | "noData";

// The official FSOS color language (Chart Color & Visual Intelligence
// Standard v1.0): green/yellow/orange/red/blue/gray, each with one fixed
// business meaning, reused identically everywhere a chart needs to color
// something by status rather than by category.
export const SEMANTIC_COLORS: Record<SemanticStatus, string> = {
  excellent: "#16a34a", // green — excellent performance / growth / target achieved
  stable: "#eab308", // yellow — normal / stable / needs observation
  warning: "#f97316", // orange — warning / declining / needs attention
  critical: "#dc2626", // red — critical / high risk / significant decline / lost sales
  neutral: "#2563eb", // blue — neutral information / comparisons / historical / selected
  noData: "#9ca3af", // gray — no data / disabled / future values
};

export interface ChartColorPoint {
  /** The raw value being visualized. null/undefined always renders as "no data" (gray), regardless of strategy. */
  value: number | null | undefined;
  /** A real target for THIS point, when one exists. null/undefined/<=0 means this point carries no target. */
  target?: number | null;
}

// Whether a HIGHER value is the good outcome (Sales, Collections, Coverage)
// or a LOWER value is the good outcome (Lost Sales, Returns) — flips which
// end of the relative ranking reads as "excellent" vs "critical". Only
// meaningful for Relative Semantic Coloring; target-ratio coloring is
// always "closer to/over target is better" regardless of polarity.
export type ChartColorPolarity = "higherIsBetter" | "lowerIsBetter";

export type ChartColorStrategy = "target" | "relative";

export function resolveChartColorStrategy(points: readonly ChartColorPoint[]): ChartColorStrategy {
  return points.some((p) => typeof p.target === "number" && Number.isFinite(p.target) && p.target > 0) ? "target" : "relative";
}

function colorForTargetRatio(value: number, target: number): SemanticStatus {
  const pct = (value / target) * 100;
  if (pct >= 110) return "excellent";
  if (pct >= 90) return "stable";
  if (pct >= 70) return "warning";
  return "critical";
}

// Quartile-style relative bucketing within the currently-filtered dataset,
// per the spec's own "Sales: Higher -> Green, Average -> Yellow, Lower ->
// Orange, Lowest -> Red" example.
function colorForRelativeRank(value: number, sortedAscValues: readonly number[], polarity: ChartColorPolarity): SemanticStatus {
  if (sortedAscValues.length <= 1) return "neutral"; // nothing to rank against
  let countBelow = 0;
  for (const v of sortedAscValues) if (v < value) countBelow++;
  const percentile = countBelow / (sortedAscValues.length - 1); // 0 = lowest in set, 1 = highest
  const effective = polarity === "lowerIsBetter" ? 1 - percentile : percentile;
  if (effective >= 0.75) return "excellent";
  if (effective >= 0.5) return "stable";
  if (effective >= 0.25) return "warning";
  return "critical";
}

// Main entry point — colors an entire series in one call, auto-selecting
// the strategy per resolveChartColorStrategy, returning one status per
// point in the SAME order as the input array. This is the only function
// most chart code needs to call.
export function colorChartSeries(points: readonly ChartColorPoint[], polarity: ChartColorPolarity = "higherIsBetter"): SemanticStatus[] {
  const strategy = resolveChartColorStrategy(points);
  const values = points.map((p) => p.value).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const sortedAsc = [...values].sort((a, b) => a - b);

  return points.map((p) => {
    if (typeof p.value !== "number" || !Number.isFinite(p.value)) return "noData";
    if (strategy === "target") {
      if (typeof p.target === "number" && Number.isFinite(p.target) && p.target > 0) {
        return colorForTargetRatio(p.value, p.target);
      }
      return "noData";
    }
    return colorForRelativeRank(p.value, sortedAsc, polarity);
  });
}

// Convenience wrapper for callers that just want a fill hex per point
// without touching the SemanticStatus enum (the common case in recharts
// <Cell> lists).
export function colorHexChartSeries(points: readonly ChartColorPoint[], polarity: ChartColorPolarity = "higherIsBetter"): string[] {
  return colorChartSeries(points, polarity).map((s) => SEMANTIC_COLORS[s]);
}
