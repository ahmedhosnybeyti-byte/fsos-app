"use client";
import { ProductCategoryGroups } from "@/components/products/product-category-groups";
import { useState } from "react";
import { useTranslation } from "@/components/translation-provider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { wmsCountDraftSchema, type WmsCountCandidate, type WmsCountDraftInput, type WmsCountDocument } from "@field-sales-os/schemas";
import { wmsCountsApi } from "@/lib/api/wms-counts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Choice, ErrorBox, Field, Pager, stockQuantity,inputQuantity,quantity, Search, unitLabel, type Text } from "./shared";
import { operationText } from "./operation-labels";

const options = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;
type Selected = { candidate: WmsCountCandidate; countedQuantity: string; unit: "BASE" | "CARTON" };
// Integer decimal arithmetic for preview; persisted comparison is calculated in PostgreSQL.
function scaled(v: string) { const [whole = "0", part = ""] = v.split("."); return BigInt(whole) * 1000000n + BigInt(part.padEnd(6, "0")); }
function decimal(v: bigint) { const sign = v < 0n ? "-" : ""; const n = v < 0n ? -v : v; return quantity(`${sign}${n / 1000000n}.${(n % 1000000n).toString().padStart(6, "0")}`); }
function difference(line: Selected) {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(line.countedQuantity)) return null;
  const factor = BigInt(line.unit === "CARTON" ? line.candidate.piecesPerCarton : 1);
  const delta = scaled(line.countedQuantity) * factor - scaled(line.candidate.physical);
  return { value: decimal(delta / factor), base: decimal(delta), negative: delta < 0n };
}

export function WmsCountPanel({ warehouse, company, permissions, t }: { warehouse: string; company: string; permissions: string[]; t: Text }) {
  const client = useQueryClient(); const [page, setPage] = useState(1); const [creating, setCreating] = useState(false); const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["wms", company, warehouse, "counts", page], queryFn: () => wmsCountsApi.list(warehouse, page), ...options });
  const detail = useQuery({ queryKey: ["wms", company, warehouse, "count", selectedId], queryFn: () => wmsCountsApi.detail(warehouse, selectedId!), enabled: !!selectedId, ...options });
  const refresh = () => client.invalidateQueries({ queryKey: ["wms", company, warehouse] });
  return <Card id="physical-counts"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />{t("wms.physical_counts_stock_adjustments")}</CardTitle>{permissions.includes("wms.count.create") && <Button onClick={() => setCreating(true)}>{t("wms.new_physical_count")}</Button>}</div></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("wms.select_products_and_lots_then_record_the_physical_count_drafts_leave_stock_unchang")}</p>
    {list.isPending ? <Skeleton className="h-24" /> : list.isError ? <ErrorBox error={list.error} retry={() => void list.refetch()} t={t} /> : <>
      {!list.data.items.length ? <p className="text-sm text-muted-foreground">{t("wms.no_physical_counts_yet")}</p> : <ul className="divide-y divide-border">{list.data.items.map(d => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="space-y-1"><p className="text-sm font-semibold">{d.reference} <Badge variant={d.status === "POSTED" ? "success" : "secondary"}>{operationText(d.status, t)}</Badge></p><p className="text-xs text-muted-foreground">{d.reason}</p></div><Button variant="outline" onClick={() => setSelectedId(d.id)}>{t("wms.view_count_differences")}</Button></li>)}</ul>}
      <Pager page={page} hasMore={list.data.hasMore} busy={list.isFetching} onChange={setPage} t={t} /></>}
    {creating && <CountDraft warehouse={warehouse} company={company} t={t} close={() => setCreating(false)} saved={id => { setCreating(false); setSelectedId(id); void refresh(); }} />}
    {selectedId && <Dialog open onOpenChange={v => { if (!v) setSelectedId(null); }}><DialogContent className="max-w-5xl overflow-y-auto"><DialogHeader className="text-start sm:text-start"><DialogTitle>{t("wms.physical_count_document")}</DialogTitle><DialogDescription>{t("wms.compare_quantities_and_review_the_reason_before_approval")}</DialogDescription></DialogHeader>
      {detail.isPending ? <Skeleton className="h-40" /> : detail.isError ? <ErrorBox error={detail.error} retry={() => void detail.refetch()} t={t} /> : <CountDetail key={detail.data.id} document={detail.data} warehouse={warehouse} permissions={permissions} t={t} refresh={() => void refresh()} />}
    </DialogContent></Dialog>}
  </CardContent></Card>;
}

function CountDraft({ warehouse, company, t, close, saved }: { warehouse: string; company: string; t: Text; close: () => void; saved: (id: string) => void }) {
  const [page, setPage] = useState(1), [searchInput, setSearchInput] = useState(""), [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selected[]>([]), [reference, setReference] = useState(""), [reason, setReason] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const candidates = useQuery({ queryKey: ["wms", company, warehouse, "count-candidates", page, search], queryFn: () => wmsCountsApi.candidates(warehouse, page, search), ...options });
  const create = useMutation({ mutationFn: (body: WmsCountDraftInput) => wmsCountsApi.create(warehouse, body), onSuccess: r => saved(r.id) });
  const body = { reference, reason, idempotencyKey: key, lines: selected.map(l => ({ batchId: l.candidate.batchId, revision: l.candidate.revision, countedQuantity: l.countedQuantity, unit: l.unit })) };
  const valid = wmsCountDraftSchema.safeParse(body).success;
  const change = (index: number, patch: Partial<Selected>) => { setSelected(selected.map((l, i) => i === index ? { ...l, ...patch } : l)); setKey(crypto.randomUUID()); };
  return <Dialog open onOpenChange={v => { if (!v && !create.isPending) close(); }}><DialogContent className="max-w-5xl overflow-y-auto"><DialogHeader className="text-start sm:text-start"><DialogTitle>{t("wms.record_a_physical_count")}</DialogTitle><DialogDescription>{t("wms.count_the_entire_lot_inside_the_warehouse_up_to_20_lots_per_document_zero_means_no")}</DialogDescription></DialogHeader>
    <fieldset disabled={create.isPending} className="space-y-4 min-w-0">
      <div className="grid gap-4 sm:grid-cols-2"><Field id="count-reference" label={t("wms.count_reference")}><Input id="count-reference" value={reference} maxLength={80} onChange={e => { setReference(e.target.value); setKey(crypto.randomUUID()); }} /></Field><Field id="count-reason" label={t("wms.count_reason")}><Input id="count-reason" value={reason} maxLength={300} onChange={e => { setReason(e.target.value); setKey(crypto.randomUUID()); }} /></Field></div>
      <Search embedded id="count-search" value={searchInput} onChange={setSearchInput} onSearch={() => { setSearch(searchInput.trim()); setPage(1); }} t={t} />
      {candidates.isPending ? <Skeleton className="h-28" /> : candidates.isError ? <ErrorBox error={candidates.error} retry={() => void candidates.refetch()} t={t} /> : <><div className="max-h-52 overflow-y-auto divide-y divide-border">{!candidates.data.items.length && <p className="py-3 text-sm text-muted-foreground">{t("wms.no_matching_warehouse_lots")}</p>}<ProductCategoryGroups items={candidates.data.items} search={search} containerAs="ul" contentClassName="divide-y divide-border" renderItem={c => <li key={c.batchId} className="flex items-center justify-between gap-2 py-2 text-sm"><div>{c.productCode} · {c.productName}<p className="text-xs text-muted-foreground">{c.batchCode === "__UNTRACKED__" ? t("wms.untracked_lot") : c.batchCode} · {stockQuantity(c.physical,c.piecesPerCarton,c.baseUnit,t)}{c.expiryDate && <> · {c.expiryDate}</>}</p></div><Button size="sm" variant="outline" disabled={selected.length >= 20 || selected.some(l => l.candidate.batchId === c.batchId)} onClick={() => { setSelected([...selected, { candidate: c, countedQuantity: "", unit: c.baseUnit === "PIECE" ? "CARTON" : "BASE" }]); setKey(crypto.randomUUID()); }}>{t("wms.select")}</Button></li>}/></div><Pager page={page} hasMore={candidates.data.hasMore} busy={candidates.isFetching} onChange={setPage} t={t} /></>}
      <ProductCategoryGroups items={selected} categoryOf={l=>l.candidate.category} renderItem={(l, i) => { const delta = difference(l), c = l.candidate; return <div key={c.batchId} className="glass-card space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{c.productCode} · {c.productName} · {c.batchCode === "__UNTRACKED__" ? "—" : c.batchCode}</p><Button variant="ghost" size="sm" onClick={() => { setSelected(selected.filter((_, j) => j !== i)); setKey(crypto.randomUUID()); }}>{t("wms.remove")}</Button></div><div className="grid gap-3 sm:grid-cols-3"><Field id={`count-qty-${i}`} label={t("wms.physically_counted")}><Input id={`count-qty-${i}`} inputMode="decimal" maxLength={19} value={l.countedQuantity} onChange={e => change(i, { countedQuantity: e.target.value })} /></Field><Field id={`count-unit-${i}`} label={t("wms.count_unit")}><Choice id={`count-unit-${i}`} value={l.unit} onChange={v => change(i, { unit: v as Selected["unit"], countedQuantity: "" })} options={c.baseUnit === "PIECE" ? [{value:"CARTON",label:t("wms.carton")}] : [{value:"BASE",label:unitLabel(c.baseUnit,t)}]} /></Field><div className="space-y-1 text-sm"><p className="text-muted-foreground">{t("wms.system_stock")}: {quantity(l.unit === "CARTON" ? c.physicalCartons! : c.physical)} {l.unit === "CARTON" ? t("wms.cartons") : unitLabel(c.baseUnit, t)}</p>{delta && <p className={delta.negative ? "text-destructive" : "text-success"}>{t("wms.difference")}: <span dir="ltr">{delta.value}</span> · {delta.base === "0" ? t("wms.matched") : delta.negative ? t("wms.shortage") : t("wms.surplus")}</p>}</div></div><p className="text-xs text-muted-foreground">{t("wms.reserved_quarantined")}: {stockQuantity(c.reserved,c.piecesPerCarton,c.baseUnit,t)} / {stockQuantity(c.quarantined,c.piecesPerCarton,c.baseUnit,t)}</p></div>; }}/>
      <p className="text-xs text-muted-foreground">{t("wms.saving_leaves_stock_unchanged_stock_movement_after_counting_requires_cancelling_th")}</p>
      {create.isError && <ErrorBox error={create.error} t={t} />}<Button disabled={!valid || create.isPending} onClick={() => create.mutate(body)}>{create.isPending ? t("wms.saving") : t("wms.save_draft_without_changing_stock")}</Button>
    </fieldset>
  </DialogContent></Dialog>;
}

function CountMobileLines({ lines, t }: { lines: WmsCountDocument["lines"]; t: Text }) {
  return <div className="space-y-3 sm:hidden"><ProductCategoryGroups items={lines} containerAs="ul" contentClassName="space-y-3" renderItem={l => <li key={l.id} className="glass-card space-y-3 p-3">
    <p className="text-sm font-semibold">{l.productCode} · {l.productName}</p>
    <p className="text-xs text-muted-foreground">{l.batchCode === "__UNTRACKED__" ? t("wms.untracked_lot") : l.batchCode} · {t("wms.carton")}</p>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">{t("wms.system_stock")}</dt><dd className="font-semibold tabular-nums">{inputQuantity(l.systemQuantity,l.unit,l.piecesPerCarton,l.baseUnit,t)}</dd></div>
      <div><dt className="text-muted-foreground">{t("wms.counted")}</dt><dd className="font-semibold tabular-nums">{inputQuantity(l.countedQuantity,l.unit,l.piecesPerCarton,l.baseUnit,t)}</dd></div>
      <div><dt className="text-muted-foreground">{t("wms.shortage_cfaa998")}</dt><dd className="font-semibold tabular-nums text-destructive">{inputQuantity(l.shortage,l.unit,l.piecesPerCarton,l.baseUnit,t)}</dd></div>
      <div><dt className="text-muted-foreground">{t("wms.surplus_8eea844")}</dt><dd className="font-semibold tabular-nums text-success">{inputQuantity(l.surplus,l.unit,l.piecesPerCarton,l.baseUnit,t)}</dd></div>
    </dl>{l.movementId && <Badge variant="success">{t("wms.adjustment_posted")}</Badge>}
  </li>}/></div>;
}

function CountDetail({ document: d, warehouse, permissions, t, refresh }: { document: WmsCountDocument; warehouse: string; permissions: string[]; t: Text; refresh: () => void }) {
  const {locale}=useTranslation();
  const [reason, setReason] = useState(""), [key, setKey] = useState(() => crypto.randomUUID());
  const mutation = useMutation({ mutationFn: (action: "approve" | "cancel") => wmsCountsApi.step(warehouse, d.id, action, { version: d.version, reason, idempotencyKey: key }), onSuccess: () => { setReason(""); setKey(crypto.randomUUID()); refresh(); } });
  return <div className="min-w-0 space-y-4"><p className="font-semibold">{d.reference} <Badge variant={d.status === "POSTED" ? "success" : "secondary"}>{operationText(d.status, t)}</Badge></p><p className="break-words text-sm text-muted-foreground">{d.reason}</p>
    <CountMobileLines lines={d.lines} t={t} /><div className="hidden sm:block"><ProductCategoryGroups items={d.lines} renderGroup={entries=><Table><TableHeader><TableRow>{[t("wms.product_lot"), t("wms.unit"), t("wms.system"), t("wms.counted"), t("wms.shortage_cfaa998"), t("wms.surplus_8eea844"), t("wms.adjustment")].map(v => <TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{entries.map(({item,index})=>(l => <TableRow key={l.id}><TableCell>{l.productCode} · {l.productName}<p className="text-xs text-muted-foreground">{l.batchCode === "__UNTRACKED__" ? "—" : l.batchCode}</p></TableCell><TableCell>{t("wms.carton")}</TableCell><TableCell>{inputQuantity(l.systemQuantity,l.unit,l.piecesPerCarton,l.baseUnit,t)}</TableCell><TableCell>{inputQuantity(l.countedQuantity,l.unit,l.piecesPerCarton,l.baseUnit,t)}</TableCell><TableCell className="text-destructive">{inputQuantity(l.shortage,l.unit,l.piecesPerCarton,l.baseUnit,t)}</TableCell><TableCell className="text-success">{inputQuantity(l.surplus,l.unit,l.piecesPerCarton,l.baseUnit,t)}</TableCell><TableCell className="text-xs"><span title={l.movementId ?? undefined}>{l.movementId ? t("wms.posted") : "—"}</span></TableCell></TableRow>)(item))}</TableBody></Table>}/></div>
    {d.status === "DRAFT" && (permissions.includes("wms.count.approve") || permissions.includes("wms.count.create")) && <div className="space-y-3"><Field id="count-approval-reason" label={t("wms.reason_for_approving_differences_or_cancelling_draft")}><Input id="count-approval-reason" maxLength={300} disabled={mutation.isPending} value={reason} onChange={e => { setReason(e.target.value); setKey(crypto.randomUUID()); }} /></Field><div className="flex flex-wrap gap-2">{permissions.includes("wms.count.approve") && <Button disabled={reason.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate("approve")}>{t("wms.approve_differences_post_adjustment")}</Button>}{permissions.includes("wms.count.create") && <Button variant="outline" disabled={reason.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate("cancel")}>{t("wms.cancel_draft")}</Button>}</div><p className="text-xs text-muted-foreground">{t("wms.approval_changes_warehouse_stock_with_one_movement_per_differing_lot_vehicle_custo")}</p></div>}
    {mutation.isError && <ErrorBox error={mutation.error} retry={refresh} t={t} />}
    <p className="font-semibold text-sm">{t("wms.approval_history")}</p><ul className="space-y-2">{d.events.map(e => <li key={e.id} className="glass-card p-3 text-sm"><p>{e.action === "CREATE" ? t("wms.draft_saved") : e.action === "APPROVE" ? t("wms.approved_posted") : t("wms.cancelled")} · {e.actorName}</p><p className="break-words text-xs text-muted-foreground">{e.reason} · <time>{new Date(e.createdAt).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB")}</time></p></li>)}</ul>
  </div>;
}
