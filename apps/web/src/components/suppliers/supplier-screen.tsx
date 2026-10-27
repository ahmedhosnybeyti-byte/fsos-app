"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Plus, RefreshCw, RotateCcw } from "lucide-react";
import {
  getCompanyFeatureAccessState, supportsSfaOperations, WMS_OPERATION_PERMISSIONS,
  type WmsOperation, type WmsReceipt, type WmsReturnDocument,
} from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { wmsApi } from "@/lib/api/wms";
import { wmsOperationsApi as api } from "@/lib/api/wms-operations";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ErrorBox, Field, HandlingNote, Pager, Search, quantity, unitLabel, type Text } from "../wms/shared";
import { operationQueryOptions as options } from "../wms/operation-editors";
import { operationText } from "../wms/operation-labels";
import { SupplierReceiptEditor, SupplierReturnEditor, SupplierReturnAction } from "./supplier-editors";
import { SupplierDirectory } from "./supplier-directory";
import { printSupplierDocument } from "./supplier-document-print";

// All data comes from the existing company/warehouse-scoped WMS endpoints.
// Never traverse result pages to manufacture global indicators.
export function SupplierScreen({ initialWarehouseId = "", initialTab = "receipts" }: { initialWarehouseId?: string; initialTab?:"receipts"|"returns" }) {
  const { user, isLoading } = useAuth();
  const { t, locale } = useTranslation();
  const company = user?.companyId;
  const allowed = !!company && user?.role.code !== "SUPER_ADMIN"
    && getCompanyFeatureAccessState(user?.featureAccess, "warehouse-core") === "ENABLED"
    && ["sfa.access", "wms.read"].every(p => user?.permissions?.includes(p));
  const mode = useQuery({ queryKey: ["sfa-mode", company], queryFn: sfaSetupApi.mode, enabled: allowed, ...options });
  const enabled = allowed && supportsSfaOperations(mode.data?.operatingMode);
  const [warehouse, setWarehouse] = useState(initialWarehouseId);
  const [page, setPage] = useState(1);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const warehouses = useQuery({
    queryKey: ["wms", company, "warehouses", page, search],
    queryFn: () => wmsApi.warehouses(page, search), enabled, ...options,
  });
  if (isLoading || (allowed && mode.isPending)) return <Skeleton className="h-64" />;
  if (!enabled) return <Card><CardHeader><CardTitle>{t("suppliers.title")}</CardTitle></CardHeader><CardContent>
    {mode.isError ? <ErrorBox error={mode.error} retry={() => void mode.refetch()} t={t} />
      : t("wms.warehouse_requires_sfa_mode_screen_activation_and_explicit_permissions_no_company_")}
  </CardContent></Card>;
  return <div dir={locale === "ar" ? "rtl" : "ltr"} className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><PackageCheck className="h-7 w-7 shrink-0 text-primary" />{t("suppliers.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("suppliers.subtitle")}</p></div>
      <Button asChild variant="outline"><Link href="/sfa/warehouse">{t("suppliers.back")}</Link></Button>
    </header>
    <Card><CardContent className="pt-4 sm:pt-6"><details open={!warehouse}>
      <summary className="cursor-pointer rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t("wms.warehouse_scope")}{warehouse && <> · {warehouses.data?.items.find(w => w.id === warehouse)?.name ?? t("wms.warehouse_scope")}</>}
      </summary>
      <div className="mt-4 space-y-3"><Search id="supplier-warehouse-search" value={input} onChange={setInput}
        onSearch={() => { setSearch(input.trim()); setPage(1); }} t={t} />
        {warehouses.isPending ? <Skeleton className="h-20" /> : warehouses.isError
          ? <ErrorBox error={warehouses.error} retry={() => void warehouses.refetch()} t={t} />
          : <><div className="flex flex-wrap gap-2">{warehouses.data.items.map(w => <Button key={w.id}
            variant={warehouse === w.id ? "default" : "outline"} aria-pressed={warehouse === w.id}
            onClick={() => setWarehouse(w.id)}>{w.name} · <bdi>{w.code}</bdi></Button>)}</div>
            {!warehouses.data.items.length && <p className="text-sm text-muted-foreground">{t("wms.no_matching_authorized_warehouses_ask_your_administrator_to_configure_a_warehouse_")}</p>}
            <Pager page={page} hasMore={warehouses.data.hasMore} busy={warehouses.isFetching} onChange={setPage} t={t} /></>}
      </div>
    </details></CardContent></Card>
    {warehouse ? <SupplierWorkspace key={company + warehouse} warehouse={warehouse} company={company!}
      initialTab={initialTab}
      warehouseName={warehouses.data?.items.find(w => w.id === warehouse)?.name}
      permissions={user?.role.code === "COMPANY_ADMIN" ? [] : user?.permissions ?? []} t={t} locale={locale} />
      : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("wms.choose_a_warehouse_to_begin")}</CardContent></Card>}
  </div>;
}

function SupplierWorkspace({ warehouse, warehouseName, company, permissions, t, locale, initialTab }: {
  warehouse: string; warehouseName?:string; company: string; permissions: string[]; t: Text; locale: string; initialTab:"receipts"|"returns";
}) {
  const client = useQueryClient();
  const [tab, setTab] = useState<"receipts" | "returns">(initialTab);
  const [page, setPage] = useState(1), [input, setInput] = useState(""), [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<"create" | "edit" | null>(null);
  const [action, setAction] = useState<WmsOperation | null>(null);
  const [printBlocked, setPrintBlocked] = useState(false);
  const prefix = ["wms", company, warehouse];
  const receipts = useQuery({
    queryKey: [...prefix, "documents", "receipts", page, search],
    queryFn: () => api.list(warehouse, "receipts", page, search), enabled: tab === "receipts", ...options,
  });
  const returns = useQuery({
    queryKey: [...prefix, "returns", "SUPPLIER", page, search],
    queryFn: () => api.returns(warehouse, "SUPPLIER", page, search), enabled: tab === "returns", ...options,
  });
  const receipt = useQuery({
    queryKey: [...prefix, "receipt", selected], queryFn: () => api.receipt(warehouse, selected!),
    enabled: tab === "receipts" && !!selected, ...options,
  });
  const returned = useQuery({
    queryKey: [...prefix, "return", selected], queryFn: () => api.returnDocument(warehouse, selected!),
    enabled: tab === "returns" && !!selected, ...options,
  });
  const list = tab === "receipts" ? receipts : returns;
  const detail = tab === "receipts" ? receipt : returned;
  const rows = list.data?.items ?? [];
  const can = (op: WmsOperation) => permissions.includes(WMS_OPERATION_PERMISSIONS[op]);
  const canCreate = can(tab === "receipts" ? "receipt.create" : "supplier.create");
  const refresh = () => client.invalidateQueries({ queryKey: prefix });
  function changeTab(value: typeof tab) {
    setTab(value); setPage(1); setInput(""); setSearch(""); setSelected(null); setEditor(null); setAction(null); setPrintBlocked(false);
  }
  const actions: WmsOperation[] = tab === "receipts"
    ? receiptActions(receipt.data?.status)
    : returnActions(returned.data?.status);
  const canEdit = editor === "edit" && tab === "receipts" && can("receipt.edit") && receipt.data?.status === "DRAFT";
  if (editor && (editor === "create" ? canCreate : canEdit)) return tab === "receipts"
    ? <SupplierReceiptEditor warehouse={warehouse} warehouseName={warehouseName} company={company} t={t}
      receipt={editor === "edit" ? receipt.data : undefined} onClose={() => setEditor(null)} onSaved={setSelected} />
    : <SupplierReturnEditor warehouse={warehouse} warehouseName={warehouseName} company={company} kind="SUPPLIER" t={t} onClose={() => setEditor(null)} onSaved={setSelected} />;
  return <section className="min-w-0 space-y-4">
    <SupplierDirectory warehouse={warehouse} company={company} t={t}/>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label={t("suppliers.title")} className="flex flex-wrap gap-2">
        <Button variant={tab === "receipts" ? "default" : "outline"} aria-pressed={tab === "receipts"} onClick={() => changeTab("receipts")}><PackageCheck className="h-4 w-4" />{t("suppliers.receipts")}</Button>
        <Button variant={tab === "returns" ? "default" : "outline"} aria-pressed={tab === "returns"} onClick={() => changeTab("returns")}><RotateCcw className="h-4 w-4" />{t("suppliers.returns")}</Button>
      </nav>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={list.isFetching} onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />{t("procurement.refresh")}</Button>
        {canCreate && <Button onClick={() => { setSelected(null); setEditor("create"); }}><Plus className="h-4 w-4" />{t(tab === "receipts" ? "wms.new_receipt" : "wms.new_supplier_return")}</Button>}
      </div>
    </div>
    <div aria-live="polite" className="space-y-2"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(["suppliers.documents", "wms.draft", "suppliers.pending", "suppliers.completed"] as const).map((key, i) => <Card key={key}><CardContent className="pt-4 sm:pt-6">
        <p className="text-xs text-muted-foreground">{t(key)}</p>
        {list.isPending ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold tabular-nums">
          {list.isError ? "—" : new Intl.NumberFormat(locale).format(i === 0 ? rows.length : rows.filter(r => i === 1
            ? r.status === "DRAFT" : i === 2 ? ["SUBMITTED", "REVIEWED"].includes(r.status)
              : ["POSTED", "DISPATCHED", "COMPLETED"].includes(r.status)).length)}
        </p>}
      </CardContent></Card>)}
    </div><p className="text-xs text-muted-foreground">{t("suppliers.pageScope")}</p></div>
    <Card><CardHeader><CardTitle>{t(tab === "receipts" ? "suppliers.receipts" : "suppliers.returns")}</CardTitle></CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(input.trim()); setSelected(null); }}>
          <div className="min-w-0 flex-1"><Field id="supplier-document-search" label={t("suppliers.search")}><Input id="supplier-document-search" value={input} maxLength={80} onChange={e => setInput(e.target.value)} /></Field></div>
          <Button type="submit" variant="outline">{t("wms.search")}</Button>
        </form>
        {list.isPending ? <Skeleton className="h-56" /> : list.isError ? <ErrorBox error={list.error} retry={() => void list.refetch()} t={t} />
          : <>{!rows.length ? <div className="py-10 text-center"><PackageCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("suppliers.empty")}</p></div>
            : <Table><TableHeader><TableRow><TableHead>{t(tab === "receipts" ? "wms.receipt_reference" : "wms.return_reference")}</TableHead><TableHead>{t("wms.supplier")}</TableHead>
              <TableHead>{t(tab === "receipts" ? "suppliers.created" : "wms.source")}</TableHead><TableHead>{t("suppliers.status")}</TableHead><TableHead><span className="sr-only">{t("suppliers.open")}</span></TableHead>
            </TableRow></TableHeader><TableBody>{tab === "receipts" ? receipts.data?.items.map(d => <TableRow key={d.id}>
              <TableCell><bdi className="font-semibold">{d.reference}</bdi></TableCell><TableCell>{d.supplierName}</TableCell>
              <TableCell><time dateTime={d.createdAt}>{new Date(d.createdAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB", { calendar: "gregory" })}</time></TableCell>
              <TableCell><DocumentStatus status={d.status} t={t} />{d.partial && <Badge variant="warning">{t("wms.partial_receipt")}</Badge>}</TableCell>
              <TableCell><Button size="sm" variant="outline" aria-label={t("suppliers.open") + " " + d.reference} onClick={() => setSelected(d.id)}>{t("suppliers.open")}</Button></TableCell>
            </TableRow>) : returns.data?.items.map(d => <TableRow key={d.id}>
              <TableCell><bdi className="font-semibold">{d.reference}</bdi></TableCell><TableCell>{d.partyName}</TableCell><TableCell><bdi>{d.sourceReference}</bdi></TableCell>
              <TableCell><DocumentStatus status={d.status} t={t} /></TableCell>
              <TableCell><Button size="sm" variant="outline" aria-label={t("suppliers.open") + " " + d.reference} onClick={() => setSelected(d.id)}>{t("suppliers.open")}</Button></TableCell>
            </TableRow>)}</TableBody></Table>}
            <Pager page={page} hasMore={list.data?.hasMore ?? false} busy={list.isFetching} onChange={p => { setPage(p); setSelected(null); }} t={t} /></>}
      </CardContent></Card>
    <p className="text-xs text-muted-foreground">{t("suppliers.attachmentsDeferred")}</p>
    {selected && !editor && <Card>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{detail.data?.reference ?? t("suppliers.open")}</CardTitle>
        <Button variant="outline" onClick={()=>setSelected(null)}>{t("common.close")}</Button></div>
        <p className="text-sm text-muted-foreground">{t(tab === "receipts" ? "suppliers.receipts" : "suppliers.returns")}</p></CardHeader><CardContent>
        {detail.isPending ? <Skeleton className="h-64" /> : detail.isError ? <ErrorBox error={detail.error} retry={() => void detail.refetch()} t={t} />
          : detail.data && <div className="space-y-4">
            <DocumentStatus status={detail.data.status} t={t} />
            {tab === "receipts" && receipt.data ? <ReceiptLines doc={receipt.data} t={t} /> : returned.data && <ReturnLines doc={returned.data} t={t} />}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={()=>setPrintBlocked(!printSupplierDocument(detail.data!,tab==="receipts"?"receipt":"return",warehouseName??warehouse,t,locale))}>{t("suppliers.print.document")}</Button>
              {tab === "receipts" && receipt.data?.status === "DRAFT" && can("receipt.edit") && <Button variant="outline" onClick={() => setEditor("edit")}>{t("wms.edit_draft")}</Button>}
              {actions.filter(can).map(op => <Button key={op} variant={op.endsWith("cancel") || op.endsWith("reverse") || op.endsWith("return-draft") ? "outline" : "default"} onClick={() => setAction(op)}>{operationText(op, t)}</Button>)}
            </div>
            {printBlocked&&<p role="alert" className="text-sm text-destructive">{t("suppliers.print.blocked")}</p>}
            {tab === "returns" && <p className="text-xs text-muted-foreground">{t("suppliers.returnCorrectionUnavailable")}</p>}
            <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm font-semibold">{t("wms.workflow_ledger_latest_20_events")}</summary>
              <ol className="mt-3 space-y-3">{detail.data.events.map(e => <li key={e.id} className="border-s-2 border-primary/30 ps-3 text-xs">
                <p>{operationText(e.operation, t)} · {e.actorName}</p><p className="mt-1 break-words text-muted-foreground">{e.note}</p>
                <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB", { calendar: "gregory" })}</time>
              </li>)}</ol>
            </details>
          </div>}
      </CardContent>
    </Card>}
    {action && can(action) && (tab === "receipts" && receipt.data
      ? <ReceiptAction key={action + receipt.data.id} operation={action} doc={receipt.data} warehouse={warehouse} company={company} t={t} onClose={() => setAction(null)} />
      : returned.data && <SupplierReturnAction key={action + returned.data.id} operation={action} doc={returned.data} warehouse={warehouse} company={company} t={t} onClose={() => setAction(null)} />)}
  </section>;
}

export function receiptActions(status?: string): WmsOperation[] {
  switch (status) {
    case "DRAFT": return ["receipt.submit", "receipt.cancel"];
    case "SUBMITTED": return ["receipt.review", "receipt.return-draft", "receipt.cancel"];
    case "REVIEWED": return ["receipt.approve", "receipt.return-draft", "receipt.cancel"];
    case "POSTED": return ["receipt.reverse"];
    default: return [];
  }
}
export function returnActions(status?: string): WmsOperation[] {
  switch (status) {
    case "DRAFT": return ["supplier.submit", "supplier.cancel"];
    case "SUBMITTED": return ["supplier.review", "supplier.cancel"];
    case "REVIEWED": return ["supplier.post", "supplier.cancel"];
    case "DISPATCHED": return ["supplier.confirm"];
    default: return [];
  }
}
function DocumentStatus({ status, t }: { status: string; t: Text }) {
  return <Badge variant={["POSTED", "DISPATCHED", "COMPLETED"].includes(status) ? "success"
    : ["SUBMITTED", "REVIEWED"].includes(status) ? "warning" : "secondary"}>{operationText(status, t)}</Badge>;
}
function ReceiptLines({ doc, t }: { doc: WmsReceipt; t: Text }) {
  return <div className="space-y-3"><p className="text-sm">{doc.supplierName} · <bdi>{doc.supplierReference}</bdi></p>
    {doc.documentDate && <p className="text-sm text-muted-foreground">{t("suppliers.documentDate")}: <bdi>{doc.documentDate}</bdi></p>}
    {doc.partial && <p className="text-sm text-warning">{t("wms.partial_delivery_undelivered_quantities_never_enter_stock")}</p>}
    {doc.lines.map(l => <Card key={l.id}><CardContent className="space-y-3 pt-4 sm:pt-6"><h3 className="font-semibold">{l.productName}</h3>
      <HandlingNote sensitive={l.sensitiveHandling} note={l.handlingNotes} t={t} />
      <p className="text-xs text-muted-foreground">{l.batchCode ?? t("wms.untracked_lot")} · {l.expiryDate ?? t("wms.no_expiry")}</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[
        [t("wms.expected"), l.expectedQuantity], [t("wms.accepted_9dcee13"), l.acceptedQuantity],
        [t("wms.quarantined_6909176"), l.quarantinedQuantity], [t("wms.rejected_629eb74"), l.rejectedQuantity],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm tabular-nums">{quantity(value)} {l.unit === "CARTON" ? t("wms.carton") : unitLabel(l.baseUnit, t)}</dd></div>)}</dl>
      {l.rejectionReason && <p className="text-xs">{l.rejectionReason}</p>}
    </CardContent></Card>)}
  </div>;
}
function ReturnLines({ doc, t }: { doc: WmsReturnDocument; t: Text }) {
  return <div className="space-y-3"><p className="text-sm">{doc.partyName} · <bdi>{doc.sourceReference}</bdi></p>
    <p className="break-words text-sm text-muted-foreground">{doc.reason}</p>
    {doc.handoverReference && <p className="text-sm">{t("wms.handover_confirmation")}: <bdi>{doc.handoverReference}</bdi></p>}
    {doc.lines.map(l => <Card key={l.id}><CardContent className="space-y-2 pt-4 sm:pt-6"><h3 className="font-semibold">{l.productName} · {l.batchCode}</h3>
      <HandlingNote sensitive={l.sensitiveHandling} note={l.handlingNotes} t={t} />
      <p className="text-sm">{t("wms.declared_actual")}: {quantity(l.declaredQuantity)} / {quantity(l.actualQuantity)} {l.unit === "CARTON" ? t("wms.carton") : unitLabel(l.baseUnit, t)}</p>
      <Badge variant="outline">{t(l.quality === "GOOD" ? "wms.good_eligibility_checked" : l.quality === "DAMAGED" ? "wms.damaged" : l.quality === "EXPIRED" ? "wms.expired" : "wms.quarantined")}</Badge>
      {l.destination && <Badge variant={l.destination === "QUARANTINED" ? "warning" : "secondary"}>{t(l.destination === "AVAILABLE" ? "wms.to_available" : l.destination === "QUARANTINED" ? "wms.to_quarantine" : "wms.to_supplier")}</Badge>}
      {l.fromQuarantine && <Badge variant="warning">{t("wms.from_quarantine")}</Badge>}
      {l.discrepancyReason && <p className="text-xs text-warning">{l.discrepancyReason}</p>}
    </CardContent></Card>)}
  </div>;
}
function ReceiptAction({ operation, doc, warehouse, company, t, onClose }: {
  operation: WmsOperation; doc: WmsReceipt; warehouse: string; company: string; t: Text; onClose: () => void;
}) {
  const client = useQueryClient();
  const [note, setNote] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: () => api.command(warehouse, operation, { id: doc.id, version: doc.version, note, idempotencyKey: key }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["wms", company] }); onClose(); },
  });
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>{operationText(operation, t)}</DialogTitle><DialogDescription>{doc.reference} · {operationText(doc.status, t)}</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (confirmed) mutation.mutate(); }}>
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <Field id="supplier-receipt-action-note" label={t("wms.action_note_and_reason")}><Input id="supplier-receipt-action-note" required minLength={3} maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></Field>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 accent-primary" />{t("wms.i_reviewed_the_document_and_quantities_and_confirm_this_action")}</label>
      </fieldset>
      {mutation.isError && <ErrorBox error={mutation.error} t={t} />}
      <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>{t("wms.cancel")}</Button>
        <Button type="submit" disabled={mutation.isPending || !confirmed}>{mutation.isPending ? t("wms.applying") : operationText(operation, t)}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
