"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarClock, ExternalLink, MapPin, Radar, Save, UserRound } from "lucide-react";
import type { CompanyOpportunityStatus, MarketOpportunityType } from "@field-sales-os/schemas";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { opportunityRadarApi, type OpportunityAssignee, type OpportunityRadarItem } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { COMPANY_OPPORTUNITY_STATUS_LABELS, CONFIDENCE_LABELS, MARKET_STATUS_LABELS, eventProximity, opportunityLocation, primaryContact, safeExternalUrl } from "@/lib/opportunity-radar";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RadarTab = MarketOpportunityType | "ACT_NOW";
const TABS: Array<{ value: RadarTab; label: string }> = [
  { value: "PURCHASE", label: "شراء معلن" },
  { value: "EVENT", label: "فعاليات وفرص قريبة" },
  { value: "PROACTIVE", label: "فرص استباقية" },
  { value: "ACT_NOW", label: "تحرك الآن" },
];
const STATUS_VARIANTS: Record<CompanyOpportunityStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  NEW: "default", REVIEWED: "secondary", CONTACTED: "warning", QUALIFIED: "success", WON: "success", LOST: "destructive", EXPIRED: "outline",
};

export default function OpportunityRadarPage() {
  const { user, isLoading: authLoading } = useRequireAuth(["SALES_REP", "SUPERVISOR", "MANAGER", "COMPANY_ADMIN"]);
  const [tab, setTab] = useState<RadarTab>("PURCHASE");
  const [page, setPage] = useState(1);
  const query = { ...(tab === "ACT_NOW" ? { view: "ACT_NOW" as const } : { view: "ALL" as const, type: tab }), page, pageSize: 20 };
  const opportunities = useQuery({ queryKey: ["opportunity-radar", query], queryFn: () => opportunityRadarApi.list(query), enabled: !!user });
  const assignees = useQuery({ queryKey: ["opportunity-radar", "assignees"], queryFn: opportunityRadarApi.assignees, enabled: !!user });

  if (authLoading || !user) return <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-6 w-6" /></div>;

  return <div className="space-y-6" dir="rtl">
    <section className="glass-hero relative overflow-hidden p-5 sm:p-7">
      <div className="relative flex items-start gap-4">
        <span className="crystal-badge flex h-12 w-12 shrink-0 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"><Radar className="h-6 w-6" /></span>
        <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">رادار الفرص</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">بنك موحد للفرص السوقية المرتبطة بالمياه، جاهز لاستقبال مصادر خارجية لاحقًا وإدارة تحرك شركتك عليها الآن.</p></div>
      </div>
    </section>

    <Tabs value={tab} onValueChange={(value) => { setTab(value as RadarTab); setPage(1); }}>
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-grid sm:w-auto sm:grid-cols-4">
        {TABS.map((item) => <TabsTrigger key={item.value} value={item.value} className="min-h-10">{item.label}</TabsTrigger>)}
      </TabsList>
    </Tabs>

    {opportunities.isLoading ? <LoadingGrid /> : opportunities.isError ? <div className="glass-card p-5 text-sm text-destructive">تعذر تحميل الفرص. حاول مرة أخرى.</div> : opportunities.data?.items.length ? <>
      <div className="grid gap-4 xl:grid-cols-2">
        {opportunities.data.items.map((item) => <OpportunityCard key={item.id} item={item} assignees={assignees.data ?? []} canUnassign={user.role.code !== "SALES_REP"} />)}
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{opportunities.data.total} فرصة</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>السابق</Button><span className="flex items-center px-2">{page} / {opportunities.data.totalPages}</span><Button variant="outline" size="sm" disabled={page >= opportunities.data.totalPages} onClick={() => setPage((value) => value + 1)}>التالي</Button></div></div>
    </> : <div className="glass-card p-8 text-center"><Radar className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">لا توجد فرص في هذا العرض</h2><p className="mt-1 text-sm text-muted-foreground">الهيكل جاهز، وستظهر هنا الفرص المرتبطة بالشركة عند استيرادها لاحقًا.</p></div>}
  </div>;
}

function OpportunityCard({ item, assignees, canUnassign }: { item: OpportunityRadarItem; assignees: OpportunityAssignee[]; canUnassign: boolean }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(item.notes ?? "");
  const [outcome, setOutcome] = useState(item.outcome ?? "");
  const market = item.marketOpportunity;
  const contact = primaryContact(item);
  const sourceHref = safeExternalUrl(market.sourceUrl);
  const importantDate = market.deadlineAt ?? market.opportunityDate ?? market.publishedAt;
  const eventTiming = market.opportunityType === "EVENT" ? eventProximity(market.opportunityDate) : null;
  const update = useMutation({
    mutationFn: (input: Parameters<typeof opportunityRadarApi.update>[1]) => opportunityRadarApi.update(item.id, input),
    onSuccess: async () => { toast.success("تم تحديث الفرصة"); await queryClient.invalidateQueries({ queryKey: ["opportunity-radar"] }); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر تحديث الفرصة"),
  });
  return <Card className="card-lift overflow-hidden">
    <CardHeader className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="leading-7">{market.title}</CardTitle><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="h-4 w-4" />{market.organization}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{market.vertical}</Badge>{eventTiming && <Badge variant={eventTiming.urgent ? "destructive" : "warning"}>{eventTiming.label}</Badge>}<Badge variant={market.status === "OPEN" ? "success" : "secondary"}>السوق: {MARKET_STATUS_LABELS[market.status]}</Badge><Badge variant={STATUS_VARIANTS[item.status]}>الشركة: {COMPANY_OPPORTUNITY_STATUS_LABELS[item.status]}</Badge><Badge variant={market.confidence === "HIGH" ? "success" : market.confidence === "MEDIUM" ? "warning" : "secondary"}>ثقة {CONFIDENCE_LABELS[market.confidence]}</Badge></div></div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{opportunityLocation(item) || "الموقع غير محدد"}</span>{importantDate && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{market.deadlineAt ? "الموعد النهائي" : market.opportunityDate ? "تاريخ الفرصة" : "تاريخ النشر"}: {formatDate(importantDate, "ar-SA")}</span>}</div>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="rounded-xl border border-primary/15 bg-primary/[.04] p-3"><p className="text-xs font-semibold text-primary">لماذا هي فرصة؟</p><p className="mt-1 text-sm leading-6">{market.whyRelevant}</p></div>
      <p className="text-sm leading-6 text-muted-foreground">{market.description}</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-medium">حالة الشركة<Select value={item.status} onValueChange={(status) => update.mutate({ status: status as CompanyOpportunityStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(COMPANY_OPPORTUNITY_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1.5 text-xs font-medium">المسؤول<Select value={item.assignedTo?.id ?? "UNASSIGNED"} onValueChange={(value) => update.mutate({ assignedToUserId: value === "UNASSIGNED" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{canUnassign && <SelectItem value="UNASSIGNED">غير معين</SelectItem>}{assignees.map((person) => <SelectItem key={person.id} value={person.id}>{person.fullName}</SelectItem>)}</SelectContent></Select></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-medium">ملاحظات<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label><label className="space-y-1.5 text-xs font-medium">النتيجة<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} maxLength={2000} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4"><div className="flex flex-wrap gap-3 text-xs">{contact && <a href={contact.href} target={contact.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-primary underline-offset-4 hover:underline">{contact.label}: {contact.value}</a>}{sourceHref && <a href={sourceHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">المصدر: {market.sourceName}<ExternalLink className="h-3.5 w-3.5" /></a>}<span className="text-muted-foreground">آخر تحقق: {formatDate(market.lastVerifiedAt, "ar-SA")}</span>{item.contactedAt && <span className="text-muted-foreground">تم التواصل: {formatDate(item.contactedAt, "ar-SA")}</span>}{item.assignedTo && <span className="flex items-center gap-1 text-muted-foreground"><UserRound className="h-3.5 w-3.5" />{item.assignedTo.fullName}</span>}</div><Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ notes, outcome })}>{update.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}حفظ</Button></div>
    </CardContent>
  </Card>;
}

function LoadingGrid() { return <div className="grid gap-4 xl:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="glass-card space-y-4 p-5"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-full" /></div>)}</div>; }
