"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, PackageX } from "lucide-react";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/components/translation-provider";
import { formatQuantity } from "@/lib/utils";

const PAGE_SIZE = 100;

type ManagementScope = { managerId?: string; supervisorId?: string; salesRepId?: string };

function useManagementLostOpportunities(targetDate: string, scope: ManagementScope, offset = 0) {
  return useQuery({
    queryKey: ["smart-loading", "management-risks", "lost-opportunities", targetDate, scope.managerId, scope.supervisorId, scope.salesRepId, PAGE_SIZE, offset],
    queryFn: () => smartLoadingApi.getManagementLostOpportunities(targetDate, scope, PAGE_SIZE, offset),
    staleTime: 60_000,
  });
}

export function ManagementLostOpportunitiesCard({ targetDate, scope, onSelectPerson }: { targetDate: string; scope: ManagementScope; onSelectPerson: (person: { employeeId: string; employeeName: string }) => void }) {
  const { locale, t } = useTranslation();
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const query = useManagementLostOpportunities(targetDate, scope);
  const label = (key: string, fallback: string) => {
    const translated = t(key as never);
    return translated === key ? fallback : translated;
  };

  if (query.isLoading) return <Skeleton className="h-full min-h-36 w-full" />;
  if (query.isError) return <Card className="glass-card h-full min-h-36 w-full border-destructive/30 bg-destructive/10"><CardContent className="flex min-h-36 items-center p-4 text-sm text-destructive">{label("smartLoading.lostOpportunitiesLoadError", "Could not load lost opportunities.")}</CardContent></Card>;

  const data = query.data;
  if (!data || data.lostOpportunityCount === 0) return <Card className="glass-card h-full min-h-36 w-full border-success/20 bg-success/5"><CardContent className="flex min-h-36 items-center gap-2 p-4 text-sm text-success"><CircleCheck className="h-5 w-5 shrink-0" />{label("smartLoading.noLostOpportunities", "No lost opportunities.")}</CardContent></Card>;

  return <section aria-labelledby="management-lost-opportunities-title" className="group w-full min-w-0" onMouseEnter={() => setPopoverOpen(true)} onMouseLeave={() => setPopoverOpen(false)}><div id="management-lost-opportunities-title" className="relative min-h-36"><KpiCard icon={PackageX} label={label("smartLoading.lostOpportunities", "Lost opportunities")} value={formatQuantity(data.affectedPersonCount, locale)} caption={`${formatQuantity(data.affectedPersonCount, locale)} ${label("smartLoading.people", "people")} · ${formatQuantity(data.affectedRouteCount, locale)} ${label("smartLoading.routes", "routes")} · ${formatQuantity(data.lostOpportunityCount, locale)} ${label("smartLoading.lostOpportunities", "risks")}`} glow="warning" />{isPopoverOpen && data.topPeople.length > 0 && <Card className="glass-card absolute start-0 top-full z-30 -mt-1 w-80"><CardContent className="p-3"><p className="mb-2 text-sm font-semibold">{label("smartLoading.topLostOpportunityPeople", "Top affected people")}</p><div className="space-y-1">{data.topPeople.map((person) => <button key={person.responsibleEmployeeId} type="button" className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-start text-sm hover:bg-muted focus-visible:bg-muted" onClick={(event) => { event.stopPropagation(); setPopoverOpen(false); onSelectPerson({ employeeId: person.responsibleEmployeeId, employeeName: person.responsibleEmployeeName }); }}><span className="truncate">{person.responsibleEmployeeName}</span><span className="shrink-0 tabular-nums text-muted-foreground">{formatQuantity(person.gap, locale)}</span></button>)}</div></CardContent></Card>}</div></section>;
}

export function ManagementLostOpportunitiesTable({ targetDate, scope }: { targetDate: string; scope: ManagementScope }) {
  const { locale, t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const query = useManagementLostOpportunities(targetDate, scope, offset);
  const label = (key: string, fallback: string) => {
    const translated = t(key as never);
    return translated === key ? fallback : translated;
  };

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError) return <p role="alert" className="text-sm text-destructive">{label("smartLoading.lostOpportunitiesLoadError", "Could not load lost opportunities.")}</p>;
  const data = query.data;
  if (!data || data.rows.length === 0) return <p className="text-sm text-muted-foreground">{label("smartLoading.noLostOpportunities", "No lost opportunities.")}</p>;

  return <div className="space-y-3"><div className="overflow-x-auto"><table className="w-full min-w-[56rem] text-sm"><thead className="border-b text-start text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">{label("smartLoading.responsible", "Responsible")}</th><th className="px-3 py-2 font-medium">{label("smartLoading.route", "Route")}</th><th className="px-3 py-2 font-medium">{label("smartLoading.product", "Product")}</th><th className="px-3 py-2 font-medium">{label("smartLoading.opportunityQuantity", "Opportunity quantity")}</th><th className="px-3 py-2 font-medium">{label("smartLoading.vehicleStock", "Current van stock")}</th><th className="px-3 py-2 font-medium">{label("smartLoading.gap", "Gap")}</th></tr></thead><tbody>{data.rows.map((row) => <tr key={`${row.routeId}:${row.productCode}`} className="border-b border-border/60"><td className="px-3 py-2">{row.responsibleEmployeeName}</td><td className="px-3 py-2">{row.routeId}</td><td className="px-3 py-2"><span className="block">{row.productName}</span>{row.category && <span className="text-xs text-muted-foreground">{row.category}</span>}</td><td className="px-3 py-2 tabular-nums">{formatQuantity(row.opportunityQuantity, locale)}</td><td className="px-3 py-2 tabular-nums">{formatQuantity(row.currentVanStock, locale)}</td><td className="px-3 py-2 tabular-nums">{formatQuantity(row.gap, locale)}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{formatQuantity(data.lostOpportunityCount, locale)} {label("smartLoading.lostOpportunities", "risks")}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>{label("smartLoading.previous", "Previous")}</Button><Button type="button" size="sm" variant="outline" disabled={!data.page.hasMore} onClick={() => setOffset((current) => current + PAGE_SIZE)}>{label("smartLoading.next", "Next")}</Button></div></div></div>;
}
