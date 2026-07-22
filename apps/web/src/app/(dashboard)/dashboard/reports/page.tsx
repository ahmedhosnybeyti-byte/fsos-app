"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { companiesApi, sgiApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { generateSgiReportPptx, type SgiReport360Row, type SgiReportSection } from "@/lib/export/sgi-report-pptx";
import type { SgiRepDirectoryEntry, SgiSeverity, SgiSituationType } from "@/lib/types";

// Reports (Task #254, explicit product request — "الزغلول الكبير"): a
// SUPERVISOR/MANAGER/COMPANY_ADMIN-only wizard that turns the same SGI data
// already shown on the Sales Growth screen into a branded PowerPoint for a
// team meeting. Deliberately excludes SALES_REP — the user's own words were
// "هاتظهر للمشرف والمدير ومدير المنطقة - المندوب لا".
//
// Reuses GET /sgi/latest (no new backend endpoint) — the wizard's "scope"
// step only lets the viewer narrow DOWN within whatever `repDirectory`
// their role already exposes (a SUPERVISOR's own reps, or every rep in the
// company for MANAGER/COMPANY_ADMIN). Picking a rep/team outside that isn't
// possible today (see sgi.service.ts — there's no arbitrary org-unit/rep-set
// filter param), same limitation Task #145 is already tracking separately.

const TYPE_LABEL: Record<SgiSituationType, string> = {
  TARGET_BEHIND: "متأخر عن الهدف",
  LOST_SALES: "توقف شراء",
  CUSTOMER_DECLINING: "تراجع",
  CUSTOMER_INACTIVE: "خامل",
  COLLECTION_RISK: "تحصيل",
  GROWTH_OPPORTUNITY: "فرصة نمو",
  PRODUCT_DECLINE: "تراجع صنف",
};
// Fixed, sensible slide order — not just "however they appear in the data".
const TYPE_ORDER: SgiSituationType[] = [
  "TARGET_BEHIND",
  "LOST_SALES",
  "CUSTOMER_DECLINING",
  "CUSTOMER_INACTIVE",
  "COLLECTION_RISK",
  "GROWTH_OPPORTUNITY",
  "PRODUCT_DECLINE",
];
// "360 درجة" table pagination — must match sgi-report-pptx.ts's
// REP_360_ROWS_PER_SLIDE, kept as a separate constant here since the
// wizard only needs it for the slide-count estimate on step 3, not the
// actual pptx generation.
const REP_360_ROWS_PER_SLIDE = 12;
const SEVERITY_RANK: Record<SgiSeverity, number> = { high: 0, medium: 1, low: 2 };
const MAX_PER_TYPE_OPTIONS = [3, 5, 6];
const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function formatPeriodLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodMonth;
  return `${ARABIC_MONTHS[m - 1]} ${y}`;
}

export default function ReportsPage() {
  const { user } = useRequireAuth(["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"]);
  const latestQuery = useQuery({ queryKey: ["sgi", "latest"], queryFn: sgiApi.latest });
  const companyQuery = useQuery({ queryKey: ["companies", "me"], queryFn: companiesApi.me });
  const latest = latestQuery.data;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  // null = "not touched by the user yet" -> defaults to everyone/every type.
  // Once the user unchecks even one box these become real Sets, including
  // possibly-empty ones (deliberately distinct from null).
  const [selectedReps, setSelectedReps] = useState<Set<string> | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<SgiSituationType> | null>(null);
  const [maxPerType, setMaxPerType] = useState(5);
  // "360 درجة" (Task #261, explicit product request): a real per-rep KPI
  // snapshot (sales/target/collection/active customers/top product) for
  // whoever is picked in step 1 — separate from the situation-type
  // checkboxes below since it isn't situation-derived. Defaults on, since
  // the user called it "الأقيم واحد فيهم" (the most valuable one).
  const [include360, setInclude360] = useState(true);
  const [generating, setGenerating] = useState(false);

  const repDirectory = useMemo(() => latest?.repDirectory ?? [], [latest]);
  const allRepEmails = useMemo(() => new Set(repDirectory.map((r) => r.email)), [repDirectory]);
  const effectiveSelectedReps = selectedReps ?? allRepEmails;
  const isFullScope = effectiveSelectedReps.size >= allRepEmails.size;

  // Step 1 grouping (Task #260, explicit product request — "القطاع
  // (المشرف)"): repDirectory already carries each rep's supervisorName
  // (see sgi.service.ts's getLatest), so this needs no backend change —
  // just a client-side group-by. Reps with no resolvable supervisor
  // (ownerRepEmail resolved but supervisorEmail came back null) land in a
  // single "بدون مشرف" bucket rather than being dropped.
  const repGroups = useMemo(() => {
    const map = new Map<string, SgiRepDirectoryEntry[]>();
    for (const r of repDirectory) {
      const key = r.supervisorName ?? "بدون مشرف";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([supervisorName, reps]) => ({ supervisorName, reps }));
  }, [repDirectory]);

  // A situation with no attributable rep (ownerRepEmail: null — see
  // sgi.schemas.ts) only makes sense to include when viewing the FULL
  // scope; once the wizard narrows to a chosen subset of reps, an
  // unattributed situation can't be confidently said to belong to that
  // subset, so it's dropped rather than guessed at.
  const scopedSituations = useMemo(() => {
    if (!latest) return [];
    return latest.situations.filter((s) => (s.ownerRepEmail === null ? isFullScope : effectiveSelectedReps.has(s.ownerRepEmail)));
    // effectiveSelectedReps gets a genuinely new Set reference on every
    // meaningful change (toggleRep/select-all/deselect-all all construct a
    // fresh Set), so depending on the reference itself — not just its
    // size — correctly catches "same count, different members" toggles.
  }, [latest, effectiveSelectedReps, isFullScope]);

  const typesPresent = useMemo(() => {
    const present = new Set<SgiSituationType>();
    for (const s of scopedSituations) present.add(s.type);
    return TYPE_ORDER.filter((t) => present.has(t));
  }, [scopedSituations]);

  const effectiveSelectedTypes = selectedTypes ?? new Set(typesPresent);

  const sections: SgiReportSection[] = useMemo(() => {
    return typesPresent
      .filter((t) => effectiveSelectedTypes.has(t))
      .map((type) => ({
        type,
        label: TYPE_LABEL[type],
        situations: scopedSituations
          .filter((s) => s.type === type)
          .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
          .slice(0, maxPerType),
      }));
  }, [typesPresent, effectiveSelectedTypes, scopedSituations, maxPerType]);

  const totalSituations = sections.reduce((sum, s) => sum + s.situations.length, 0);
  const severityCounts = sections.reduce(
    (acc, s) => {
      for (const sit of s.situations) acc[sit.severity] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 } as Record<SgiSeverity, number>,
  );
  const rep360Count = include360 ? effectiveSelectedReps.size : 0;
  const slideCount =
    sections.filter((s) => s.situations.length > 0).length + (rep360Count > 0 ? Math.ceil(rep360Count / REP_360_ROWS_PER_SLIDE) : 0) + 3; // cover + summary + closing
  const canGenerate = totalSituations > 0 || rep360Count > 0;

  function scopeLabel(): string {
    if (isFullScope) return repDirectory.length > 0 ? `كل الفريق (${repDirectory.length})` : "الشركة كاملة";
    const names = repDirectory.filter((r) => effectiveSelectedReps.has(r.email)).map((r) => r.name);
    return names.length <= 3 ? names.join("، ") : `${names.slice(0, 3).join("، ")} +${names.length - 3}`;
  }

  function toggleRep(email: string, checked: boolean) {
    const next = new Set(effectiveSelectedReps);
    if (checked) next.add(email);
    else next.delete(email);
    setSelectedReps(next);
  }

  function toggleGroup(reps: SgiRepDirectoryEntry[], checked: boolean) {
    const next = new Set(effectiveSelectedReps);
    for (const r of reps) {
      if (checked) next.add(r.email);
      else next.delete(r.email);
    }
    setSelectedReps(next);
  }

  function toggleType(type: SgiSituationType, checked: boolean) {
    const next = new Set(effectiveSelectedTypes);
    if (checked) next.add(type);
    else next.delete(type);
    setSelectedTypes(next);
  }

  async function handleGenerate() {
    if (!latest) return;
    setGenerating(true);
    try {
      const rep360: SgiReport360Row[] | undefined = include360
        ? repDirectory
            .filter((r) => effectiveSelectedReps.has(r.email))
            .map((r) => {
              const stats = latest.repStats[r.email];
              return {
                name: r.name,
                salesActual: stats?.salesActual ?? 0,
                salesTarget: stats?.salesTarget ?? null,
                collectionActual: stats?.collectionActual ?? 0,
                activeCustomers: stats?.activeCustomers ?? 0,
                topProductName: stats?.topProducts[0]?.name ?? null,
              };
            })
        : undefined;

      await generateSgiReportPptx({
        companyName: companyQuery.data?.name ?? "Field Sales OS",
        scopeLabel: scopeLabel(),
        periodLabel: formatPeriodLabel(latest.periodMonth),
        generatedByName: user?.fullName ?? "",
        generatedDateLabel: new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
        // Deliberately the VIEWER's own natural SGI scope (team total for a
        // SUPERVISOR, company total for MANAGER/COMPANY_ADMIN) rather than
        // recomputed for the chosen rep subset — see sgi-report-pptx.ts's
        // comment on the summary slide for why a narrower target/actual
        // figure isn't available today.
        monthlyGoal: latest.summary.monthlyGoal,
        totalSituations,
        severityCounts,
        sections,
        rep360,
      });
      toast.success("تم توليد العرض التقديمي بنجاح");
    } catch {
      toast.error("حصل خطأ أثناء توليد العرض — حاول تاني");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <FileText className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">التقارير</h1>
          <p className="text-muted-foreground">جهّز عرض PowerPoint احترافي من بيانات نمو المبيعات لاجتماعك مع الفريق.</p>
        </div>
      </div>

      {latestQuery.isLoading ? (
        <Card className="glass-card rise-in rise-d1">
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Spinner className="h-4 w-4" />
            جاري التحميل...
          </CardContent>
        </Card>
      ) : !latest || latest.situations.length === 0 ? (
        <Card className="glass-card rise-in rise-d1">
          <CardContent className="space-y-2 py-10 text-center">
            <p className="text-muted-foreground">لسه مفيش بيانات محسوبة لنمو المبيعات.</p>
            <p className="text-sm text-muted-foreground">روح لشاشة "ازاي نزود مبيعاتك" واعمل تحديث الأولويات الأول، وبعدين ارجع هنا.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rise-in rise-d1 flex gap-2">
            <Badge variant={step === 1 ? "default" : "secondary"}>1. النطاق</Badge>
            <Badge variant={step === 2 ? "default" : "secondary"}>2. المحتوى</Badge>
            <Badge variant={step === 3 ? "default" : "secondary"}>3. المعاينة والتوليد</Badge>
          </div>

          <Card className="glass-card rise-in rise-d2">
            <CardHeader>
              <CardTitle>
                {step === 1 && "مين هيشمله التقرير؟"}
                {step === 2 && "إيه اللي هيتعرض؟"}
                {step === 3 && "معاينة وتوليد"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 1 && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">اختار المناديب اللي هيشملهم التقرير — افتراضيًا الكل متحدد.</p>
                    <div className="flex gap-1.5">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedReps(new Set(allRepEmails))}>
                        تحديد الكل
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedReps(new Set())}>
                        إلغاء الكل
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-96 space-y-3 overflow-y-auto">
                    {repGroups.map((g) => {
                      const allChecked = g.reps.every((r) => effectiveSelectedReps.has(r.email));
                      return (
                        <div key={g.supervisorName} className="rounded-md border border-border p-2.5">
                          <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-border pb-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                              checked={allChecked}
                              onChange={(e) => toggleGroup(g.reps, e.target.checked)}
                            />
                            {g.supervisorName}
                            <span className="font-normal text-muted-foreground">({g.reps.length})</span>
                          </label>
                          <div className="grid gap-2 ps-6 sm:grid-cols-2">
                            {g.reps.map((r) => (
                              <label key={r.email} className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                                  checked={effectiveSelectedReps.has(r.email)}
                                  onChange={(e) => toggleRep(r.email, e.target.checked)}
                                />
                                <span className="truncate">{r.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button disabled={effectiveSelectedReps.size === 0} onClick={() => setStep(2)}>
                    التالي — اختيار المحتوى
                  </Button>
                </>
              )}

              {step === 2 && (
                <>
                  <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="flex gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={include360}
                        onChange={(e) => setInclude360(e.target.checked)}
                      />
                      <span>
                        <span className="block font-medium">360 درجة</span>
                        <span className="block text-xs text-muted-foreground">
                          ملخص شامل حقيقي (مبيعات، تحصيل، عملاء نشطين، أهم صنف) لكل مندوب اخترته في الخطوة الأولى — مش مبني على الحالات.
                        </span>
                      </span>
                    </span>
                    <Badge variant="secondary">{effectiveSelectedReps.size}</Badge>
                  </label>
                  <p className="text-sm text-muted-foreground">اختار أنواع الحالات اللي هتظهر — افتراضيًا كل نوع موجود في النطاق المختار.</p>
                  <div className="space-y-2">
                    {typesPresent.map((t) => (
                      <label key={t} className="flex cursor-pointer items-center justify-between rounded-md border border-border p-2.5 text-sm">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                            checked={effectiveSelectedTypes.has(t)}
                            onChange={(e) => toggleType(t, e.target.checked)}
                          />
                          {TYPE_LABEL[t]}
                        </span>
                        <Badge variant="secondary">{scopedSituations.filter((s) => s.type === t).length}</Badge>
                      </label>
                    ))}
                  </div>
                  <div className="grid max-w-xs gap-2">
                    <Label>أقصى عدد حالات لكل نوع في العرض</Label>
                    <Select value={String(maxPerType)} onValueChange={(v) => setMaxPerType(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAX_PER_TYPE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      رجوع
                    </Button>
                    <Button disabled={effectiveSelectedTypes.size === 0 && !include360} onClick={() => setStep(3)}>
                      التالي — المعاينة
                    </Button>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatBox label="المناديب المختارين" value={effectiveSelectedReps.size} />
                    <StatBox label="إجمالي الحالات" value={totalSituations} />
                    <StatBox label="عدد الشرائح تقريبًا" value={slideCount} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    النطاق: <span className="font-medium text-foreground">{scopeLabel()}</span> — الفترة:{" "}
                    <span className="font-medium text-foreground">{formatPeriodLabel(latest.periodMonth)}</span>
                  </p>
                  {!canGenerate && (
                    <p className="text-sm text-warning">مفيش حالات ولا 360 درجة مفعّلة للاختيار الحالي — ارجع وغيّر النطاق أو الأنواع.</p>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setStep(2)}>
                      رجوع
                    </Button>
                    <Button disabled={generating || !canGenerate} onClick={handleGenerate}>
                      {generating ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                      {generating ? "جاري التوليد..." : "توليد العرض التقديمي"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-2xl font-semibold tracking-tight">{value.toLocaleString("en-US")}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
