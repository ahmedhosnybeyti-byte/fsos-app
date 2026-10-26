"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Save } from "lucide-react";
import { saveVisitExecutionSchema, visitFailureReasons, visitGoals, visitOutcomes, visitPhotoKinds, type SaveVisitExecution, type VisitExecution, type VisitExecutionPhoto } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { visitExecutionApi, type VisitExecutionContext } from "@/lib/api/visit-execution";
import { VisitCameraCapture } from "./visit-camera-capture";
import { SalesDraftsPanel } from "./sales-drafts-panel";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-4">{children}</CardContent></Card>;
}
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-semibold tabular-nums">{children}</dd></div>;
}
function Expand({ title, children }: { title: string; children: ReactNode }) {
  return <details className="rounded-md border border-border/60 p-3"><summary className="cursor-pointer rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{title}</summary><div className="mt-3 space-y-2 text-sm">{children}</div></details>;
}
export function VisitExecutionScreen({ id }: { id: string }) {
  const { user, isLoading } = useAuth();
  const { t, locale } = useTranslation();
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState(0);
  const allowed = user?.role.code === "SALES_REP" && ["sfa.access", "visits.execute"].every((p) => user.permissions?.includes(p));
  const key = ["visit-execution", user?.companyId, user?.id, id];
  const query = useQuery({ queryKey: key, queryFn: () => visitExecutionApi.read(id), enabled: !!allowed, retry: false, refetchOnWindowFocus: false });
  if (isLoading || (allowed && query.isLoading)) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  if (!allowed) return <p role="alert" className="glass-card p-4 text-destructive">{t("visit.accessDenied")}</p>;
  if (!query.data) return <div className="glass-card space-y-3 p-4"><p role="alert" className="text-destructive">{t("visit.loadError")}</p><Button variant="outline" onClick={() => query.refetch()}>{t("visit.retry")}</Button></div>;
  return <div className="mx-auto max-w-6xl space-y-4">
    <Link className="text-sm text-primary underline" href="/dashboard/visit-copilot">{t("visit.back")}</Link>
    <div className="glass-hero space-y-3 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold sm:text-3xl">{t("visit.title")}</h1><Badge>{t(`visit.${query.data.visit.status}`)}</Badge></div>
      <h2 className="text-xl font-semibold">{query.data.visit.customerName} <span className="text-sm text-muted-foreground">{query.data.visit.customerCode}</span></h2>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Detail label={t("visit.rep")}>{query.data.visit.repName}</Detail><Detail label={t("visit.source")}>{t(`visit.${query.data.visit.entrySource}`)}</Detail><Detail label={t("visit.started")}>{new Date(query.data.visit.startedAt).toLocaleString(locale)}</Detail>{query.data.visit.completedAt && <Detail label={t("visit.completed")}>{new Date(query.data.visit.completedAt).toLocaleString(locale)}</Detail>}</dl>
    </div>
    {saved && <p role="status" className="text-sm text-success">{t("visit.saved")}</p>}
    <SalesDraftsPanel visit={query.data.visit} />
    <CustomerSummary id={id} />
    <VisitForm key={`${id}:${query.data.visit.version}:${reset}`} visit={query.data.visit} photos={query.data.photos} onSaved={(visit) => { client.setQueryData(key, { ...query.data, visit }); setSaved(true); }} onPhotoSaved={() => query.refetch()} onReload={async () => { const result = await query.refetch(); if (result.isSuccess) setReset((v) => v + 1); }} />
  </div>;
}

function CustomerSummary({ id }: { id: string }) {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const query = useQuery({ queryKey: ["visit-execution-context", user?.companyId, user?.id, id, locale], queryFn: () => visitExecutionApi.context(id), retry: false, refetchOnWindowFocus: false });
  const number = (value: number | null | undefined) => value == null ? t("visit.noData") : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  if (query.isLoading) return <div className="grid gap-4 lg:grid-cols-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-56" />)}</div>;
  if (!query.data) return <div className="glass-card space-y-2 p-4"><p role="alert" className="text-sm text-destructive">{t("visit.contextError")}</p><Button variant="outline" onClick={() => query.refetch()}>{t("visit.retry")}</Button></div>;
  const data: VisitExecutionContext = query.data;
  const b = data.briefing;
  const empty = <p className="text-sm text-muted-foreground">{t("visit.noData")}</p>;
  const products = b.customer360?.soldSkus ?? b.topProducts;
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">{t("visit.period", { from: b.period.from, to: b.period.to })}</p>
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title={t("visit.collections")}><dl className="space-y-4"><Detail label={t("visit.balance")}>{t("visit.noData")}</Detail><p className="text-xs text-muted-foreground">{t("visit.balanceHint")}</p><Detail label={t("visit.lastPayment")}>{data.lastPayment ? <>{number(data.lastPayment.amount)} · <time>{data.lastPayment.date}</time></> : t("visit.noData")}</Detail><Detail label={t("visit.collectionRate")}>{t("visit.noData")}</Detail></dl><p className="text-xs text-muted-foreground">{t("visit.collectionRateHint")}</p></Section>
      <Section title={t("visit.invoices")}><dl className="space-y-4"><Detail label={t("visit.lastInvoice")}>{data.lastInvoice ? <>{data.lastInvoice.number} · {number(data.lastInvoice.amount)}<p className="mt-1 font-normal">{data.lastInvoice.date}</p></> : t("visit.noData")}</Detail><Detail label={t("visit.averageInvoice")}>{number(b.customer360?.averageInvoiceValue)}</Detail></dl><p className="text-xs text-muted-foreground">{t("visit.averageHint", { count: b.sales.invoiceCount })}</p></Section>
      <Section title={t("visit.returns")}><dl><Detail label={t("visit.returnRate")}>{b.dataAvailability.returns && b.returns.rate != null ? `${number(b.returns.rate)}%` : t("visit.noData")}</Detail></dl><p className="text-xs text-muted-foreground">{t("visit.returnHint", { sales: number(b.sales.total) })}</p><Expand title={t("visit.returnProducts")}>{data.returnProducts.length ? data.returnProducts.map((p, i) => <div key={i} className="border-b border-border/60 pb-2"><span className="font-medium">{p.productCode}</span> · {p.reason || t("visit.noData")} · {number(p.amount)}</div>) : empty}</Expand></Section>
    </div>
    <Card><CardContent className="space-y-3 pt-4 sm:pt-6">
      <Expand title={t("visit.activeProducts")}>{products.length ? products.map((p) => <p key={p.productCode}>{p.productName} <span className="text-muted-foreground">({p.productCode})</span></p>) : empty}</Expand>
      <Expand title={t("visit.stoppedProducts")}><p className="text-xs text-muted-foreground">{t("visit.stoppedHint")}</p>{b.customer360?.lostSkus.length ? b.customer360.lostSkus.map((p) => <p key={p.productCode}>{p.productName} ({p.productCode})</p>) : empty}</Expand>
      <Expand title={t("visit.opportunities")}>{b.missingProducts.length ? b.missingProducts.map((p) => <p key={p.productCode}>{p.productName}</p>) : empty}</Expand>
      <Expand title={t("visit.notesHistory")}><h4 className="font-medium">{t("visit.previousNotes")}</h4>{data.previousNotes.length ? data.previousNotes.map((n) => <div key={n.id} className="border-b border-border/60 pb-2"><time className="text-xs text-muted-foreground">{new Date(n.startedAt).toLocaleDateString(locale)}</time><p className="whitespace-pre-wrap break-words">{n.notes}</p></div>) : empty}<h4 className="pt-2 font-medium">{t("visit.importedNotes")}</h4>{data.importedNotes.length ? data.importedNotes.map((n) => <div key={n.id} className="border-b border-border/60 pb-2"><time className="text-xs text-muted-foreground">{n.date}</time><p className="whitespace-pre-wrap break-words">{n.notes}</p></div>) : empty}</Expand>
    </CardContent></Card>
  </div>;
}

type FormState = Pick<SaveVisitExecution, "goal" | "notes" | "outcome" | "failureReason" | "reasonDetail">;
function VisitForm({ visit, photos, onSaved, onPhotoSaved, onReload }: { visit: VisitExecution; photos: VisitExecutionPhoto[]; onSaved: (v: VisitExecution) => void; onPhotoSaved: () => unknown; onReload: () => unknown }) {
  const { t, locale } = useTranslation();
  const initial: FormState = { goal: visit.goal, notes: visit.notes, outcome: visit.outcome, failureReason: visit.failureReason, reasonDetail: visit.reasonDetail };
  const [form, setForm] = useState<FormState>(initial);
  const [validation, setValidation] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [photoKind, setPhotoKind] = useState<VisitExecutionPhoto["kind"]>("SHELF");
  const photoRequest = useRef<string>("");
  const command = useRef<{ signature: string; key: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const closed = visit.status !== "OPEN";
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const save = useMutation({ mutationFn: (body: SaveVisitExecution) => visitExecutionApi.save(visit.id, body), onSuccess: onSaved });
  const photo = useMutation({ mutationFn: () => visitExecutionApi.upload(visit.id, file!, photoKind, photoRequest.current), onSuccess: () => { setFile(null); if (fileInput.current) fileInput.current.value = ""; onPhotoSaved(); } });
  function submit(finish: boolean) {
    const signature = JSON.stringify({ ...form, finish, version: visit.version });
    if (command.current?.signature !== signature) command.current = { signature, key: crypto.randomUUID() };
    const parsed = saveVisitExecutionSchema.safeParse({ ...form, finish, version: visit.version, commandKey: command.current!.key });
    setValidation(!parsed.success);
    if (parsed.success) save.mutate(parsed.data);
  }
  const busy = save.isPending || photo.isPending;
  const change = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((previous) => ({ ...previous, [field]: value }));
  return <div className="space-y-4">
    <Section title={t("visit.tools")}><p className="text-sm text-muted-foreground">{t("visit.toolsHint")}</p>
      {!closed && <fieldset disabled={busy} className="space-y-3">
        <VisitCameraCapture disabled={busy || !!file || photos.length >= 30} onCapture={(image) => { setFile(image); photoRequest.current = crypto.randomUUID(); if (fileInput.current) fileInput.current.value = ""; }} />
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="photo-kind">{t("visit.photoKind")}</Label><Select dir={locale === "ar" ? "rtl" : "ltr"} value={photoKind} onValueChange={(v) => { setPhotoKind(v as typeof photoKind); photoRequest.current = crypto.randomUUID(); }}><SelectTrigger id="photo-kind"><SelectValue /></SelectTrigger><SelectContent>{visitPhotoKinds.map((kind) => <SelectItem key={kind} value={kind}>{t(`visit.${kind}`)}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="visit-image">{t("visit.file")}</Label><Input ref={fileInput} id="visit-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setFile(e.target.files?.[0] ?? null); photoRequest.current = crypto.randomUUID(); }} /></div></div>
        {file && <p role="status" className="break-all text-sm text-muted-foreground">{file.name}</p>}
        <p className="text-xs text-muted-foreground">{t("visit.fileHint")}</p><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!file || busy || photos.length >= 30} onClick={() => photo.mutate()}><Camera className="h-4 w-4" />{t(photo.isPending ? "visit.uploading" : "visit.upload")}</Button>{file && <Button variant="ghost" disabled={busy} onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}>{t("visit.discardPhoto")}</Button>}</div>
      </fieldset>}
      {photo.isError && <p role="alert" className="text-sm text-destructive">{t("visit.uploadError")}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{photos.map((p) => <Photo key={p.id} photo={p} visitId={visit.id} />)}</div>
      <div className="space-y-2"><Label htmlFor="visit-notes">{t("visit.notes")}</Label><textarea id="visit-notes" className="min-h-28 w-full rounded-md border border-input bg-background p-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" maxLength={4000} disabled={closed || busy} value={form.notes} onChange={(e) => change("notes", e.target.value)} /></div>
    </Section>
    <Section title={t("visit.operations")}><p className="text-sm text-muted-foreground">{t("visit.operationHint")}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["createInvoice", "createReturn", "createCollection", "createOrder"] as const).map((operation) => <div key={operation} className="space-y-2"><Button className="w-full" variant="outline" disabled>{t(`visit.${operation}`)}</Button><p className="text-xs text-muted-foreground">{t("visit.deferred")}</p></div>)}</div></Section>
    <Section title={t("visit.result")}><p className="text-sm text-muted-foreground">{t("visit.resultHint")}</p>
      <fieldset disabled={closed || busy} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="visit-goal">{t("visit.goal")}</Label><Select dir={locale === "ar" ? "rtl" : "ltr"} value={form.goal} onValueChange={(v) => change("goal", v as FormState["goal"])}><SelectTrigger id="visit-goal"><SelectValue /></SelectTrigger><SelectContent>{visitGoals.map((v) => <SelectItem key={v} value={v}>{t(`visit.${v}`)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="visit-outcome">{t("visit.result")}</Label><Select dir={locale === "ar" ? "rtl" : "ltr"} value={form.outcome ?? "NONE"} onValueChange={(v) => setForm((prev) => ({ ...prev, outcome: v === "NONE" ? null : v as FormState["outcome"], failureReason: null, reasonDetail: "" }))}><SelectTrigger id="visit-outcome"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">{t("visit.choose")}</SelectItem>{visitOutcomes.map((v) => <SelectItem key={v} value={v}>{t(`visit.${v}`)}</SelectItem>)}</SelectContent></Select></div></div>
      {form.outcome === "NOT_ACHIEVED" && <div className="space-y-3"><Label htmlFor="visit-reason">{t("visit.failureReason")}</Label><Select dir={locale === "ar" ? "rtl" : "ltr"} value={form.failureReason ?? "NONE"} onValueChange={(v) => setForm((prev) => ({ ...prev, failureReason: v === "NONE" ? null : v as FormState["failureReason"], reasonDetail: "" }))}><SelectTrigger id="visit-reason"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">{t("visit.choose")}</SelectItem>{visitFailureReasons.map((v) => <SelectItem key={v} value={v}>{t(`visit.${v}`)}</SelectItem>)}</SelectContent></Select>
        {form.failureReason === "OTHER" && <div className="space-y-2"><Label htmlFor="visit-detail">{t("visit.reasonDetail")}</Label><Input id="visit-detail" maxLength={500} value={form.reasonDetail} onChange={(e) => change("reasonDetail", e.target.value)} /></div>}</div>}
      </fieldset>
      {validation && <p role="alert" className="text-sm text-destructive">{t("visit.validation")}</p>}
      {save.isError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{t("visit.saveError")}</p><Button variant="outline" onClick={() => onReload()}>{t("visit.reload")}</Button></div>}
      {!closed && <div className="space-y-3">{dirty && <p role="status" className="text-xs text-warning">{t("visit.unsaved")}</p>}{file && <p className="text-xs text-muted-foreground">{t("visit.pendingPhoto")}</p>}<div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || !!file} onClick={() => submit(false)}><Save className="h-4 w-4" />{t(save.isPending ? "visit.saving" : "visit.save")}</Button><Button disabled={busy || !!file} onClick={() => submit(true)}><CheckCircle2 className="h-4 w-4" />{t("visit.finish")}</Button></div></div>}
    </Section>
  </div>;
}
function Photo({ photo, visitId }: { photo: VisitExecutionPhoto; visitId: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const load = useMutation({ mutationFn: () => visitExecutionApi.photoUrl(visitId, photo.id), onSuccess: (result) => { setImageError(false); setUrl(result.url); } });
  return <div className="space-y-2 rounded-md border border-border/60 p-3"><Button variant="ghost" disabled={load.isPending} onClick={() => load.mutate()}>{t("visit.viewPhoto")} · {t(`visit.${photo.kind}`)}</Button>
    {url && <img src={url} alt={t(`visit.${photo.kind}`)} className="max-h-64 w-full rounded-md object-contain" referrerPolicy="no-referrer" onError={() => { setUrl(null); setImageError(true); }} />}{(load.isError || imageError) && <p role="alert" className="text-xs text-destructive">{t("visit.photoError")}</p>}</div>;
}
