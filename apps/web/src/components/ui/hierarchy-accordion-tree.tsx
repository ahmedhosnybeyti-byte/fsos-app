"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface HierarchyAccordionNode<T> { id: string; label: string; children?: HierarchyAccordionNode<T>[]; leaves?: T[]; }
interface Props<T> { nodes: HierarchyAccordionNode<T>[]; renderLeaf: (leaf: T) => ReactNode; expandAllLabel: string; collapseAllLabel: string; onExpandAll?: () => void; onCollapseAll?: () => void; }

/** Shared accessible accordion pattern for Murshidak hierarchy/tree views. */
export function HierarchyAccordionTree<T>({ nodes, renderLeaf, expandAllLabel, collapseAllLabel, onExpandAll, onCollapseAll }: Props<T>) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const idsOf = (items: HierarchyAccordionNode<T>[]): string[] => items.flatMap((item) => [item.id, ...idsOf(item.children ?? [])]);
  const expandAll = () => { setOpenIds(new Set(idsOf(nodes))); onExpandAll?.(); };
  const collapseAll = () => { setOpenIds(new Set()); onCollapseAll?.(); };
  const toggle = (id: string) => setOpenIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const renderNodes = (items: HierarchyAccordionNode<T>[]) => items.map((node) => {
    const isOpen = openIds.has(node.id);
    return <section key={node.id} className="overflow-hidden rounded-md border border-border bg-card/40">
      <button type="button" className="flex w-full items-center gap-2 p-3 text-start text-sm font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={isOpen} onClick={() => toggle(node.id)}>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} aria-hidden />{node.label}
      </button>
      {isOpen && <div className="space-y-3 border-t border-border p-3">{node.children ? renderNodes(node.children) : node.leaves?.map(renderLeaf)}</div>}
    </section>;
  });
  return <div className="space-y-3"><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={expandAll}>{expandAllLabel}</Button><Button type="button" size="sm" variant="outline" onClick={collapseAll}>{collapseAllLabel}</Button></div>{renderNodes(nodes)}</div>;
}
