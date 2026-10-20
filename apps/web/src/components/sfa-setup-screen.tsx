"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Pencil, Plus, Warehouse } from "lucide-react";
import { createWarehouseSchema, supportsSfaOperations, getCompanyFeatureAccessState, type SetupItemKey, type SfaWarehouse } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { previewChecklist, previewWarehouses } from "@/lib/sfa-preview-data";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function SfaSetupScreen({ preview = false }: { preview?: boolean }) {
  const { user, isLoading } = useAuth();
  const { locale } = useTranslation();
  const ar = locale === "ar";
  const text = (arabic: string, english: string) => ar ? arabic : english;
  const client = useQueryClient();
  const companyId = user?.companyId;
  const previewAllowed = preview && user?.role.code === "SUPER_ADMIN" && user.status === "ACTIVE" && !user.mustChangePassword;
  const allowed = user?.role.code === "COMPANY_ADMIN" && !!companyId
    && getCompanyFeatureAccessState(user.featureAccess, "sfa-setup") === "ENABLED"
    && ["sfa.access", "company.manage"].every((permission) => user.permissions?.includes(permission));
  const mode = useQuery({ queryKey: ["sfa-mode", companyId], queryFn: sfaSetupApi.mode, enabled: !preview && allowed, retry: false, refetchOnWindowFocus: false });
  const enabled = preview ? previewAllowed : allowed && supportsSfaOperations(mode.data?.operatingMode);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const checklist = useQuery({ queryKey: [preview ? "sfa-preview-checklist" : "sfa-checklist", companyId], queryFn: () => preview ? Promise.resolve(previewChecklist) : sfaSetupApi.checklist(), enabled, retry: false, refetchOnWindowFocus: false });
  const warehouses = useQuery({ queryKey: [preview ? "sfa-preview-warehouses" : "sfa-warehouses", companyId, page, search], queryFn: () => preview ? Promise.resolve(previewWarehouses(page, search)) : sfaSetupApi.warehouses(page, search), enabled, retry: false, refetchOnWindowFocus: false });
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name: "", address: "", isActive: true });
  const [validationError, setValidationError] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      if (preview) throw new Error("Preview is read-only");
      const body = createWarehouseSchema.parse({ ...form, address: form.address || null });
      return editing ? sfaSetupApi.update(editing, body) : sfaSetupApi.create(body);
    },
    onSuccess: async () => {
      setDialog(false);
      await Promise.all([client.invalidateQueries({ queryKey: ["sfa-warehouses", companyId] }), client.invalidateQueries({ queryKey: ["sfa-checklist", companyId] })]);
    },
  });
  function open(row?: SfaWarehouse) {
    if (preview) return;
    setEditing(row?.id ?? null);
    setForm(row ? { code: row.code, name: row.name, address: row.address ?? "", isActive: row.isActive } : { code: "", name: "", address: "", isActive: true });
    setValidationError(false); mutation.reset(); setDialog(true);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!createWarehouseSchema.safeParse(form).success) { setValidationError(true); return; }
    setValidationError(false); mutation.mutate();
  }
  const labels: Record<SetupItemKey, string> = {
    products: text("الأصناف", "Products"), customers: text("العملاء", "Customers"), prices: text("الأسعار", "Prices"),
    employees: text("الموظفون", "Employees"), warehouses: text("المستودعات", "Warehouses"), openingBalances: text("الأرصدة الافتتاحية", "Opening balances"),
  };
  if (isLoading || (!preview && allowed && mode.isPending)) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-60 w-full" /></div>;
  if (!enabled) return <Card><CardContent className="pt-6" role="status">{mode.isError ? text("تعذر التحقق من وضع التشغيل. أعد المحاولة.", "Could not verify operating mode. Please retry.") : text("تجهيز التشغيل متاح لمسؤول الشركة مع تفعيل SFA والصلاحيات المطلوبة.", "Setup requires a company administrator, SFA mode and explicit permissions.")}{mode.isError && <Button variant="outline" className="ms-3" onClick={() => void mode.refetch()}>{text("إعادة المحاولة", "Retry")}</Button>}</CardContent></Card>;
  return <div className="space-y-6">
    {preview && <Card><CardContent className="pt-6" role="status">{text("معاينة Super Admin — بيانات تجريبية مستقلة، للقراءة فقط. لم يتم تفعيل أي شركة أو إنشاء بيانات تشغيلية.", "Super Admin preview — separate synthetic data, read-only. No company is activated and no operational data is created.")}</CardContent></Card>}
    <div><h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><ClipboardCheck className="h-6 w-6 text-primary" />{text("تجهيز تشغيل الشركة", "Company operations setup")}</h1><p className="mt-1 text-sm text-muted-foreground">{text("ابدأ دون ملفات Excel. تُقرأ الحالة من البيانات التشغيلية الحالية؛ وجود السجلات لا يعني اكتمال جاهزية التشغيل.", "Start without Excel. Status reflects current operational records; their presence does not imply full operational readiness.")}</p></div>
    {checklist.isPending ? <Skeleton className="h-40 w-full" /> : checklist.isError ? <Card><CardContent className="pt-6 text-destructive" role="alert">{text("تعذر تحميل قائمة التجهيز.", "Could not load the checklist.")}<Button variant="outline" className="ms-3" onClick={() => void checklist.refetch()}>{text("إعادة المحاولة", "Retry")}</Button></CardContent></Card> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{checklist.data.items.map((item) => <Card key={item.key}><CardHeader><CardTitle>{labels[item.key]}</CardTitle></CardHeader><CardContent className="space-y-3"><Badge variant={item.status === "PRESENT" ? "success" : item.status === "MISSING" ? "warning" : "secondary"}>{item.status === "PRESENT" ? text("توجد سجلات نشطة", "Active records exist") : item.status === "MISSING" ? text("يحتاج إعدادًا", "Setup needed") : text("غير متاح في هذه المرحلة", "Not available in this phase")}</Badge><p className="text-xs text-muted-foreground">{item.status === "NOT_AVAILABLE" ? text("لم تُنشأ سجلات تشغيلية لهذا النطاق بعد؛ بيانات Excel التحليلية لا تُحتسب إعدادًا تشغيليًا.", "Operational records are not implemented yet; analytical Excel data is not counted as operational setup.") : item.key === "employees" ? text("التحقق من وجود موظف نشط في سجل الموظفين الحالي.", "Checks for an active employee in the existing registry.") : item.key === "products" ? text("التحقق من وجود صنف تشغيلي نشط؛ بيانات Excel لا تُحتسب.", "Checks for an active operational product; Excel data is not counted.") : item.key === "openingBalances" ? text("التحقق من وجود رصيد افتتاحي مرحّل لم يُعكس؛ لا يثبت اكتمال الجرد.", "Checks for an unreversed opening movement; this does not certify count completeness.") : text("التحقق من وجود مستودع نشط؛ لا يدل ذلك على وجود مخزون.", "Checks for an active warehouse; this does not indicate stock availability.")}</p>{item.key === "employees" && !preview && <Link href="/dashboard/employees" className="inline-flex rounded-md text-sm text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{text("إدارة الموظفين", "Manage employees")}</Link>}</CardContent></Card>)}</div>}
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="flex items-center gap-2"><Warehouse className="h-5 w-5 text-primary" />{text("المستودعات", "Warehouses")}</CardTitle><Button disabled={preview} onClick={() => open()}><Plus className="h-4 w-4" />{text("إضافة مستودع", "Add warehouse")}</Button></div></CardHeader><CardContent className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}><div className="min-w-0 flex-1"><Label htmlFor="warehouse-search">{text("بحث بالاسم أو الرمز", "Search name or code")}</Label><Input id="warehouse-search" value={searchInput} maxLength={80} onChange={(event) => setSearchInput(event.target.value)} /></div><Button type="submit" variant="outline">{text("بحث", "Search")}</Button></form>
      {warehouses.isPending ? <Skeleton className="h-40 w-full" /> : warehouses.isError ? <div role="alert" className="text-sm text-destructive">{text("تعذر تحميل المستودعات.", "Could not load warehouses.")}<Button variant="outline" className="ms-3" onClick={() => void warehouses.refetch()}>{text("إعادة المحاولة", "Retry")}</Button></div> : <>
        {warehouses.data.items.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{text("لا توجد مستودعات مطابقة. أضف أول مستودع لبدء التجهيز.", "No matching warehouses. Add your first warehouse to begin setup.")}</p> : <ul className="divide-y divide-border">{warehouses.data.items.map((row) => <li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words font-semibold">{row.name} <span className="text-xs text-muted-foreground" dir="ltr">({row.code})</span></p>{row.address && <p className="mt-1 break-words text-sm text-muted-foreground">{row.address}</p>}<Badge className="mt-2" variant={row.isActive ? "success" : "secondary"}>{row.isActive ? text("نشط", "Active") : text("غير نشط", "Inactive")}</Badge></div><Button disabled={preview} variant="outline" size="sm" onClick={() => open(row)} aria-label={`${text("تعديل", "Edit")} ${row.name}`}><Pencil className="h-4 w-4" />{text("تعديل", "Edit")}</Button></li>)}</ul>}
        <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={page <= 1 || warehouses.isFetching} onClick={() => setPage((value) => value - 1)}>{text("السابق", "Previous")}</Button><span className="text-sm tabular-nums">{text("الصفحة", "Page")} {page}</span><Button variant="outline" disabled={!warehouses.data.hasMore || page >= 1000 || warehouses.isFetching} onClick={() => setPage((value) => value + 1)}>{text("التالي", "Next")}</Button></div>
      </>}
    </CardContent></Card>
    <Dialog open={dialog} onOpenChange={(value) => { if (!mutation.isPending) setDialog(value); }}><DialogContent><DialogHeader><DialogTitle>{editing ? text("تعديل المستودع", "Edit warehouse") : text("إضافة مستودع", "Add warehouse")}</DialogTitle><DialogDescription>{text("سجل المستودع فقط؛ لا ينشئ مخزونًا أو أرصدة افتتاحية.", "Warehouse registry only; this does not create stock or opening balances.")}</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="warehouse-code">{text("الرمز", "Code")}</Label><Input id="warehouse-code" dir="ltr" required maxLength={40} pattern="[A-Za-z0-9_-]+" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} disabled={mutation.isPending} /><p className="text-xs text-muted-foreground">{text("أحرف إنجليزية وأرقام وشرطة؛ الرمز فريد داخل الشركة.", "Letters, numbers, hyphen or underscore; unique within your company.")}</p></div>
      <div className="space-y-2"><Label htmlFor="warehouse-name">{text("الاسم", "Name")}</Label><Input id="warehouse-name" required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={mutation.isPending} /></div>
      <div className="space-y-2"><Label htmlFor="warehouse-address">{text("العنوان (اختياري)", "Address (optional)")}</Label><Input id="warehouse-address" maxLength={300} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} disabled={mutation.isPending} /></div>
      <div className="flex items-center justify-between gap-3"><Label htmlFor="warehouse-active">{text("مستودع نشط", "Active warehouse")}</Label><Switch id="warehouse-active" checked={form.isActive} onCheckedChange={(value) => setForm({ ...form, isActive: value })} disabled={mutation.isPending} /></div>
      {(validationError || mutation.isError) && <p role="alert" className="text-sm text-destructive">{mutation.error instanceof ApiError && mutation.error.status === 409 ? text("الرمز مستخدم بالفعل داخل الشركة.", "This code is already used in your company.") : validationError ? text("تحقق من الاسم والرمز والحدود المسموحة.", "Check the name, code and length limits.") : text("تعذر الحفظ. تحقق من الاتصال والصلاحيات ثم أعد المحاولة.", "Could not save. Check your connection and permissions, then retry.")}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setDialog(false)}>{text("إلغاء", "Cancel")}</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? text("جارٍ الحفظ…", "Saving…") : text("حفظ", "Save")}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  </div>;
}
