import type { HierarchyAccordionLevel } from "@/components/ui/hierarchy-accordion-tree";

/**
 * Murshidak hierarchy color contract.
 *
 * These values are the existing Visit Copilot treatment, extracted without
 * changing hue, opacity, or light/dark foreground contrast.  They are for
 * grouped and hierarchical interfaces only; ordinary cards must keep using
 * their own semantic surface styles.
 */
export const hierarchyColorTokens: Record<HierarchyAccordionLevel, string> = {
  region: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  manager: "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  supervisor: "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  salesRep: "border-violet-500/35 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  customer: "border-slate-500/35 bg-slate-500/10 text-slate-800 dark:text-slate-200",
};

/** Reusable structural styles for grouped/accordion/tree UI. */
export const hierarchyGroupStyles = {
  tree: "space-y-3",
  actions: "flex flex-wrap gap-2",
  group: "overflow-hidden rounded-md border",
  trigger: "flex w-full items-center gap-2 p-3 text-start text-sm font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  count: "ms-auto rounded-full border border-current/30 bg-background/70 px-2 py-0.5 text-xs font-bold tabular-nums",
  content: "space-y-3 border-t border-border p-3",
} as const;
