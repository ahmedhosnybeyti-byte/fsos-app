"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HierarchyAccordionLevel = "region" | "manager" | "supervisor" | "salesRep" | "customer";
export interface HierarchyAccordionNode<T> { id: string; label: string; level: HierarchyAccordionLevel; opportunityCount: number; children?: HierarchyAccordionNode<T>[]; leaves?: T[]; }
interface Props<T> { nodes: HierarchyAccordionNode<T>[]; renderLeaf: (leaf: T) => ReactNode; expandAllLabel: string; collapseAllLabel: string; onExpandAll?: () => void; onCollapseAll?: () => void; }

/** Shared accessible accordion pattern for Murshidak hierarchy/tree views. */
export function HierarchyAccordionTree<T>({ nodes, renderLeaf, expandAllLabel, collapseAllLabel, onExpandAll, onCollapseAll }: Props<T>) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const idsOf = (items: HierarchyAccordionNode<T>[]): string[] => items.flatMap((item) => [item.id, ...idsOf(item.children ?? [])]);
  const expandAll = () => { setOpenIds(new Set(idsOf(nodes))); onExpandAll?.(); };
  const collapseAll = () => { setOpenIds(new Set()); onCollapseAll?.(); };
  const toggle = (id: string) => setOpenIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const levelClass: Record<HierarchyAccordionLevel, string> = {
    region: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    manager: "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-200",
    supervisor: "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    salesRep: "border-violet-500/35 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    customer: "border-slate-500/35 bg-slate-500/10 text-slate-800 dark:text-slate-200",
  };
  const renderNodes = (items: HierarchyAccordionNode<T>[]) => [...items].sort((a, b) => b.opportunityCount - a.opportunityCount || a.label.localeCompare(b.label, "ar")).map((node) => {
    const isOpen = openIds.has(node.id);
    return <section key={node.id} className={cn("overflow-hidden rounded-md border", levelClass[node.level])}>
      <button type="button" className="flex w-full items-center gap-2 p-3 text-start text-sm font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={isOpen} onClick={() => toggle(node.id)}>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} aria-hidden />{node.label}
        <span className="ms-auto rounded-full border border-current/30 bg-background/70 px-2 py-0.5 text-xs font-bold tabular-nums">{node.opportunityCount.toLocaleString()}</span>
      </button>
      {isOpen && <div className="space-y-3 border-t border-border p-3">{node.children?.length ? renderNodes(node.children) : node.leaves?.map(renderLeaf)}</div>}
    </section>;
  });
  return <div className="space-y-3"><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={expandAll}>{expandAllLabel}</Button><Button type="button" size="sm" variant="outline" onClick={collapseAll}>{collapseAllLabel}</Button></div>{renderNodes(nodes)}</div>;
}
