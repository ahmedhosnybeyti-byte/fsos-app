"use client";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { wmsReceiptInputSchema, wmsReceiptEditSchema, wmsReturnInputSchema, type WmsReceipt, type WmsReturnKind, type WmsReturnDocument, type WmsReturnSource, type WmsReturnSourceLine, type WmsOperation } from "@field-sales-os/schemas";
import { wmsOperationsApi as api } from "@/lib/api/wms-operations";
import { wmsApi } from "@/lib/api/wms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Choice, Field, Pager, ErrorBox, unitLabel, HandlingNote, quantity, type Text } from "../wms/shared";
import { operationQueryOptions, type OpsProduct } from "../wms/operation-editors";
import { operationText } from "../wms/operation-labels";
import { SupplierPicker } from "./supplier-picker";
import { SupplierQuantityFields, draftValue, zeroQuantity, type QuantityDraft } from "./supplier-quantity-fields";
import { decimalSum, fromRecordedQuantity, receiptQuantityError } from "./supplier-quantities";

function InvoiceSection({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return <Card><CardContent className="pt-4 sm:pt-6"><details open={open}>
    <summary className="cursor-pointer rounded-md text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{title}</summary>
    <div className="mt-4 space-y-4">{children}</div>
  </details></CardContent></Card>;
}
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function savedQuantity(value: string, unit: "BASE" | "CARTON", product: { baseUnit: string; piecesPerCarton: number }): QuantityDraft {
  if (product.baseUnit !== "PIECE") return { ...zeroQuantity(), base: value };
  return { ...(fromRecordedQuantity(value, unit, product.piecesPerCarton) ?? { cartons: "", pieces: "" }), base: "0" };
}

export function SupplierProductSearch({ warehouse, company, onChoose, t, disabled = false }: {
  warehouse: string; company: string; onChoose: (product: OpsProduct) => void; t: Text; disabled?: boolean;
}) {
  const [input, setInput] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [scan, setScan] = useState<string | null>(null);
  const products = useQuery({ queryKey: ["wms", company, warehouse, "supplier-products", page, search], queryFn: () => wmsApi.products(warehouse, page, search), ...operationQueryOptions });
  useEffect(() => {
    if (!scan || products.isFetching || !products.data || search !== scan || disabled) return;
    const matches = products.data.items.filter(product => product.isActive && product.barcode === scan);
    if (matches.length === 1) { onChoose(matches[0]!); setInput(""); }
    setScan(null);
  }, [scan, search, products.data, products.isFetching, disabled, onChoose]);
  const lookup = () => { setSearch(input.trim()); setPage(1); setScan(input.trim() || null); };
  return <section className="space-y-3" aria-label={t("suppliers.productSearch")}>
    <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field id="supplier-product-search" label={t("suppliers.productSearch")}>
      <Input id="supplier-product-search" value={input} maxLength={80} disabled={disabled} placeholder={t("suppliers.productSearchHint")} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }} />
    </Field></div><Button type="button" variant="outline" disabled={disabled || products.isFetching} onClick={lookup}>{t("wms.search")}</Button></div>
    <p className="text-xs text-muted-foreground">{t("suppliers.barcodeHint")}</p>
    {products.isPending ? <Skeleton className="h-24" /> : products.isError ? <ErrorBox error={products.error} retry={() => void products.refetch()} t={t} /> : <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{products.data.items.filter(p => p.isActive).map(p => <Button key={p.id} type="button" variant="outline" className="h-auto min-h-11 justify-start whitespace-normal py-3 text-start" disabled={disabled} onClick={() => onChoose(p)}>
        <span><span className="block font-semibold">{p.name}</span><bdi className="mt-1 block text-xs text-muted-foreground">{p.code}</bdi></span>
      </Button>)}</div>{!products.data.items.some(p => p.isActive) && <p className="text-sm text-muted-foreground">{t("suppliers.noProducts")}</p>}
      <Pager page={page} hasMore={products.data.hasMore} busy={products.isFetching} onChange={setPage} t={t} />
    </>}
  </section>;
}

type ReceiptDraft = {
  key: string; product: OpsProduct; batchId: string | null; batchCode: string; productionDate: string; expiryDate: string;
  expected: QuantityDraft; accepted: QuantityDraft; held: QuantityDraft; rejected: QuantityDraft; rejectionReason: string;
};
export function SupplierReceiptEditor({ warehouse, warehouseName, company, receipt, onClose, onSaved, t, procurement }: {
  warehouse: string; warehouseName?: string; company: string; receipt?: WmsReceipt; procurement?: { save: (body: unknown) => Promise<{ id: string }> };
  onClose: () => void; onSaved: (id: string) => void; t: Text;
}) {
  const client = useQueryClient();
  const [reference, setReference] = useState(receipt?.reference ?? ""), [supplierName, setSupplierName] = useState(receipt?.supplierName ?? "");
  const [supplierId, setSupplierId] = useState(receipt?.supplierId ?? ""), [supplierReference, setSupplierReference] = useState(receipt?.supplierReference ?? "");
  const [documentDate, setDocumentDate] = useState(receipt?.documentDate ?? today());
  const [note, setNote] = useState(""), [invalid, setInvalid] = useState(false), [key] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState<ReceiptDraft[]>(() => receipt?.lines.map(l => {
    const product: OpsProduct = { id: l.productId, code: l.productCode, name: l.productName, category: l.category, baseUnit: l.baseUnit as OpsProduct["baseUnit"], piecesPerCarton: l.piecesPerCarton, trackBatches: l.trackBatches, trackExpiry: l.trackExpiry, sensitiveHandling: l.sensitiveHandling ?? false, handlingNotes: l.handlingNotes ?? null };
    return { key: l.id, product, batchId: l.batchId, batchCode: l.batchCode ?? "", productionDate: l.productionDate ?? "", expiryDate: l.expiryDate ?? "", expected: savedQuantity(l.expectedQuantity, l.unit, product), accepted: savedQuantity(l.acceptedQuantity, l.unit, product), held: savedQuantity(l.quarantinedQuantity, l.unit, product), rejected: savedQuantity(l.rejectedQuantity, l.unit, product), rejectionReason: l.rejectionReason };
  }) ?? []);
  const update = (key: string, patch: Partial<ReceiptDraft>) => setLines(rows => rows.map(l => l.key === key ? { ...l, ...patch } : l));
  const linePayload = (l: ReceiptDraft) => ({ productId: l.product.id, batchId: l.batchId, batchCode: l.batchId ? null : l.batchCode || null, productionDate: l.batchId ? null : l.productionDate || null, expiryDate: l.batchId ? null : l.expiryDate || null, unit: "BASE" as const, expectedQuantity: draftValue(l.expected, l.product.baseUnit, l.product.piecesPerCarton) ?? "", acceptedQuantity: draftValue(l.accepted, l.product.baseUnit, l.product.piecesPerCarton) ?? "", quarantinedQuantity: draftValue(l.held, l.product.baseUnit, l.product.piecesPerCarton) ?? "", rejectedQuantity: draftValue(l.rejected, l.product.baseUnit, l.product.piecesPerCarton) ?? "", rejectionReason: l.rejectionReason });
  const body = () => ({ reference, supplierName, supplierReference, lines: lines.map(linePayload), note: note || "Receiving document", idempotencyKey: key,
    ...(!procurement ? { documentDate, ...(supplierId ? { supplierId } : {}) } : {}), ...(receipt && !procurement ? { id: receipt.id, version: receipt.version } : {}) });
  const mutation = useMutation({ mutationFn: () => procurement ? procurement.save(body()) : api.command(warehouse, receipt ? "receipt.edit" : "receipt.create", body()), onSuccess: async result => {
    await client.invalidateQueries({ queryKey: ["wms", company] }); onSaved(result.id); if (!procurement) onClose();
  } });
  function save(event: FormEvent) {
    event.preventDefault();
    const parsed = (receipt && !procurement ? wmsReceiptEditSchema : wmsReceiptInputSchema).safeParse(body());
    const valid = parsed.success && lines.every(l => { const p = linePayload(l); return !receiptQuantityError(p.expectedQuantity, p.acceptedQuantity, p.quarantinedQuantity, p.rejectedQuantity, p.rejectionReason); });
    setInvalid(!valid); if (valid) mutation.mutate();
  }
  function add(product: OpsProduct) {
    if (lines.length >= 20) return;
    setLines(rows => [...rows, { key: crypto.randomUUID(), product, batchId: null, batchCode: "", productionDate: "", expiryDate: "", expected: zeroQuantity(), accepted: zeroQuantity(), held: zeroQuantity(), rejected: zeroQuantity(), rejectionReason: "" }]);
  }
  return <section className="min-w-0 space-y-4" aria-label={t("wms.receive_goods")}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{t(receipt && !procurement ? "wms.edit_receiving_draft" : "wms.receive_goods")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("suppliers.draftSafety")}</p></div><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("wms.cancel")}</Button></div>
    <form onSubmit={save} className="space-y-4"><fieldset disabled={mutation.isPending} className="min-w-0 space-y-4">
      <InvoiceSection title={t("suppliers.documentHeader")}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field id="receipt-reference" label={t("wms.receipt_reference")}><Input id="receipt-reference" required maxLength={80} value={reference} onChange={e => setReference(e.target.value)} /></Field>
          <Field id="receipt-supplier-reference" label={t("wms.supplier_reference")}><Input id="receipt-supplier-reference" required readOnly={!!procurement} maxLength={80} value={supplierReference} onChange={e => setSupplierReference(e.target.value)} /></Field>
          <Field id="receipt-date" label={t("suppliers.documentDate")}><Input id="receipt-date" type="date" required readOnly={!!procurement} value={documentDate} onChange={e => setDocumentDate(e.target.value)} /></Field>
          <Field id="receipt-warehouse" label={t("wms.warehouse_scope")}><Input id="receipt-warehouse" readOnly value={warehouseName ?? warehouse} /></Field></div>
        {procurement ? <Field id="receipt-supplier" label={t("wms.supplier")}><Input id="receipt-supplier" readOnly value={supplierName} /></Field>
          : <SupplierPicker warehouse={warehouse} company={company} value={supplierId} currentName={supplierName} onChoose={supplier => { setSupplierId(supplier.id); setSupplierName(supplier.name); }} t={t} disabled={mutation.isPending} />}
      </InvoiceSection>
      {!procurement && <InvoiceSection title={t("suppliers.addProducts")}><SupplierProductSearch warehouse={warehouse} company={company} onChoose={add} t={t} disabled={lines.length >= 20 || mutation.isPending} />{lines.length >= 20 && <p className="text-sm text-muted-foreground">{t("suppliers.receiptLineLimit")}</p>}</InvoiceSection>}
      <InvoiceSection title={t("suppliers.selectedProducts") + ` (${lines.length})`}>
        {!lines.length && <p className="py-6 text-center text-sm text-muted-foreground">{t("suppliers.selectProductsHint")}</p>}
        {lines.map((l, index) => <article key={l.key} className="space-y-4 rounded-lg border border-border/60 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{index + 1}. {l.product.name}</h3><bdi className="text-xs text-muted-foreground">{l.product.code}</bdi></div><Button type="button" variant="ghost" size="sm" onClick={() => setLines(rows => rows.filter(row => row.key !== l.key))}>{t("wms.remove_line")}</Button></div>
          <HandlingNote sensitive={l.product.sensitiveHandling} note={l.product.handlingNotes} t={t} />
          <div className="grid gap-4 lg:grid-cols-2"><SupplierQuantityFields id={`receipt-expected-${l.key}`} label={t("wms.expected_quantity")} value={l.expected} onChange={expected => update(l.key, { expected })} baseUnit={l.product.baseUnit} factor={l.product.piecesPerCarton} t={t} />
            <SupplierQuantityFields id={`receipt-accepted-${l.key}`} label={t("wms.accepted")} value={l.accepted} onChange={accepted => update(l.key, { accepted })} baseUnit={l.product.baseUnit} factor={l.product.piecesPerCarton} t={t} /></div>
          <details open={draftValue(l.held, l.product.baseUnit, l.product.piecesPerCarton) !== "0" || draftValue(l.rejected, l.product.baseUnit, l.product.piecesPerCarton) !== "0"}>
            <summary className="cursor-pointer rounded text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring">{t("suppliers.optionalQuality")}</summary><div className="mt-3 space-y-3"><div className="grid gap-4 lg:grid-cols-2">
              <SupplierQuantityFields id={`receipt-held-${l.key}`} label={t("wms.quarantined")} value={l.held} onChange={held => update(l.key, { held })} baseUnit={l.product.baseUnit} factor={l.product.piecesPerCarton} t={t} />
              <SupplierQuantityFields id={`receipt-rejected-${l.key}`} label={t("wms.rejected")} value={l.rejected} onChange={rejected => update(l.key, { rejected })} baseUnit={l.product.baseUnit} factor={l.product.piecesPerCarton} t={t} /></div>
              <Field id={`receipt-reason-${l.key}`} label={t("wms.quarantine_rejection_reason")}><Input id={`receipt-reason-${l.key}`} maxLength={300} value={l.rejectionReason} onChange={e => update(l.key, { rejectionReason: e.target.value })} /></Field></div>
          </details>
          {l.product.trackBatches && (l.batchId ? <p className="text-xs text-muted-foreground">{t("wms.existing_lot")}: <bdi>{l.batchCode}</bdi> · <bdi>{l.expiryDate}</bdi></p> : <div className="grid gap-3 sm:grid-cols-3">
            <Field id={`receipt-lot-${l.key}`} label={t("wms.lot_code")}><Input id={`receipt-lot-${l.key}`} required maxLength={80} value={l.batchCode} onChange={e => update(l.key, { batchCode: e.target.value })} /></Field>
            <Field id={`receipt-production-${l.key}`} label={t("wms.production_date_if_known")}><Input id={`receipt-production-${l.key}`} type="date" value={l.productionDate} onChange={e => update(l.key, { productionDate: e.target.value })} /></Field>
            <Field id={`receipt-expiry-${l.key}`} label={t("wms.expiry_date")}><Input id={`receipt-expiry-${l.key}`} type="date" required={l.product.trackExpiry} value={l.expiryDate} onChange={e => update(l.key, { expiryDate: e.target.value })} /></Field></div>)}
        </article>)}
      </InvoiceSection>
      <InvoiceSection title={t("suppliers.documentSummary")}>
        <ReceiptSummary lines={lines} t={t} />
        <Field id="receipt-note" label={t("wms.document_note")}><Input id="receipt-note" maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></Field>
        <p className="text-xs text-muted-foreground">{t("wms.partial_accepted_quarantined_rejected_is_less_than_expected_the_next_delivery_uses")}</p>
      </InvoiceSection>
    </fieldset>
    {invalid && <p role="alert" className="glass-card p-3 text-sm text-destructive">{t("suppliers.invalidReceipt")}</p>}{mutation.isError && <ErrorBox error={mutation.error} t={t} />}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("wms.cancel")}</Button><Button type="submit" disabled={mutation.isPending}>{t(mutation.isPending ? "wms.saving" : "wms.save_receipt_draft")}</Button></div>
    </form>
  </section>;
}
function ReceiptSummary({ lines, t }: { lines: ReceiptDraft[]; t: Text }) {
  return <div className="space-y-3"><p className="text-sm font-semibold">{t("suppliers.selectedProducts")}: <bdi>{lines.length}</bdi></p>
    {(["PIECE", "KG", "LITRE"] as const).filter(unit => lines.some(l => l.product.baseUnit === unit)).map(unit => <dl key={unit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(["expected", "accepted", "held", "rejected"] as const).map((field, index) => <div key={field}><dt className="text-xs text-muted-foreground">{t(["wms.expected_quantity", "wms.accepted", "wms.quarantined", "wms.rejected"][index] as Parameters<Text>[0])}</dt><dd className="mt-1 text-sm font-semibold tabular-nums"><bdi>{decimalSum(lines.filter(l => l.product.baseUnit === unit).map(l => draftValue(l[field], unit, l.product.piecesPerCarton) ?? "")) ?? "—"}</bdi> {unitLabel(unit, t)}</dd></div>)}
    </dl>)}
  </div>;
}

function qualityText(value: string, t: Text) { return value === "GOOD" ? t("wms.good_eligibility_checked") : value === "DAMAGED" ? t("wms.damaged") : value === "EXPIRED" ? t("wms.expired") : t("wms.quarantined"); }
type ReturnDraft = { source: WmsReturnSourceLine; declared: QuantityDraft; actual: QuantityDraft; quality: "GOOD" | "DAMAGED" | "EXPIRED" | "QUARANTINED"; fromQuarantine: boolean; discrepancyReason: string };
export function SupplierReturnEditor({ warehouse, warehouseName, company, kind, t, onClose, onSaved }: {
  warehouse: string; warehouseName?: string; company: string; kind: WmsReturnKind; t: Text; onClose: () => void; onSaved: (id: string) => void;
}) {
  const client = useQueryClient(), [page, setPage] = useState(1), [search, setSearch] = useState(""), [input, setInput] = useState("");
  const [sourceId, setSourceId] = useState(""), [reference, setReference] = useState(""), [note, setNote] = useState(""), [lines, setLines] = useState<ReturnDraft[]>([]), [invalid, setInvalid] = useState(false), [key] = useState(() => crypto.randomUUID());
  const sources = useQuery({ queryKey: ["wms", company, warehouse, "return-sources", kind, page, search], queryFn: () => api.returnSources(warehouse, kind, page, search), ...operationQueryOptions });
  const source = useQuery({ queryKey: ["wms", company, warehouse, "return-source", kind, sourceId], queryFn: () => api.returnSource(warehouse, kind, sourceId), enabled: !!sourceId, ...operationQueryOptions });
  const body = () => ({ reference, sourceId, note, idempotencyKey: key, lines: lines.map(l => ({ sourceLineId: l.source.sourceLineId, declaredQuantity: draftValue(l.declared, l.source.baseUnit, l.source.piecesPerCarton) ?? "", actualQuantity: draftValue(l.actual, l.source.baseUnit, l.source.piecesPerCarton) ?? "", unit: "BASE", quality: l.quality, fromQuarantine: l.fromQuarantine, discrepancyReason: l.discrepancyReason })) });
  const mutation = useMutation({ mutationFn: () => api.command(warehouse, kind === "SUPPLIER" ? "supplier.create" : "rep-return.create", body()), onSuccess: async result => { await client.invalidateQueries({ queryKey: ["wms", company] }); onSaved(result.id); onClose(); } });
  const update = (id: string, patch: Partial<ReturnDraft>) => setLines(rows => rows.map(l => l.source.sourceLineId === id ? { ...l, ...patch } : l));
  const lookup = () => { setSearch(input.trim()); setPage(1); };
  return <section className="min-w-0 space-y-4" aria-label={t("wms.new_supplier_return")}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{t(kind === "SUPPLIER" ? "wms.new_supplier_return" : "wms.new_rep_return")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("wms.choose_the_original_document_and_lot_stock_changes_only_after_review_and_posting")}</p></div><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("wms.cancel")}</Button></div>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); const parsed = wmsReturnInputSchema.safeParse(body()); const valid = parsed.success && lines.every(l => { const declared = draftValue(l.declared, l.source.baseUnit, l.source.piecesPerCarton); const actual = draftValue(l.actual, l.source.baseUnit, l.source.piecesPerCarton); return declared === actual || l.discrepancyReason.trim().length >= 3; }); setInvalid(!valid); if (valid) mutation.mutate(); }}>
      <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4"><InvoiceSection title={t("suppliers.documentHeader")}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Field id="return-reference" label={t("wms.return_reference")}><Input id="return-reference" required maxLength={80} value={reference} onChange={e => setReference(e.target.value)} /></Field><Field id="return-created-date" label={t("suppliers.creationDate")}><Input id="return-created-date" type="date" readOnly value={today()} /></Field><Field id="return-warehouse" label={t("wms.warehouse_scope")}><Input id="return-warehouse" readOnly value={warehouseName ?? warehouse} /></Field></div>
        <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field id="return-source-search" label={t("suppliers.search")}><Input id="return-source-search" maxLength={80} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }} /></Field></div><Button type="button" variant="outline" onClick={lookup}>{t("wms.search")}</Button></div>
        {sources.isPending ? <Skeleton className="h-16" /> : sources.isError ? <ErrorBox error={sources.error} retry={() => void sources.refetch()} t={t} /> : <><Field id="return-source" label={t("wms.source_document")}><Choice id="return-source" value={sourceId} onChange={value => { setSourceId(value); setLines([]); }} options={sources.data.items.map(s => ({ value: s.id, label: `${s.reference} · ${s.partyName}` }))} /></Field><Pager page={page} hasMore={sources.data.hasMore} busy={sources.isFetching} onChange={setPage} t={t} /></>}
        {source.data && <p className="text-sm font-semibold">{t("wms.supplier")}: {source.data.partyName} · <bdi>{source.data.reference}</bdi></p>}
      </InvoiceSection>
      <InvoiceSection title={t("suppliers.sourceProducts")}>{!sourceId ? <p className="text-sm text-muted-foreground">{t("suppliers.chooseSourceFirst")}</p> : source.isPending ? <Skeleton className="h-20" /> : source.isError ? <ErrorBox error={source.error} retry={() => void source.refetch()} t={t} /> : <SourceLines source={source.data} lines={lines} add={s => setLines(rows => [...rows, { source: s, declared: zeroQuantity(), actual: zeroQuantity(), quality: "GOOD", fromQuarantine: false, discrepancyReason: "" }])} t={t} />}</InvoiceSection>
      <InvoiceSection title={t("suppliers.selectedProducts") + ` (${lines.length})`}>{!lines.length && <p className="py-6 text-center text-sm text-muted-foreground">{t("suppliers.selectReturnHint")}</p>}
        {lines.map(l => <article key={l.source.sourceLineId} className="space-y-4 rounded-lg border border-border/60 p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">{l.source.productName}</h3><bdi className="text-xs text-muted-foreground">{l.source.batchCode}</bdi></div><Button type="button" variant="ghost" size="sm" onClick={() => setLines(rows => rows.filter(row => row.source.sourceLineId !== l.source.sourceLineId))}>{t("wms.remove_line")}</Button></div>
          <HandlingNote sensitive={l.source.sensitiveHandling} note={l.source.handlingNotes} t={t} />
          <div className="grid gap-4 lg:grid-cols-2"><SupplierQuantityFields id={`return-declared-${l.source.sourceLineId}`} label={t("wms.declared_quantity")} value={l.declared} onChange={declared => update(l.source.sourceLineId, { declared })} baseUnit={l.source.baseUnit} factor={l.source.piecesPerCarton} t={t} /><SupplierQuantityFields id={`return-actual-${l.source.sourceLineId}`} label={t("wms.actual_returned_quantity")} value={l.actual} onChange={actual => update(l.source.sourceLineId, { actual })} baseUnit={l.source.baseUnit} factor={l.source.piecesPerCarton} t={t} /></div>
          <details><summary className="cursor-pointer rounded text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring">{t("suppliers.optionalQuality")}</summary><div className="mt-3 space-y-3"><Field id={`return-quality-${l.source.sourceLineId}`} label={t("wms.quality_condition")}><Choice id={`return-quality-${l.source.sourceLineId}`} value={l.quality} onChange={quality => update(l.source.sourceLineId, { quality: quality as ReturnDraft["quality"] })} options={["GOOD", "DAMAGED", "EXPIRED", "QUARANTINED"].map(value => ({ value, label: qualityText(value, t) }))} /></Field>
          {kind === "SUPPLIER" && <div className="flex items-center justify-between gap-3"><Label htmlFor={`return-held-${l.source.sourceLineId}`}>{t("wms.withdraw_from_quarantine")}</Label><Switch id={`return-held-${l.source.sourceLineId}`} checked={l.fromQuarantine} onCheckedChange={fromQuarantine => update(l.source.sourceLineId, { fromQuarantine })} /></div>}</div></details>
          <Field id={`return-reason-${l.source.sourceLineId}`} label={t("wms.reason_for_any_declared_actual_difference")}><Input id={`return-reason-${l.source.sourceLineId}`} maxLength={300} value={l.discrepancyReason} onChange={e => update(l.source.sourceLineId, { discrepancyReason: e.target.value })} /></Field>
        </article>)}
      </InvoiceSection>
      <InvoiceSection title={t("suppliers.documentSummary")}><p className="text-sm font-semibold">{t("suppliers.selectedProducts")}: <bdi>{lines.length}</bdi></p>
        {(["PIECE", "KG", "LITRE"] as const).filter(unit => lines.some(l => l.source.baseUnit === unit)).map(unit => <p key={unit} className="text-sm">{t("wms.actual_returned_quantity")}: <bdi>{decimalSum(lines.filter(l => l.source.baseUnit === unit).map(l => draftValue(l.actual, unit, l.source.piecesPerCarton) ?? "")) ?? "—"}</bdi> {unitLabel(unit, t)}</p>)}
        <Field id="return-note" label={t("wms.return_reason")}><Input id="return-note" required minLength={3} maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></Field><p className="text-xs text-muted-foreground">{t("suppliers.draftSafety")}</p>
      </InvoiceSection></fieldset>
      {invalid && <p role="alert" className="glass-card p-3 text-sm text-destructive">{t("wms.check_source_units_positive_quantities_and_reason_add_at_least_one_line")}</p>}{mutation.isError && <ErrorBox error={mutation.error} t={t} />}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("wms.cancel")}</Button><Button type="submit" disabled={mutation.isPending}>{t(mutation.isPending ? "wms.saving" : "wms.save_return_draft")}</Button></div>
    </form>
  </section>;
}
function SourceLines({ source, lines, add, t }: { source: WmsReturnSource; lines: ReturnDraft[]; add: (source: WmsReturnSourceLine) => void; t: Text }) {
  return <div className="space-y-2">{source.lines.map(s => <div key={s.sourceLineId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3"><div className="min-w-0 space-y-1 text-xs"><p className="text-sm font-semibold">{s.productName}</p><p><bdi>{s.batchCode}</bdi> · <bdi>{s.expiryDate ?? t("wms.no_expiry")}</bdi></p><p>{t("wms.source_remaining_available_held_custody")}: <bdi>{quantity(s.remainingBase)} / {quantity(s.available)} / {quantity(s.quarantined)} / {quantity(s.custody)}</bdi> {unitLabel(s.baseUnit, t)}</p></div><Button type="button" size="sm" variant="outline" disabled={lines.length >= 20 || lines.some(l => l.source.sourceLineId === s.sourceLineId)} onClick={() => add(s)}>{t("wms.add_to_return")}</Button></div>)}</div>;
}
export function SupplierReturnAction({doc,operation,warehouse,company,t,onClose}:{doc:WmsReturnDocument;operation:WmsOperation;warehouse:string;company:string;t:Text;onClose:()=>void}){
 const client=useQueryClient(),[note,setNote]=useState(""),[handover,setHandover]=useState(""),[confirmed,setConfirmed]=useState(false),[key]=useState(()=>crypto.randomUUID());const mutation=useMutation({mutationFn:()=>api.command(warehouse,operation,{id:doc.id,version:doc.version,note,idempotencyKey:key,...(operation==="supplier.confirm"?{handoverReference:handover}:{})}),onSuccess:async()=>{await client.invalidateQueries({queryKey:["wms",company]});onClose();}});
 return <Dialog open onOpenChange={v=>{if(!v&&!mutation.isPending)onClose();}}><DialogContent><DialogHeader className="text-start"><DialogTitle>{operationText(operation,t)}</DialogTitle><DialogDescription>{doc.reference} · {doc.partyName} · {doc.sourceReference}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e=>{e.preventDefault();if(confirmed)mutation.mutate();}}><Field id="return-action-note" label={t("wms.action_reason")}><Input id="return-action-note" required minLength={3} maxLength={300} value={note} disabled={mutation.isPending} onChange={e=>setNote(e.target.value)}/></Field>{operation==="supplier.confirm"&&<Field id="supplier-handover" label={t("wms.supplier_handover_reference")}><Input id="supplier-handover" required maxLength={80} value={handover} disabled={mutation.isPending} onChange={e=>setHandover(e.target.value)}/></Field>}<div className="flex items-center justify-between gap-3"><Label htmlFor="return-action-confirm">{t("wms.i_reviewed_actual_quantities_and_lots_and_confirm_this_action")}</Label><Switch id="return-action-confirm" checked={confirmed} disabled={mutation.isPending} onCheckedChange={setConfirmed}/></div>{mutation.isError&&<ErrorBox error={mutation.error} t={t}/>}<DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("wms.cancel")}</Button><Button type="submit" disabled={!confirmed||mutation.isPending}>{operationText(operation,t)}</Button></DialogFooter></form></DialogContent></Dialog>;
}

