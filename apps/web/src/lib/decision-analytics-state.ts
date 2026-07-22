import type { DecisionAnalyzeByDimension, DecisionFilters } from "./types";

// "Open Territory Intelligence" / "Return" handoff (spec's Navigation
// requirement: transfers the FULL analysis state, restores it exactly, no
// context lost) — same generic ?context=...-style deep-link mechanism as
// lib/sgi-context.ts's SGIContext handoff (encode -> navigate -> decode ->
// restore), applied here to Decision Analytics Studio's own state shape
// instead of an SgiContext. Kept in its own file (not sgi-context.ts) since
// this state has nothing to do with SGI.

export interface DecisionAnalysisState {
  analyzeBy: DecisionAnalyzeByDimension;
  filters: DecisionFilters;
}

export function encodeDecisionState(state: DecisionAnalysisState): string {
  return encodeURIComponent(JSON.stringify(state));
}

// Structural (duck-typed) validation, not a full schema — same reasoning as
// decodeSgiContext: a malformed/tampered/stale-format query param returns
// null so the receiving screen falls back to its normal default state
// instead of crashing.
export function decodeDecisionState(raw: string | null | undefined): DecisionAnalysisState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as DecisionAnalysisState).analyzeBy === "string" &&
      (parsed as DecisionAnalysisState).filters &&
      typeof (parsed as DecisionAnalysisState).filters === "object"
    ) {
      return parsed as DecisionAnalysisState;
    }
    return null;
  } catch {
    return null;
  }
}

// The deep link Decision Analytics Studio uses to open Territory
// Intelligence with its current state attached (as `dasState`, read back
// unmodified by the Return button — see decision-analytics-studio's page.tsx)
// plus `dasCity`, a convenience hint so Territory Intelligence can
// auto-select the matching territory when exactly one City filter is active
// (Territory Intelligence's hierarchy root IS City, so this is the only
// filter dimension that maps onto it directly).
export function buildTerritoryIntelligenceDeepLink(state: DecisionAnalysisState): string {
  const cityValues = state.filters.cityValues;
  const params = new URLSearchParams({ dasState: encodeDecisionState(state) });
  if (cityValues && cityValues.length === 1) params.set("dasCity", cityValues[0]!);
  return `/dashboard/territory-intelligence?${params.toString()}`;
}

// The deep link Territory Intelligence's "Return" button uses to go back to
// Decision Analytics Studio with the exact state it left behind restored.
export function buildDecisionStudioReturnLink(raw: string): string {
  return `/dashboard/decision-analytics-studio?dasState=${encodeURIComponent(raw)}`;
}
