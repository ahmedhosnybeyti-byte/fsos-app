"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, MapPin, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { AskAiPanel } from "@/components/visit-copilot-preview/ask-ai-panel";
import { DEMO_GEO_OPPORTUNITIES, getDemoVisitMeta } from "@/components/visit-copilot-preview/demo-intelligence";
import { QuickVisitBrief } from "@/components/visit-copilot-preview/quick-visit-brief";
import { VisitPlanCard } from "@/components/visit-copilot-preview/visit-plan-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { visitCopilotApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import type { VisitCopilotChatMessage, VisitCopilotPeriod } from "@/lib/types";

const PERIODS: { value: VisitCopilotPeriod; label: string }[] = [
  { value: "1m", label: "آخر شهر" },
  { value: "3m", label: "آخر 3 أشهر" },
  { value: "6m", label: "آخر 6 أشهر" },
  { value: "12m", label: "آخر 12 شهرًا" },
  { value: "custom", label: "فترة مخصصة" },
];

export default function VisitCopilotPreviewPage() {
  const [period, setPeriod] = useState<VisitCopilotPeriod>("3m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vanStock, setVanStock] = useState(false);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string | null>(null);
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<VisitCopilotChatMessage[]>([]);

  const customPeriodReady = period !== "custom" || (!!from && !!to && from <= to);
  const periodParams = { period, from: period === "custom" ? from || undefined : undefined, to: period === "custom" ? to || undefined : undefined };
  const planQuery = useQuery({
    queryKey: ["visit-copilot-preview", "daily-brief", period, from, to],
    queryFn: () => visitCopilotApi.dailyBrief(periodParams),
    enabled: customPeriodReady,
  });
  const briefingQuery = useQuery({
    queryKey: ["visit-copilot-preview", "briefing", selectedCustomerCode, period, from, to, vanStock],
    queryFn: () => visitCopilotApi.briefing({ customerCode: selectedCustomerCode!, ...periodParams, vanStock }),
    enabled: !!selectedCustomerCode && customPeriodReady,
  });
  const chatMutation = useMutation({
    mutationFn: visitCopilotApi.chat,
    onSuccess: (response) => setChatMessages((messages) => [...messages, { role: "assistant", content: response.reply }]),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر الحصول على إجابة الآن"),
  });

  function resetVisitContext() {
    setSelectedCustomerCode(null);
    setAskAiOpen(false);
    setChatMessages([]);
  }

  function openVisit(customerCode: string) {
    setSelectedCustomerCode(customerCode);
    setAskAiOpen(false);
    setChatMessages([]);
  }

  function sendChat(message: string) {
    if (!selectedCustomerCode || chatMutation.isPending) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    const history = chatMessages.slice(-10);
    setChatMessages((messages) => [...messages, { role: "user", content: trimmed }]);
    chatMutation.mutate({ customerCode: selectedCustomerCode, ...periodParams, vanStock, message: trimmed, history });
  }

  const customers = planQuery.data?.customers ?? [];
  const selectedIndex = customers.findIndex((customer) => customer.customerCode === selectedCustomerCode);
  const selectedCustomer = selectedIndex >= 0 ? customers[selectedIndex] : null;
  const demoMeta = selectedCustomer ? getDemoVisitMeta(selectedCustomer, selectedIndex) : null;

  return (
    <main dir="rtl" className="mx-auto max-w-3xl space-y-5 pb-8">
      <header className="space-y-2">
        <span className="inline-flex rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">نسخة واجهة مؤقتة للمراجعة</span>
        <h1 className="text-2xl font-bold tracking-tight">مساعد الزيارة الذكي</h1>
        <p className="text-sm text-muted-foreground">قرار واحد واضح لكل زيارة، بدون تقارير أو تفاصيل زائدة.</p>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">نطاق التحليل</Label>
          <Select value={period} onValueChange={(value) => { setPeriod(value as VisitCopilotPeriod); resetVisitContext(); }}>
            <SelectTrigger className="h-11 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {period === "custom" && <>
          <div className="grid gap-1.5"><Label className="text-xs">من</Label><Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); resetVisitContext(); }} className="h-11 w-36" /></div>
          <div className="grid gap-1.5"><Label className="text-xs">إلى</Label><Input type="date" value={to} onChange={(event) => { setTo(event.target.value); resetVisitContext(); }} className="h-11 w-36" /></div>
        </>}
        <label className="flex h-11 items-center gap-2 text-sm"><Switch checked={vanStock} onCheckedChange={setVanStock} /> مراعاة مخزون السيارة</label>
      </section>

      {!customPeriodReady && <p className="text-sm text-amber-600">حدّد تاريخ البداية والنهاية أولًا.</p>}

      {!selectedCustomerCode ? (
        <section className="space-y-3" aria-labelledby="today-plan-title">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-xs font-medium text-primary">وضع 1</p><h2 id="today-plan-title" className="text-lg font-semibold">خطة زيارات اليوم</h2></div>
            <span className="text-xs text-muted-foreground">اختر عميلًا لبدء الزيارة</span>
          </div>
          {planQuery.isLoading ? <div className="space-y-2"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div> : planQuery.isError ? (
            <p className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{planQuery.error instanceof ApiError ? planQuery.error.message : "تعذر تحميل خطة اليوم"}</p>
          ) : customers.length === 0 ? (
            <p className="rounded-xl border border-border/70 p-4 text-sm text-muted-foreground">لا توجد زيارات متاحة اليوم.</p>
          ) : <div className="space-y-2">{customers.map((customer, index) => <VisitPlanCard key={customer.customerCode} customer={customer} index={index} onOpen={openVisit} />)}</div>}
        </section>
      ) : (
        <section className="space-y-5" aria-labelledby="visit-mode-title">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-medium text-primary">وضع 2</p><h2 id="visit-mode-title" className="text-lg font-semibold">وضع الزيارة</h2></div>
            <Button variant="ghost" className="h-11" onClick={resetVisitContext}><ArrowRight className="h-4 w-4" /> خطة اليوم</Button>
          </div>

          {briefingQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-56" /></div> : briefingQuery.isError ? (
            <p className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">{briefingQuery.error instanceof ApiError ? briefingQuery.error.message : "تعذر تحميل ملخص الزيارة"}</p>
          ) : briefingQuery.data && demoMeta ? <>
            <section className="rounded-2xl bg-primary p-5 text-primary-foreground" aria-labelledby="mission-title">
              <p className="mb-2 flex items-center gap-2 text-sm text-primary-foreground/80"><Target className="h-4 w-4" /> مهمة الزيارة</p>
              <h3 id="mission-title" className="text-xl font-bold">{briefingQuery.data.suggestedGoal}</h3>
              <div className="mt-4 flex flex-wrap gap-2"><Badge className="bg-white/15 text-primary-foreground hover:bg-white/15">{demoMeta.mission}</Badge><Badge className="bg-white/15 text-primary-foreground hover:bg-white/15">الأولوية {Math.round(selectedCustomer?.priorityScore ?? 0)}</Badge></div>
              <p className="mt-3 text-xs text-primary-foreground/70">تصنيف المهمة مؤقت للعرض حتى ربطه بمحرك الذكاء.</p>
            </section>

            <QuickVisitBrief briefing={briefingQuery.data} />

            <section className="space-y-3" aria-labelledby="recommendations-title">
              <h2 id="recommendations-title" className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> توصيات الذكاء الاصطناعي</h2>
              <div className="space-y-2">{briefingQuery.data.actions.slice(0, 3).map((action, index) => <div key={index} className="flex items-start gap-2 rounded-xl border border-border/70 bg-card p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{action}</div>)}</div>
            </section>

            <section className="space-y-3" aria-labelledby="geo-title">
              <div className="flex items-center justify-between gap-2"><h2 id="geo-title" className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" /> ذكاء الموقع</h2><span className="text-[11px] text-amber-600">بيانات واجهة مؤقتة</span></div>
              <p className="text-xs text-muted-foreground">أفضل ثلاث فرص لدى العملاء القريبين على مسار اليوم.</p>
              <div className="space-y-2">{DEMO_GEO_OPPORTUNITIES.map((opportunity, index) => <div key={opportunity} className="rounded-xl border border-border/70 bg-card p-3 text-sm"><span className="ml-2 font-semibold text-primary">{index + 1}.</span>{opportunity}</div>)}</div>
            </section>

            {!askAiOpen ? <Button size="lg" className="h-14 w-full text-base" onClick={() => setAskAiOpen(true)}><Bot className="h-5 w-5" /> اسأل الذكاء الاصطناعي</Button> : <AskAiPanel messages={chatMessages} isPending={chatMutation.isPending} onSend={sendChat} />}

            {briefingQuery.data.warnings.length > 0 && <div className="space-y-1">{briefingQuery.data.warnings.map((warning, index) => <p key={index} className="flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{warning}</p>)}</div>}
          </> : null}
        </section>
      )}
    </main>
  );
}
