// Central per-module accent-color map — each of the 13+ dashboard modules
// gets a distinct badge color (icon background + text) instead of the old
// single fixed orange accent, per the July 2026 visual-identity redesign
// (see PROJECT_LOG.md). Keyed by a stable module key rather than the raw
// href, so nested/renamed routes don't silently lose their color, and so
// non-nav surfaces (page headers, cards) can reuse the same key.
export type ModuleColorKey =
  | "overview"
  | "assistant"
  | "analysisStudio"
  | "files"
  | "routePlanning"
  | "heatmap"
  | "newCustomer"
  | "customerComparison"
  | "customerSimilarity"
  | "visitEfficiency"
  | "customerLocations"
  | "visitCopilot"
  | "teamPerformance"
  | "sgi"
  | "team"
  | "employees"
  | "settings"
  | "reports"
  | "territoryIntelligence"
  | "decisionAnalyticsStudio"
  | "geoEngine";

export const MODULE_BADGE_CLASSES: Record<ModuleColorKey, string> = {
  overview: "bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
  assistant: "bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
  analysisStudio: "bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-400/15 dark:text-fuchsia-300",
  files: "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
  routePlanning: "bg-cyan-500/15 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300",
  heatmap: "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
  newCustomer: "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  customerComparison: "bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300",
  customerSimilarity: "bg-purple-500/15 text-purple-600 dark:bg-purple-400/15 dark:text-purple-300",
  visitEfficiency: "bg-teal-500/15 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300",
  customerLocations: "bg-lime-500/15 text-lime-600 dark:bg-lime-400/15 dark:text-lime-300",
  visitCopilot: "bg-yellow-500/15 text-yellow-600 dark:bg-yellow-400/15 dark:text-yellow-300",
  teamPerformance: "bg-green-500/15 text-green-600 dark:bg-green-400/15 dark:text-green-300",
  sgi: "bg-pink-500/15 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300",
  team: "bg-orange-500/15 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300",
  employees: "bg-blue-500/15 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300",
  settings: "bg-slate-500/15 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
  reports: "bg-red-500/15 text-red-600 dark:bg-red-400/15 dark:text-red-300",
  territoryIntelligence: "bg-amber-600/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  decisionAnalyticsStudio: "bg-blue-600/15 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  geoEngine: "bg-cyan-600/15 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
};
