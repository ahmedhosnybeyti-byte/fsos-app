"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarClock, CheckCircle2, ExternalLink, EyeOff, MapPin, MapPinned, Radar, RotateCcw, Save, ShoppingCart, Star, UserRound, UsersRound } from "lucide-react";
import type { CompanyOpportunityStatus, MarketOpportunityType, OpportunityTeamFollowUpStatus } from "@field-sales-os/schemas";
import { toast } from "sonner";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { opportunityRadarApi, visitCopilotApi, type OpportunityAssignee, type OpportunityRadarItem, type OpportunityTeamFollowUpResponse } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { COMPANY_OPPORTUNITY_STATUS_LABELS, CONFIDENCE_LABELS, MARKET_STATUS_LABELS, eventProximity, opportunityMapLocation, primaryContact, safeExternalUrl } from "@/lib/opportunity-radar";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RadarTab = MarketOpportunityType | "ACT_NOW" | "TEAM_FOLLOW_UP";
const TABS: Array<{ value: RadarTab; label: string }> = [
  { value: "PURCHASE", label: "شراء معلن" },
  { value: "EVENT", label: "فعاليات وفرص قريبة" },
  { value: "PROACTIVE", label: "فرص استباقية" },
  { value: "ACT_NOW", label: "تحرك الآن" },
  { value: "TEAM_FOLLOW_UP", label: "متابعة فرص الفريق" },
];
const FOLLOW_UP_LABELS: Record<OpportunityTeamFollowUpStatus, string> = {
  ASSIGNED: "مسندة", SCHEDULED: "مجدولة", VISITED: "تمت الزيارة", AGREED: "تم الاتفاق", ORDERED: "تمت طلبية", UNSUCCESSFUL: "لم تنجح",
};
const STATUS_VARIANTS: Record<CompanyOpportunityStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  NEW: "default", REVIEWED: "secondary", CONTACTED: "warning", QUALIFIED: "success", WON: "success", LOST: "destructive", EXPIRED: "outline",
};
const todayIsoDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

export default function OpportunityRadarPage() {
  const { user, isLoading: authLoading } = useRequireAuth(["SALES_REP", "SUPERVISOR", "MANAGER", "COMPANY_ADMIN"]);
  const [tab, setTab] = useState<RadarTab>("PURCHASE");
  const [page, setPage] = useState(1);
  const [region, setRegion] = useState<string>();
  const [city, setCity] = useState<string>();
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [teamAssigneeId, setTeamAssigneeId] = useState<string>();
  const [teamStatus, setTeamStatus] = useState<OpportunityTeamFollowUpStatus>();
  const [teamFrom, setTeamFrom] = useState("");
  const [teamTo, setTeamTo] = useState("");
  const [teamPage, setTeamPage] = useState(1);
  const canFollowTeam = user?.role.code === "COMPANY_ADMIN" || user?.role.code === "MANAGER" || user?.role.code === "SUPERVISOR";
  const query = {
    ...(tab === "ACT_NOW" ? { view: "ACT_NOW" as const } : { view: "ALL" as const, type: tab === "TEAM_FOLLOW_UP" ? "PURCHASE" as const : tab }),
    region,
    city,
    favoriteOnly,
    visibility: showHidden ? "HIDDEN" as const : "VISIBLE" as const,
    page,
    pageSize: 20,
  };
  const opportunities = useQuery({ queryKey: ["opportunity-radar", query], queryFn: () => opportunityRadarApi.list(query), enabled: !!user && tab !== "TEAM_FOLLOW_UP" });
  const locations = useQuery({ queryKey: ["opportunity-radar", "locations", region], queryFn: () => opportunityRadarApi.locations({ region }), enabled: !!user && tab !== "TEAM_FOLLOW_UP" });
  const assignees = useQuery({ queryKey: ["opportunity-radar", "assignees"], queryFn: opportunityRadarApi.assignees, enabled: !!user });
  const teamQuery = { assignedToUserId: teamAssigneeId, status: teamStatus, from: teamFrom || undefined, to: teamTo || undefined, page: teamPage, pageSize: 20 };
  const teamFollowUp = useQuery({ queryKey: ["opportunity-radar", "team-follow-up", teamQuery], queryFn: () => opportunityRadarApi.teamFollowUp(teamQuery), enabled: !!user && canFollowTeam && tab === "TEAM_FOLLOW_UP" });

  if (authLoading || !user) return <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-6 w-6" /></div>;

  return <div className="space-y-6" dir="rtl">
    <section className="glass-hero relative overflow-hidden p-5 sm:p-7">
      <div className="relative flex items-start gap-4">
        <span className="crystal-badge flex h-12 w-12 shrink-0 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"><Radar className="h-6 w-6" /></span>
        <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">رادار الفرص</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">بنك موحد للفرص السوقية المرتبطة بالمياه، جاهز لاستقبال مصادر خارجية لاحقًا وإدارة تحرك شركتك عليها الآن.</p></div>
      </div>
    </section>

    <Tabs value={tab} onValueChange={(value) => { setTab(value as RadarTab); setPage(1); }}>
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:inline-grid sm:w-auto sm:grid-cols-5">
        {TABS.filter((item) => item.value !== "TEAM_FOLLOW_UP" || canFollowTeam).map((item) => <TabsTrigger key={item.value} value={item.value} className="min-h-10">{item.label}</TabsTrigger>)}
      </TabsList>
    </Tabs>

    {tab === "TEAM_FOLLOW_UP" ? <TeamFollowUpPanel
      data={teamFollowUp.data}
      isLoading={teamFollowUp.isLoading}
      isError={teamFollowUp.isError}
      assignees={assignees.data ?? []}
      assigneeId={teamAssigneeId}
      status={teamStatus}
      from={teamFrom}
      to={teamTo}
      page={teamPage}
      onAssignee={(value) => { setTeamAssigneeId(value); setTeamPage(1); }}
      onStatus={(value) => { setTeamStatus(value); setTeamPage(1); }}
      onFrom={(value) => { setTeamFrom(value); setTeamPage(1); }}
      onTo={(value) => { setTeamTo(value); setTeamPage(1); }}
      onPage={setTeamPage}
    /> : <>
    <div className="glass-card flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
      <label className="min-w-52 flex-1 space-y-1.5 text-xs font-medium">المنطقة
        <Select value={region ?? "ALL"} onValueChange={(value) => { setRegion(value === "ALL" ? undefined : value); setCity(undefined); setPage(1); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">جميع المناطق</SelectItem>{locations.data?.regions.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      <label className="min-w-52 flex-1 space-y-1.5 text-xs font-medium">المدينة
        <Select value={city ?? "ALL"} onValueChange={(value) => { setCity(value === "ALL" ? undefined : value); setPage(1); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">جميع المدن</SelectItem>{locations.data?.cities.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </label>
      <Button type="button" variant={favoriteOnly ? "default" : "outline"} onClick={() => { setFavoriteOnly((value) => !value); setPage(1); }}><Star className={favoriteOnly ? "h-4 w-4 fill-current" : "h-4 w-4"} />المفضلة فقط</Button>
      <Button type="button" variant={showHidden ? "secondary" : "outline"} onClick={() => { setShowHidden((value) => !value); setPage(1); }}><EyeOff className="h-4 w-4" />{showHidden ? "العودة للفرص" : "عرض المخفية"}</Button>
    </div>

    {opportunities.isLoading ? <LoadingGrid /> : opportunities.isError ? <div className="glass-card p-5 text-sm text-destructive">تعذر تحميل الفرص. حاول مرة أخرى.</div> : opportunities.data?.items.length ? <>
      <div className="grid gap-4 xl:grid-cols-2">
        {opportunities.data.items.map((item) => <OpportunityCard key={item.id} item={item} assignees={assignees.data ?? []} canUnassign={user.role.code !== "SALES_REP"} currentUserId={user.id} />)}
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{opportunities.data.total} فرصة</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>السابق</Button><span className="flex items-center px-2">{page} / {opportunities.data.totalPages}</span><Button variant="outline" size="sm" disabled={page >= opportunities.data.totalPages} onClick={() => setPage((value) => value + 1)}>التالي</Button></div></div>
    </> : <div className="glass-card p-8 text-center"><Radar className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">لا توجد فرص في هذا العرض</h2><p className="mt-1 text-sm text-muted-foreground">لا توجد فرص مطابقة للفلاتر الحالية ضمن نطاق صلاحياتك.</p></div>}
    </>}
  </div>;
}

function TeamFollowUpPanel({
  data, isLoading, isError, assignees, assigneeId, status, from, to, page,
  onAssignee, onStatus, onFrom, onTo, onPage,
}: {
  data?: OpportunityTeamFollowUpResponse;
  isLoading: boolean;
  isError: boolean;
  assignees: OpportunityAssignee[];
  assigneeId?: string;
  status?: OpportunityTeamFollowUpStatus;
  from: string;
  to: string;
  page: number;
  onAssignee: (value?: string) => void;
  onStatus: (value?: OpportunityTeamFollowUpStatus) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onPage: (value: number | ((current: number) => number)) => void;
}) {
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryCard icon={<UsersRound className="h-5 w-5" />} label="الفرص المسندة" value={data?.summary.assigned} />
      <SummaryCard icon={<CheckCircle2 className="h-5 w-5" />} label="الفرص المنفذة" value={data?.summary.executed} />
      <SummaryCard icon={<ShoppingCart className="h-5 w-5" />} label="نتج عنها طلبيات" value={data?.summary.ordered} />
    </div>
    <div className="glass-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="space-y-1.5 text-xs font-medium">المندوب<Select value={assigneeId ?? "ALL"} onValueChange={(value) => onAssignee(value === "ALL" ? undefined : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">جميع الفريق</SelectItem>{assignees.map((person) => <SelectItem key={person.id} value={person.id}>{person.fullName}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1.5 text-xs font-medium">الحالة<Select value={status ?? "ALL"} onValueChange={(value) => onStatus(value === "ALL" ? undefined : value as OpportunityTeamFollowUpStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">جميع الحالات</SelectItem>{Object.entries(FOLLOW_UP_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1.5 text-xs font-medium">من<Input type="date" value={from} onChange={(event) => onFrom(event.target.value)} /></label>
      <label className="space-y-1.5 text-xs font-medium">إلى<Input type="date" min={from || undefined} value={to} onChange={(event) => onTo(event.target.value)} /></label>
    </div>
    {isLoading ? <LoadingGrid /> : isError ? <div className="glass-card p-5 text-sm text-destructive">تعذر تحميل متابعة فرص الفريق.</div> : data?.items.length ? <>
      <div className="grid gap-4 xl:grid-cols-2">
        {data.items.map((item) => <Card key={item.id} className="card-lift"><CardHeader className="space-y-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="leading-7">{item.marketOpportunity.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{item.marketOpportunity.organization}</p></div><Badge variant={item.followUpStatus === "ORDERED" ? "success" : item.followUpStatus === "UNSUCCESSFUL" ? "destructive" : "secondary"}>{FOLLOW_UP_LABELS[item.followUpStatus]}</Badge></div></CardHeader><CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{item.assignedTo?.fullName ?? "غير معين"}</span><span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{item.visitDate ? formatDate(item.visitDate, "ar-SA") : "لم تُحدد زيارة"}</span><span>آخر تحديث: {formatDate(item.updatedAt, "ar-SA")}</span></div>
          {item.outcome && <div><p className="text-xs font-semibold text-muted-foreground">نتيجة الزيارة</p><p className="mt-1">{item.outcome}</p></div>}
          {item.notes && <div><p className="text-xs font-semibold text-muted-foreground">الملاحظات</p><p className="mt-1 text-muted-foreground">{item.notes}</p></div>}
          {item.followUpStatus === "ORDERED" && <div className="flex flex-wrap gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[.05] p-3 text-xs">{item.orderValue != null && <span>قيمة الطلبية: {Number(item.orderValue).toLocaleString("ar-SA")}</span>}{item.orderQuantity != null && <span>الكمية: {Number(item.orderQuantity).toLocaleString("ar-SA")}</span>}</div>}
        </CardContent></Card>)}
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{data.total} فرصة</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage((value) => value - 1)}>السابق</Button><span className="flex items-center px-2">{page} / {data.totalPages}</span><Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => onPage((value) => value + 1)}>التالي</Button></div></div>
    </> : <div className="glass-card p-8 text-center"><UsersRound className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">لا توجد فرص فريق مطابقة</h2><p className="mt-1 text-sm text-muted-foreground">جرّب تعديل المندوب أو الحالة أو الفترة الزمنية.</p></div>}
  </div>;
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value?: number }) {
  return <div className="glass-card flex items-center gap-3 p-4"><span className="crystal-badge h-10 w-10 bg-primary/10 text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value ?? "—"}</p></div></div>;
}

function OpportunityCard({ item, assignees, canUnassign, currentUserId }: { item: OpportunityRadarItem; assignees: OpportunityAssignee[]; canUnassign: boolean; currentUserId: string }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(item.notes ?? "");
  const [outcome, setOutcome] = useState(item.outcome ?? "");
  const [scheduledFor, setScheduledFor] = useState(item.scheduledVisitFor?.slice(0, 10) ?? "");
  const market = item.marketOpportunity;
  const contact = primaryContact(item);
  const mapLocation = opportunityMapLocation(item);
  const sourceHref = safeExternalUrl(market.sourceUrl);
  const importantDate = market.deadlineAt ?? market.opportunityDate ?? market.publishedAt;
  const eventTiming = market.opportunityType === "EVENT" ? eventProximity(market.opportunityDate) : null;
  const update = useMutation({
    mutationFn: (input: Parameters<typeof opportunityRadarApi.update>[1]) => opportunityRadarApi.update(item.id, input),
    onSuccess: async () => { toast.success("تم تحديث الفرصة"); await queryClient.invalidateQueries({ queryKey: ["opportunity-radar"] }); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر تحديث الفرصة"),
  });
  const preference = useMutation({
    mutationFn: (input: Parameters<typeof opportunityRadarApi.updatePreference>[1]) => opportunityRadarApi.updatePreference(item.id, input),
    onSuccess: async (_, input) => {
      toast.success(input.isHidden === true ? "تم إخفاء الفرصة لك" : input.isHidden === false ? "تمت استعادة الفرصة" : input.isFavorite ? "تمت الإضافة إلى المفضلة" : "تمت الإزالة من المفضلة");
      await queryClient.invalidateQueries({ queryKey: ["opportunity-radar"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر حفظ التفضيل"),
  });
  const schedule = useMutation({
    mutationFn: (date: string) => visitCopilotApi.scheduleRadarOpportunity({ companyOpportunityId: item.id, scheduledFor: date }),
    onSuccess: async (_data, date) => {
      setScheduledFor(date);
      toast.success(date === todayIsoDate() ? "تمت إضافة الفرصة إلى خط سير اليوم" : "تمت جدولة الفرصة في خط السير");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["opportunity-radar"] }),
        queryClient.invalidateQueries({ queryKey: ["visit-copilot", "daily-brief"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر جدولة الفرصة"),
  });
  return <Card className="card-lift overflow-hidden">
    <CardHeader className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="leading-7">{market.title}</CardTitle><p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="h-4 w-4" />{market.organization}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{market.vertical}</Badge>{eventTiming && <Badge variant={eventTiming.urgent ? "destructive" : "warning"}>{eventTiming.label}</Badge>}<Badge variant={market.status === "OPEN" ? "success" : "secondary"}>السوق: {MARKET_STATUS_LABELS[market.status]}</Badge><Badge variant={STATUS_VARIANTS[item.status]}>الشركة: {COMPANY_OPPORTUNITY_STATUS_LABELS[item.status]}</Badge><Badge variant={market.confidence === "HIGH" ? "success" : market.confidence === "MEDIUM" ? "warning" : "secondary"}>ثقة {CONFIDENCE_LABELS[market.confidence]}</Badge></div></div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{mapLocation.label || "الموقع غير محدد"}{!mapLocation.precise && market.city ? " — الموقع الدقيق غير متحقق" : ""}</span>{importantDate && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{market.deadlineAt ? "الموعد النهائي" : market.opportunityDate ? "تاريخ الفرصة" : "تاريخ النشر"}: {formatDate(importantDate, "ar-SA")}</span>}</div>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="rounded-xl border border-primary/15 bg-primary/[.04] p-3"><p className="text-xs font-semibold text-primary">لماذا هي فرصة؟</p><p className="mt-1 text-sm leading-6">{market.whyRelevant}</p></div>
      <p className="text-sm leading-6 text-muted-foreground">{market.description}</p>
      {item.assignedTo?.id === currentUserId && <div className="flex flex-wrap items-end gap-2 rounded-xl border border-ai/20 bg-ai/[.04] p-3">
        <Button size="sm" disabled={schedule.isPending || item.scheduledVisitFor?.slice(0, 10) === todayIsoDate()} onClick={() => schedule.mutate(todayIsoDate())}>أضف اليوم</Button>
        <label className="min-w-44 space-y-1 text-xs font-medium">تاريخ الزيارة<Input type="date" min={todayIsoDate()} value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label>
        <Button size="sm" variant="secondary" disabled={!scheduledFor || schedule.isPending || item.scheduledVisitFor?.slice(0, 10) === scheduledFor} onClick={() => schedule.mutate(scheduledFor)}>جدولة لاحقًا</Button>
        {item.scheduledVisitFor && <span className="text-xs text-muted-foreground">مجدولة حاليًا: {formatDate(item.scheduledVisitFor, "ar-SA")}</span>}
      </div>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-medium">حالة الشركة<Select value={item.status} onValueChange={(status) => update.mutate({ status: status as CompanyOpportunityStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(COMPANY_OPPORTUNITY_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1.5 text-xs font-medium">المسؤول<Select value={item.assignedTo?.id ?? "UNASSIGNED"} onValueChange={(value) => update.mutate({ assignedToUserId: value === "UNASSIGNED" ? null : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{canUnassign && <SelectItem value="UNASSIGNED">غير معين</SelectItem>}{assignees.map((person) => <SelectItem key={person.id} value={person.id}>{person.fullName}</SelectItem>)}</SelectContent></Select></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-medium">ملاحظات<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label><label className="space-y-1.5 text-xs font-medium">النتيجة<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} maxLength={2000} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" /></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4"><div className="flex flex-wrap gap-3 text-xs">{contact && <a href={contact.href} target={contact.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-primary underline-offset-4 hover:underline">{contact.label}: {contact.value}</a>}{mapLocation.href && <a href={mapLocation.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"><MapPinned className="h-3.5 w-3.5" />فتح الموقع</a>}{sourceHref && <a href={sourceHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">المصدر: {market.sourceName}<ExternalLink className="h-3.5 w-3.5" /></a>}<span className="text-muted-foreground">آخر تحقق: {formatDate(market.lastVerifiedAt, "ar-SA")}</span>{item.contactedAt && <span className="text-muted-foreground">تم التواصل: {formatDate(item.contactedAt, "ar-SA")}</span>}{item.assignedTo && <span className="flex items-center gap-1 text-muted-foreground"><UserRound className="h-3.5 w-3.5" />{item.assignedTo.fullName}</span>}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={preference.isPending} onClick={() => preference.mutate({ isFavorite: !item.isFavorite })}><Star className={item.isFavorite ? "h-4 w-4 fill-current text-amber-500" : "h-4 w-4"} />{item.isFavorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}</Button><Button size="sm" variant="ghost" disabled={preference.isPending} onClick={() => preference.mutate({ isHidden: !item.isHidden })}>{item.isHidden ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{item.isHidden ? "استرجاع" : "إخفاء"}</Button><Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ notes, outcome })}>{update.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}حفظ</Button></div></div>
    </CardContent>
  </Card>;
}

function LoadingGrid() { return <div className="grid gap-4 xl:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="glass-card space-y-4 p-5"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-full" /></div>)}</div>; }
