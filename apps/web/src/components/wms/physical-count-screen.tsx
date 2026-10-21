"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { getCompanyFeatureAccessState, supportsSfaOperations, type WmsWarehouse } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { wmsApi } from "@/lib/api/wms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBox, Pager, Search, type Text } from "./shared";
import { WmsCountPanel } from "./count-panel";

const options = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;
export function PhysicalCountScreen({ initialCode = "DEMO-WH-01" }: { initialCode?: string }) {
  const { user, isLoading } = useAuth(), { locale } = useTranslation(); const t: Text = (ar, en) => locale === "ar" ? ar : en;
  const company = user?.companyId;
  const allowed = !!company && user?.role.code !== "SUPER_ADMIN" && getCompanyFeatureAccessState(user?.featureAccess, "warehouse-core") === "ENABLED"
    && ["sfa.access", "wms.read"].every(p => user?.permissions?.includes(p));
  const mode = useQuery({ queryKey: ["sfa-mode", company], queryFn: sfaSetupApi.mode, enabled: allowed, ...options });
  const enabled = allowed && supportsSfaOperations(mode.data?.operatingMode);
  const [input, setInput] = useState(initialCode), [search, setSearch] = useState(initialCode), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WmsWarehouse | null>(null);
  const warehouses = useQuery({ queryKey: ["wms", company, "count-warehouses", page, search], queryFn: () => wmsApi.warehouses(page, search), enabled, ...options });
  const warehouse = selected ?? warehouses.data?.items.find(w => w.code === initialCode);
  if (isLoading || (allowed && mode.isPending)) return <Skeleton className="h-64" />;
  if (!enabled) return <Card><CardHeader><CardTitle>{t("الجرد الفعلي", "Physical counts")}</CardTitle></CardHeader><CardContent>{mode.isError ? <ErrorBox error={mode.error} retry={() => void mode.refetch()} t={t} /> : <p className="text-sm text-muted-foreground">{t("يتطلب الجرد تفعيل SFA والشاشة وصلاحيات المستودع الصريحة.", "Counts require SFA mode, screen activation and explicit warehouse permissions.")}</p>}</CardContent></Card>;
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><ClipboardCheck className="h-7 w-7 text-primary" />{t("الجرد الفعلي", "Physical counts")}</h1><Button asChild variant="outline"><Link href="/sfa/warehouse">{t("العودة إلى المستودع", "Back to warehouse")}</Link></Button></div>
    <Card><CardHeader><CardTitle>{t("نطاق المستودع", "Warehouse scope")}</CardTitle></CardHeader><CardContent className="space-y-4"><Search id="count-warehouse-search" value={input} onChange={setInput} onSearch={() => { setSearch(input.trim()); setPage(1); }} t={t} />
      {warehouses.isPending ? <Skeleton className="h-16" /> : warehouses.isError ? <ErrorBox error={warehouses.error} retry={() => void warehouses.refetch()} t={t} /> : <><div className="flex flex-wrap gap-2">{!warehouses.data.items.length && <p className="text-sm text-muted-foreground">{t("لا يوجد مستودع مصرح مطابق.", "No matching authorized warehouse.")}</p>}{warehouses.data.items.map(w => <Button key={w.id} variant={warehouse?.id === w.id ? "default" : "outline"} aria-pressed={warehouse?.id === w.id} onClick={() => setSelected(w)}>{w.name} · {w.code}</Button>)}</div><Pager page={page} hasMore={warehouses.data.hasMore} busy={warehouses.isFetching} onChange={setPage} t={t} /></>}
    </CardContent></Card>
    {warehouse && company && <><p className="text-sm text-muted-foreground">{t("المستودع الحالي", "Current warehouse")}: {warehouse.name} · {warehouse.code}</p><WmsCountPanel key={`${company}:${warehouse.id}`} warehouse={warehouse.id} company={company} permissions={user?.permissions ?? []} t={t} /></>}
  </div>;
}
