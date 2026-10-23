"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";

export type CategoryEntry<T> = { item: T; index: number };
export function groupCategoryPage<T>(items: readonly T[], categoryOf: (item:T)=>unknown) {
  const groups=new Map<string,CategoryEntry<T>[]>();
  items.forEach((item,index)=>{
    const raw=categoryOf(item),category=typeof raw==="string"?raw.trim():"";
    const entries=groups.get(category)??[];entries.push({item,index});groups.set(category,entries);
  });
  return [...groups].map(([category,entries])=>({category,entries}));
}

// Same section/button/chevron interaction as Smart Loading. Receives only the
// already-authorized result page; never fetches or joins a product catalogue.
export function ProductCategoryGroups<T>({items=[],categoryOf,renderItem,renderGroup,search="",contentClassName="space-y-2",containerAs="div"}: {
  items?:readonly T[];categoryOf?:(item:T)=>unknown;renderItem?:(item:T,index:number)=>ReactNode;
  renderGroup?:(entries:readonly CategoryEntry<T>[])=>ReactNode;search?:string;
  contentClassName?:string;containerAs?:"div"|"ul";
}) {
  const {t,locale}=useTranslation(),id=useId(),[overrides,setOverrides]=useState<Record<string,boolean>>({});
  const groups=groupCategoryPage(items,categoryOf??(item=>(item as {category?:unknown})?.category));
  const Content=containerAs;
  return <div className="min-w-0 space-y-2">{groups.map(({category,entries},groupIndex)=>{
    const stateKey=JSON.stringify([search.trim(),category]);
    const open=overrides[stateKey]??!!search.trim(),panelId=`${id}-${groupIndex}`;
    return <section key={category} className="min-w-0 overflow-hidden rounded-lg border border-border">
      <button type="button" aria-expanded={open} aria-controls={panelId}
        onClick={()=>setOverrides(current=>({...current,[stateKey]:!open}))}
        className="relative flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm font-semibold text-primary outline-none hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="min-w-0 break-words">{category||t("productGroups.uncategorized")} <span className="text-muted-foreground" title={t("productGroups.pageCount")}>({entries.length.toLocaleString(locale)})</span></span>
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",!open&&"-rotate-90 rtl:rotate-90")}/>
      </button>
      <div id={panelId} hidden={!open}>{renderGroup?renderGroup(entries):<Content className={cn("min-w-0 border-t border-border p-3",contentClassName)}>{entries.map(({item,index})=>renderItem?.(item,index))}</Content>}</div>
    </section>;
  })}</div>;
}
