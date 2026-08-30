"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, CircleAlert, CircleCheck, Route, Truck } from "lucide-react";
import type { SmartLoadingManagementLoadingRiskPerson } from "@field-sales-os/schemas";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatQuantity } from "@/lib/utils";

export function ManagementLoadingRisk({ targetDate, locale }: { targetDate: string; locale: "ar" | "en" }) {
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["smart-loading", "management-risks", "loading", targetDate], queryFn: () => smartLoadingApi.getManagementLoadingRisk(targetDate), staleTime: 60_000 });
  const ar = locale === "ar";
  const people = query.data?.people ?? [];
  return (
    <section aria-labelledby="management-loading-risk-title" className="glass-card rise-in relative overflow-hidden p-4 max-md:p-3">
      <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><span className="crystal-badge h-8 w-8 bg-amber-500/15 text-amber-700"><AlertTriangle className="h-4 w-4" /></span><h2 id="management-loading-risk-title" className="text-base font-semibold tracking-tight">{ar ? "خطر التحميل" : "Loading Risk"}{query.data ? ` (${formatQuantity(query.data.affectedPersonCount, locale)})` : ""}</h2></div>
          {!query.isLoading && !query.isError && <p className="text-xs text-muted-foreground">{ar ? "يحتاجون متابعة" : "Need attention"}</p>}
        </div>
        {query.isLoading && <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
        {query.isError && <Card className="border-destructive/30 bg-destructive/10"><CardContent className="p-3 text-sm text-destructive">{ar ? "تعذر تحميل مخاطر التحميل." : "Loading risks could not be loaded."}</CardContent></Card>}
        {!query.isLoading && !query.isError && people.length === 0 && <Card className="border-emerald-500/20 bg-emerald-500/5"><CardContent className="flex items-center gap-2 p-3 text-sm text-emerald-700 dark:text-emerald-300"><CircleCheck className="h-4 w-4 shrink-0" />{ar ? "لا يوجد أي شخص لديه خطر تحميل اليوم." : "No one has a loading risk today."}</CardContent></Card>}
        {people.map((person) => <LoadingRiskPerson key={person.employeeId} person={person} locale={locale} open={openPersonId === person.employeeId} onToggle={() => setOpenPersonId((current) => current === person.employeeId ? null : person.employeeId)} />)}
      </div>
    </section>
  );
}

function LoadingRiskPerson({ person, locale, open, onToggle }: { person: SmartLoadingManagementLoadingRiskPerson; locale: "ar" | "en"; open: boolean; onToggle: () => void }) {
  const ar = locale === "ar";
  return <Card className="overflow-hidden border-border/80 bg-background/35">
    <CardContent className="flex items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 items-center gap-3"><CircleAlert className="h-5 w-5 shrink-0 text-red-500" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{person.employeeName}</p><p className="mt-0.5 text-xs text-muted-foreground">{ar ? `${formatQuantity(person.affectedRouteCount, locale)} مسار · ${formatQuantity(person.affectedProductCount, locale)} أصناف` : `${formatQuantity(person.affectedRouteCount, locale)} routes · ${formatQuantity(person.affectedProductCount, locale)} products`}</p></div></div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onToggle} aria-expanded={open}>{ar ? "عرض التفاصيل" : "View details"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></Button>
    </CardContent>
    {open && <CardContent className="border-t p-4 pt-3">
      <div className="space-y-3">{person.routes.map((route) => <div key={route.routeId} className="rounded-lg border bg-background/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Route className="h-4 w-4 text-ai" />{route.routeId}</div>
        <div className="space-y-2">{route.products.map((product) => <div key={product.productCode} className="rounded-md bg-muted/45 p-3 text-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{product.productName}</p><p className="text-xs text-muted-foreground">{product.productCode}</p></div><Truck className="h-4 w-4 shrink-0 text-amber-700" /></div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><Metric label={ar ? "الطلب المتوقع" : "Expected demand"} value={formatQuantity(product.expectedDemand, locale)} /><Metric label={ar ? "رصيد السيارة" : "Vehicle stock"} value={formatQuantity(product.currentVehicleStock, locale)} /><Metric label={ar ? "فجوة الكمية" : "Quantity gap"} value={formatQuantity(product.quantityGap, locale)} danger /></dl>
        </div>)}</div>
      </div>)}</div>
    </CardContent>}
  </Card>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div><dt className="text-muted-foreground">{label}</dt><dd className={danger ? "mt-0.5 font-semibold text-amber-700" : "mt-0.5 font-semibold"}>{value}</dd></div>; }
