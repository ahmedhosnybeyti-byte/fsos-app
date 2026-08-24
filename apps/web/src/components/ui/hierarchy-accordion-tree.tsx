"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hierarchyColorTokens, hierarchyGroupStyles } from "@/components/ui/hierarchy-styles";
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
  const renderNodes = (items: HierarchyAccordionNode<T>[]) => [...items].sort((a, b) => b.opportunityCount - a.opportunityCount || a.label.localeCompare(b.label, "ar")).map((node) => {
    const isOpen = openIds.has(node.id);
    return <section key={node.id} className={cn(hierarchyGroupStyles.group, hierarchyColorTokens[node.level])}>
      <button type="button" className={hierarchyGroupStyles.trigger} aria-expanded={isOpen} onClick={() => toggle(node.id)}>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} aria-hidden />{node.label}
        <span className={hierarchyGroupStyles.count}>{node.opportunityCount.toLocaleString()}</span>
      </button>
      {isOpen && <div className={hierarchyGroupStyles.content}>{node.children?.length ? renderNodes(node.children) : node.leaves?.map(renderLeaf)}</div>}
    </section>;
  });
  return <div className={hierarchyGroupStyles.tree}><div className={hierarchyGroupStyles.actions}><Button type="button" size="sm" variant="outline" onClick={expandAll}>{expandAllLabel}</Button><Button type="button" size="sm" variant="outline" onClick={collapseAll}>{collapseAllLabel}</Button></div>{renderNodes(nodes)}</div>;
}
