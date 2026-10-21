"use client";
import { useState } from "react";
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
import { Choice, ErrorBox, Field, Pager, quantity, Search, unitLabel, type Text } from "./shared";
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
  return <Card id="physical-counts"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />{t("الجرد الفعلي والتسويات المخزنية", "Physical counts & stock adjustments")}</CardTitle>{permissions.includes("wms.count.create") && <Button onClick={() => setCreating(true)}>{t("جرد جديد", "New physical count")}</Button>}</div></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("اختر الأصناف والتشغيلات وسجّل العدّ الفعلي. لا يتغير الرصيد بحفظ المسودة؛ ترحّل الفروقات مرة واحدة فقط عند الاعتماد. الجرد للكمية الموجودة بالمستودع ولا يشمل عهدة السيارات.", "Select products and lots, then record the physical count. Drafts leave stock unchanged; approval posts differences once. Counts cover warehouse stock and exclude vehicle custody.")}</p>
    {list.isPending ? <Skeleton className="h-24" /> : list.isError ? <ErrorBox error={list.error} retry={() => void list.refetch()} t={t} /> : <>
      {!list.data.items.length ? <p className="text-sm text-muted-foreground">{t("لا توجد مستندات جرد بعد.", "No physical counts yet.")}</p> : <ul className="divide-y divide-border">{list.data.items.map(d => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="space-y-1"><p className="text-sm font-semibold">{d.reference} <Badge variant={d.status === "POSTED" ? "success" : "secondary"}>{operationText(d.status, t)}</Badge></p><p className="text-xs text-muted-foreground">{d.reason}</p></div><Button variant="outline" onClick={() => setSelectedId(d.id)}>{t("عرض الجرد والفروقات", "View count & differences")}</Button></li>)}</ul>}
      <Pager page={page} hasMore={list.data.hasMore} busy={list.isFetching} onChange={setPage} t={t} /></>}
    {creating && <CountDraft warehouse={warehouse} company={company} t={t} close={() => setCreating(false)} saved={id => { setCreating(false); setSelectedId(id); void refresh(); }} />}
    {selectedId && <Dialog open onOpenChange={v => { if (!v) setSelectedId(null); }}><DialogContent className="max-w-5xl overflow-y-auto"><DialogHeader className="text-start sm:text-start"><DialogTitle>{t("مستند الجرد", "Physical count document")}</DialogTitle><DialogDescription>{t("قارن الكميات وراجع السبب قبل الاعتماد.", "Compare quantities and review the reason before approval.")}</DialogDescription></DialogHeader>
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
  return <Dialog open onOpenChange={v => { if (!v && !create.isPending) close(); }}><DialogContent className="max-w-5xl overflow-y-auto"><DialogHeader className="text-start sm:text-start"><DialogTitle>{t("تسجيل جرد فعلي", "Record a physical count")}</DialogTitle><DialogDescription>{t("احسب كامل رصيد التشغيلة داخل المستودع. الحد الأقصى 20 تشغيلة للمستند؛ الصفر يعني عدم العثور على الكمية.", "Count the entire lot inside the warehouse. Up to 20 lots per document; zero means no stock found.")}</DialogDescription></DialogHeader>
    <fieldset disabled={create.isPending} className="space-y-4 min-w-0">
      <div className="grid gap-4 sm:grid-cols-2"><Field id="count-reference" label={t("مرجع الجرد", "Count reference")}><Input id="count-reference" value={reference} maxLength={80} onChange={e => { setReference(e.target.value); setKey(crypto.randomUUID()); }} /></Field><Field id="count-reason" label={t("سبب الجرد", "Count reason")}><Input id="count-reason" value={reason} maxLength={300} onChange={e => { setReason(e.target.value); setKey(crypto.randomUUID()); }} /></Field></div>
      <Search embedded id="count-search" value={searchInput} onChange={setSearchInput} onSearch={() => { setSearch(searchInput.trim()); setPage(1); }} t={t} />
      {candidates.isPending ? <Skeleton className="h-28" /> : candidates.isError ? <ErrorBox error={candidates.error} retry={() => void candidates.refetch()} t={t} /> : <><ul className="max-h-52 overflow-y-auto divide-y divide-border">{!candidates.data.items.length && <li className="py-3 text-sm text-muted-foreground">{t("لا توجد تشغيلات مطابقة بالمستودع.", "No matching warehouse lots.")}</li>}{candidates.data.items.map(c => <li key={c.batchId} className="flex items-center justify-between gap-2 py-2 text-sm"><div>{c.productCode} · {c.productName}<p className="text-xs text-muted-foreground">{c.batchCode === "__UNTRACKED__" ? t("دون تتبع تشغيلة", "Untracked lot") : c.batchCode} · {quantity(c.physical)} {unitLabel(c.baseUnit, t)}{c.physicalCartons !== null && <> · {quantity(c.physicalCartons)} {t("كرتونة", "cartons")}</>}{c.expiryDate && <> · {c.expiryDate}</>}</p></div><Button size="sm" variant="outline" disabled={selected.length >= 20 || selected.some(l => l.candidate.batchId === c.batchId)} onClick={() => { setSelected([...selected, { candidate: c, countedQuantity: "", unit: c.baseUnit === "PIECE" ? "CARTON" : "BASE" }]); setKey(crypto.randomUUID()); }}>{t("اختيار", "Select")}</Button></li>)}</ul><Pager page={page} hasMore={candidates.data.hasMore} busy={candidates.isFetching} onChange={setPage} t={t} /></>}
      <div className="space-y-3">{selected.map((l, i) => { const delta = difference(l), c = l.candidate; return <div key={c.batchId} className="glass-card space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{c.productCode} · {c.productName} · {c.batchCode === "__UNTRACKED__" ? "—" : c.batchCode}</p><Button variant="ghost" size="sm" onClick={() => { setSelected(selected.filter((_, j) => j !== i)); setKey(crypto.randomUUID()); }}>{t("إزالة", "Remove")}</Button></div><div className="grid gap-3 sm:grid-cols-3"><Field id={`count-qty-${i}`} label={t("المعدود فعليًا", "Physically counted")}><Input id={`count-qty-${i}`} inputMode="decimal" maxLength={19} value={l.countedQuantity} onChange={e => change(i, { countedQuantity: e.target.value })} /></Field><Field id={`count-unit-${i}`} label={t("وحدة العدّ", "Count unit")}><Choice id={`count-unit-${i}`} value={l.unit} onChange={v => change(i, { unit: v as Selected["unit"], countedQuantity: "" })} options={[{ value: "BASE", label: unitLabel(c.baseUnit, t) }, ...(c.baseUnit === "PIECE" ? [{ value: "CARTON", label: `${t("كرتونة", "Carton")} × ${c.piecesPerCarton}` }] : [])]} /></Field><div className="space-y-1 text-sm"><p className="text-muted-foreground">{t("رصيد النظام", "System stock")}: {quantity(l.unit === "CARTON" ? c.physicalCartons! : c.physical)} {l.unit === "CARTON" ? t("كرتونة", "cartons") : unitLabel(c.baseUnit, t)}</p>{delta && <p className={delta.negative ? "text-destructive" : "text-success"}>{t("الفرق", "Difference")}: <span dir="ltr">{delta.value}</span> · {delta.base === "0" ? t("مطابق", "Matched") : delta.negative ? t("عجز", "Shortage") : t("زيادة", "Surplus")}</p>}</div></div><p className="text-xs text-muted-foreground">{t("المحجوز / المحجور", "Reserved / quarantined")}: {quantity(c.reserved)} / {quantity(c.quarantined)} {unitLabel(c.baseUnit, t)}</p></div>; })}</div>
      <p className="text-xs text-muted-foreground">{t("الحفظ لا يغيّر الرصيد. إذا تحرك المخزون بعد العدّ، يُرفض الاعتماد ويلزم إلغاء المسودة وإعادة العدّ. العجز لا يمكن أن يستهلك المحجوز أو المحجور.", "Saving leaves stock unchanged. Stock movement after counting requires cancelling the draft and recounting. Shortages cannot consume reserved or quarantined stock.")}</p>
      {create.isError && <ErrorBox error={create.error} t={t} />}<Button disabled={!valid || create.isPending} onClick={() => create.mutate(body)}>{create.isPending ? t("جارٍ الحفظ…", "Saving…") : t("حفظ مسودة دون تغيير الرصيد", "Save draft without changing stock")}</Button>
    </fieldset>
  </DialogContent></Dialog>;
}

function CountMobileLines({ lines, t }: { lines: WmsCountDocument["lines"]; t: Text }) {
  return <ul className="space-y-3 sm:hidden">{lines.map(l => <li key={l.id} className="glass-card space-y-3 p-3">
    <p className="text-sm font-semibold">{l.productCode} · {l.productName}</p>
    <p className="text-xs text-muted-foreground">{l.batchCode === "__UNTRACKED__" ? t("دون تتبع تشغيلة", "Untracked lot") : l.batchCode} · {l.unit === "CARTON" ? `${t("كرتونة", "Carton")} × ${l.conversionFactor}` : unitLabel(l.baseUnit, t)}</p>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">{t("رصيد النظام", "System stock")}</dt><dd className="font-semibold tabular-nums">{quantity(l.systemQuantity)}</dd></div>
      <div><dt className="text-muted-foreground">{t("المعدود", "Counted")}</dt><dd className="font-semibold tabular-nums">{quantity(l.countedQuantity)}</dd></div>
      <div><dt className="text-muted-foreground">{t("العجز", "Shortage")}</dt><dd className="font-semibold tabular-nums text-destructive">{quantity(l.shortage)}</dd></div>
      <div><dt className="text-muted-foreground">{t("الزيادة", "Surplus")}</dt><dd className="font-semibold tabular-nums text-success">{quantity(l.surplus)}</dd></div>
    </dl>{l.movementId && <Badge variant="success">{t("التسوية مرحّلة", "Adjustment posted")}</Badge>}
  </li>)}</ul>;
}

function CountDetail({ document: d, warehouse, permissions, t, refresh }: { document: WmsCountDocument; warehouse: string; permissions: string[]; t: Text; refresh: () => void }) {
  const [reason, setReason] = useState(""), [key, setKey] = useState(() => crypto.randomUUID());
  const mutation = useMutation({ mutationFn: (action: "approve" | "cancel") => wmsCountsApi.step(warehouse, d.id, action, { version: d.version, reason, idempotencyKey: key }), onSuccess: () => { setReason(""); setKey(crypto.randomUUID()); refresh(); } });
  return <div className="min-w-0 space-y-4"><p className="font-semibold">{d.reference} <Badge variant={d.status === "POSTED" ? "success" : "secondary"}>{operationText(d.status, t)}</Badge></p><p className="break-words text-sm text-muted-foreground">{d.reason}</p>
    <CountMobileLines lines={d.lines} t={t} /><div className="hidden sm:block"><Table><TableHeader><TableRow>{[t("الصنف / التشغيلة", "Product / lot"), t("الوحدة", "Unit"), t("النظام", "System"), t("المعدود", "Counted"), t("العجز", "Shortage"), t("الزيادة", "Surplus"), t("حركة التسوية", "Adjustment")].map(v => <TableHead key={v}>{v}</TableHead>)}</TableRow></TableHeader><TableBody>{d.lines.map(l => <TableRow key={l.id}><TableCell>{l.productCode} · {l.productName}<p className="text-xs text-muted-foreground">{l.batchCode === "__UNTRACKED__" ? "—" : l.batchCode}</p></TableCell><TableCell>{l.unit === "CARTON" ? `${t("كرتونة", "Carton")} × ${l.conversionFactor}` : unitLabel(l.baseUnit, t)}</TableCell><TableCell>{quantity(l.systemQuantity)}</TableCell><TableCell>{quantity(l.countedQuantity)}</TableCell><TableCell className="text-destructive">{quantity(l.shortage)}</TableCell><TableCell className="text-success">{quantity(l.surplus)}</TableCell><TableCell className="text-xs"><span title={l.movementId ?? undefined}>{l.movementId ? t("مرحّلة", "Posted") : "—"}</span></TableCell></TableRow>)}</TableBody></Table></div>
    {d.status === "DRAFT" && (permissions.includes("wms.count.approve") || permissions.includes("wms.count.create")) && <div className="space-y-3"><Field id="count-approval-reason" label={t("سبب اعتماد الفروقات أو إلغاء المسودة", "Reason for approving differences or cancelling draft")}><Input id="count-approval-reason" maxLength={300} disabled={mutation.isPending} value={reason} onChange={e => { setReason(e.target.value); setKey(crypto.randomUUID()); }} /></Field><div className="flex flex-wrap gap-2">{permissions.includes("wms.count.approve") && <Button disabled={reason.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate("approve")}>{t("اعتماد الفروقات وترحيل التسوية", "Approve differences & post adjustment")}</Button>}{permissions.includes("wms.count.create") && <Button variant="outline" disabled={reason.trim().length < 3 || mutation.isPending} onClick={() => mutation.mutate("cancel")}>{t("إلغاء المسودة", "Cancel draft")}</Button>}</div><p className="text-xs text-muted-foreground">{t("الاعتماد يغيّر رصيد المستودع فقط بحركة واحدة لكل تشغيلة ذات فرق. لا يغيّر عهدة السيارات ولا ينشئ قيدًا ماليًا.", "Approval changes warehouse stock with one movement per differing lot. Vehicle custody and financial accounts are unaffected.")}</p></div>}
    {mutation.isError && <ErrorBox error={mutation.error} retry={refresh} t={t} />}
    <p className="font-semibold text-sm">{t("سجل الاعتماد", "Approval history")}</p><ul className="space-y-2">{d.events.map(e => <li key={e.id} className="glass-card p-3 text-sm"><p>{e.action === "CREATE" ? t("حفظ مسودة", "Draft saved") : e.action === "APPROVE" ? t("اعتماد وترحيل", "Approved & posted") : t("إلغاء", "Cancelled")} · {e.actorName}</p><p className="break-words text-xs text-muted-foreground">{e.reason} · <time>{new Date(e.createdAt).toLocaleString(t("ar-SA", "en-GB"))}</time></p></li>)}</ul>
  </div>;
}
