"use client";

import { useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fsos360Api } from "@/lib/api/fsos-360";
import type { Fsos360QueryInput } from "@/lib/types";
import { useTranslation } from "@/components/translation-provider";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type SmartField = "customer" | "product" | "brand" | "category" | "sales-rep";

export function Fsos360SmartSlicer({ field, labelKey, selected, context, disabled, reason, onChange }: { field: SmartField; labelKey: string; selected: string[]; context: Fsos360QueryInput; disabled?: boolean; reason?: string | null; onChange: (values: string[]) => void }) {
  const { t } = useTranslation();
  const tr = (key: string, params?: Record<string, string | number>) => t(key as never, params);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<string[]>(selected);
  useEffect(() => { if (!open) { setSearch(""); setPage(1); } }, [open]);
  useEffect(() => { if (!open) setDraft(selected); }, [selected, open]);
  const options = useQuery({ queryKey: ["fsos-360", "filter-options", field, search, page, context.filters, context.analysisFocus], queryFn: () => fsos360Api.filterOptions({ field, query: search, page, pageSize: 40, context }), enabled: open && !disabled, placeholderData: (previous) => previous });
  const toggle = (value: string) => setDraft((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  function handleOpenChange(next: boolean) { if (next) setDraft(selected); setOpen(next); }
  function apply() { onChange(draft); setOpen(false); }
  return <DropdownMenu.Root open={open} onOpenChange={handleOpenChange}><DropdownMenu.Trigger asChild><button type="button" disabled={disabled} title={reason ?? undefined} className={cn("flex h-10 min-w-36 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50", selected.length > 0 && "border-primary/50 bg-primary/5")}><span className="min-w-0 flex-1 truncate text-start">{tr(labelKey)}</span>{selected.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{selected.length}</span>}<ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="start" side="bottom" sideOffset={6} collisionPadding={12} className="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl"><label className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={tr("fsos360.search")} className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label><div className="mt-2 max-h-64 overflow-y-auto overscroll-contain">{options.isLoading ? <div className="flex justify-center p-5"><Spinner className="h-4 w-4" /></div> : options.data?.availability !== "available" ? <p className="p-3 text-xs text-muted-foreground">{tr("fsos360.unavailable")}</p> : options.data?.options.length ? options.data.options.map((option) => { const active = draft.includes(option.value); return <button key={option.value} type="button" onClick={() => toggle(option.value)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-secondary/60"><span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input", active && "border-primary bg-primary")}>{active && <Check className="h-3 w-3 text-primary-foreground" />}</span><span className="min-w-0 flex-1 truncate">{option.label}</span></button>; }) : <p className="p-3 text-xs text-muted-foreground">{tr("fsos360.noResults")}</p>}</div><div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2"><button type="button" onClick={() => setDraft([])} disabled={!draft.length} className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50">{tr("fsos360.clear")}</button><div className="flex items-center gap-1"><button type="button" className="rounded px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{tr("fsos360.previous")}</button><button type="button" className="rounded px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50" disabled={!options.data?.hasMore} onClick={() => setPage((value) => value + 1)}>{tr("fsos360.next")}</button><button type="button" onClick={apply} className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90">{tr("fsos360.apply")}</button></div></div></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}