"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { formatQuantity } from "@/lib/utils";
import { useTranslation } from "@/components/translation-provider";

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function HierarchySelect({ label, value, options, placeholder, onChange }: { label: string; value: string; options: { id: string; name: string }[]; placeholder: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-xs text-muted-foreground"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"><option value="">{placeholder}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>;
}

export function SmartLoadingManagementScreen() {
  const { locale } = useTranslation();
  const [targetDate, setTargetDate] = useState(tomorrowIso);
  const [managerId, setManagerId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const query = useQuery({
    queryKey: ["smart-loading", "management", targetDate, managerId, supervisorId, salesRepId],
    queryFn: () => smartLoadingApi.getManagement({ targetDate, ...(managerId ? { managerId } : {}), ...(supervisorId ? { supervisorId } : {}), ...(salesRepId ? { salesRepId } : {}) }),
  });
  const result = query.data;
  const products = result?.products ?? [];
  const isArabic = locale === "ar";
  const coverage = result?.coverage === null || result?.coverage === undefined ? "—" : `${(result.coverage * 100).toFixed(1)}%`;
  return <div dir={isArabic ? "rtl" : "ltr"} className="space-y-4 pb-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><span className="crystal-badge h-10 w-10 bg-teal-500/15 text-teal-600"><PackagePlus className="h-5 w-5" /></span>{isArabic ? "التحميل الذكي للإدارة" : "Smart Loading Management"}</h1><p className="mt-1 text-sm text-muted-foreground">{isArabic ? "متابعة توافق رصيد السيارة مع الاحتياج المتوقع دون فلتر خط سير." : "Route scope is resolved from the selected hierarchy member."}</p></div>
      <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm" onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />{isArabic ? "تحديث" : "Refresh"}</button>
    </header>
    <Card className="glass-card"><CardHeader className="pb-3"><CardTitle className="text-base">{isArabic ? "الطلبات المؤكدة المجمعة" : "Aggregated confirmed orders"}</CardTitle><CardDescription>{isArabic ? "اختر التسلسل الإداري حتى المندوب؛ لا يوجد فلتر Route." : "Manager → Supervisor → Sales Rep. No Route filter."}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-4"><label className="grid gap-1 text-xs text-muted-foreground"><span>{isArabic ? "تاريخ التحميل" : "Loading date"}</span><Input className="h-9" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label><HierarchySelect label={isArabic ? "المدير" : "Manager"} value={managerId} options={result?.managers ?? []} placeholder={isArabic ? "كل المدراء المتاحين" : "All available managers"} onChange={(value) => { setManagerId(value); setSupervisorId(""); setSalesRepId(""); }} /><HierarchySelect label={isArabic ? "المشرف" : "Supervisor"} value={supervisorId} options={result?.supervisors ?? []} placeholder={isArabic ? "كل المشرفين المتاحين" : "All available supervisors"} onChange={(value) => { setSupervisorId(value); setSalesRepId(""); }} /><HierarchySelect label={isArabic ? "مندوب المبيعات" : "Sales Rep"} value={salesRepId} options={result?.salesReps ?? []} placeholder={isArabic ? "اختر مندوبًا" : "Select a sales rep"} onChange={setSalesRepId} /></CardContent></Card>
    {query.isLoading ? <><Skeleton className="h-36 w-full" /><Skeleton className="h-64 w-full" /></> : query.isError ? <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-destructive"><TriangleAlert className="h-4 w-4" />{isArabic ? "تعذر تحميل بيانات الإدارة. حاول مرة أخرى." : "Unable to load management data. Try again."}</CardContent></Card> : !salesRepId ? <Card><CardContent className="p-5 text-sm text-muted-foreground">{isArabic ? "اختر مندوب مبيعات لعرض التغطية والاحتياج." : "Select a sales rep to view coverage and expected demand."}</CardContent></Card> : <>
      <Card className="glass-card"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-teal-600" />{isArabic ? "مدى توافق رصيد السيارة مع احتياج خط السير" : "Vehicle stock alignment with route demand"}</CardTitle><CardDescription>{isArabic ? `المسارات المحلولة: ${result?.resolvedRouteCount ?? 0}` : `Resolved routes: ${result?.resolvedRouteCount ?? 0}`}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">{isArabic ? "التغطية" : "Coverage"}</p><p className="text-2xl font-semibold">{coverage}</p></div><div><p className="text-xs text-muted-foreground">{isArabic ? "أصناف بها عجز" : "Products with shortage"}</p><p className="text-2xl font-semibold text-red-600">{formatQuantity(products.filter((product) => product.status === "shortage").length, locale)}</p></div><div><p className="text-xs text-muted-foreground">{isArabic ? "إجمالي العجز" : "Total shortage"}</p><p className="text-2xl font-semibold text-red-600">{formatQuantity(products.reduce((sum, product) => sum + product.shortageQuantity, 0), locale)}</p></div></CardContent></Card>
      <Card className="glass-card"><CardHeader><CardTitle>{isArabic ? "توصيات التحميل" : "Loading recommendations"}</CardTitle><CardDescription>{isArabic ? "المخزون والاحتياج يعرضان على مستوى الصنف؛ زيادة صنف لا تعوض عجز صنف آخر." : "Product-level stock and demand; surplus never offsets another product's shortage."}</CardDescription></CardHeader><CardContent className="space-y-2">{products.length === 0 ? <p className="text-sm text-muted-foreground">{isArabic ? "لا توجد بيانات مخزون أو احتياج ضمن النطاق المحلول." : "No inventory or demand data exists in the resolved scope."}</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="border-b text-muted-foreground"><tr><th className="px-2 py-2 text-start font-medium">{isArabic ? "الصنف" : "Product"}</th><th className="px-2 py-2 text-end font-medium">{isArabic ? "رصيد السيارة" : "Vehicle Stock"}</th><th className="px-2 py-2 text-end font-medium">{isArabic ? "الاحتياج المتوقع" : "Expected"}</th><th className="px-2 py-2 text-end font-medium">{isArabic ? "الحالة" : "Status"}</th></tr></thead><tbody>{products.map((product) => <tr key={product.productCode} className="border-b last:border-0"><td className="px-2 py-3"><p className="font-medium">{product.productName}</p><p className="text-xs text-muted-foreground">{product.productCode}</p></td><td className="px-2 py-3 text-end">{formatQuantity(product.vehicleStock, locale)}</td><td className="px-2 py-3 text-end">{formatQuantity(product.expectedDemand, locale)}</td><td className="px-2 py-3 text-end">{product.status === "covered" ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-700">{isArabic ? "مغطى" : "Covered"}</span> : <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs font-medium text-red-700">{isArabic ? `عجز ${formatQuantity(product.shortageQuantity, locale)}` : `Shortage ${formatQuantity(product.shortageQuantity, locale)}`}</span>}</td></tr>)}</tbody></table></div>}</CardContent></Card>
    </>}
  </div>;
}
