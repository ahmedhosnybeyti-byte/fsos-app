"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Filter, Footprints } from "lucide-react";
import { toast } from "sonner";
import { visitEfficiencyApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GROUP_COLORS } from "@/components/route-planning/route-split-map";
import { useTranslation } from "@/components/translation-provider";
import { VisitMap } from "@/components/visit-efficiency/visit-map";
import type { VisitEfficiencyResult, VisitEfficiencyScopeField } from "@/lib/types";

// Visit Efficiency Map (GVE catalog): sorts each rep's visits within a day
// into a sequence and measures the distance between consecutive stops — big
// jumps flag backtracking/zigzagging. See visit-efficiency.schemas.ts for
// the exact scoring.
//
// Migration #6 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping anymore. Visits/Routes/Employees/Customers are resolved
// automatically via RieFacade (rep identity via Visits.RouteID ->
// Routes.SalesRepID -> Employees; coordinates prefer Visits' own
// Latitude/Longitude, falling back to the joined Customer's) — only the
// business choices remain (optional scope filter, date range).
const SCOPE_FIELDS: { value: VisitEfficiencyScopeField; label: string }[] = [
  { value: "RouteID", label: "الخط (Route)" },
  { value: "City", label: "المدينة" },
  { value: "CustomerClass", label: "فئة العميل" },
  { value: "Channel", label: "القناة" },
];

export default function VisitEfficiencyPage() {
  const { t, locale } = useTranslation();
  const [scopeField, setScopeField] = useState<VisitEfficiencyScopeField | "">("");
  const [selectedScopeValues, setSelectedScopeValues] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const scopeValuesQuery = useQuery({
    queryKey: ["visit-efficiency", "scope-values", scopeField],
    queryFn: () => visitEfficiencyApi.scopeValues({ scopeField: scopeField as VisitEfficiencyScopeField }),
    enabled: !!scopeField,
  });

  const [result, setResult] = useState<VisitEfficiencyResult | null>(null);
  // Which reps' points show on the map — same "dropdown + select-all"
  // pattern as Customer Similarity's group filter, keyed by rep name
  // instead of a cluster index since this map has no cluster groups.
  const [visibleReps, setVisibleReps] = useState<Set<string>>(new Set());
  // Click a rep's row in the summary table to expand/collapse their
  // individual visit legs (date, customer, distance from previous stop).
  const [expandedReps, setExpandedReps] = useState<Set<string>>(new Set());

  const queryMutation = useMutation({
    mutationFn: visitEfficiencyApi.query,
    onSuccess: (data) => {
      setResult(data);
      setExpandedReps(new Set());
      setVisibleReps(new Set(data.repSummaries.map((r) => r.rep)));
      toast.success(`${data.usedVisits} زيارة على ${data.repSummaries.length} مندوب`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر تنفيذ التحليل"),
  });

  // Map-only filter, same reasoning as Customer Similarity's mapResult: the
  // table below always lists every rep regardless of this filter.
  const mapPoints = useMemo(() => {
    if (!result) return [];
    if (visibleReps.size === result.repSummaries.length) return result.points;
    return result.points.filter((p) => visibleReps.has(p.rep));
  }, [result, visibleReps]);

  const repNames = useMemo(() => result?.repSummaries.map((r) => r.rep) ?? [], [result]);

  // Subtotal row under the results table. avgDistanceKmPerVisit is the
  // weighted total (totalDistance / totalVisits), not an average of the
  // per-rep averages — a rep with 2 visits and a rep with 200 shouldn't
  // count equally toward the overall average.
  const totals = useMemo(() => {
    const reps = result?.repSummaries ?? [];
    const visitDays = reps.reduce((s, r) => s + r.visitDays, 0);
    const totalVisits = reps.reduce((s, r) => s + r.totalVisits, 0);
    const totalDistanceKm = reps.reduce((s, r) => s + r.totalDistanceKm, 0);
    return {
      visitDays,
      totalVisits,
      totalDistanceKm,
      avgDistanceKmPerVisit: totalVisits > 0 ? totalDistanceKm / totalVisits : 0,
    };
  }, [result]);

  // Per-rep visit legs for the expandable detail rows and the Excel export's
  // detail sheet — grouped from the same points the map uses, sorted so the
  // sequence reads day-by-day.
  const visitsByRep = useMemo(() => {
    const map = new Map<string, VisitEfficiencyResult["points"]>();
    if (!result) return map;
    for (const p of result.points) {
      const list = map.get(p.rep);
      if (list) list.push(p);
      else map.set(p.rep, [p]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
    }
    return map;
  }, [result]);

  function toggleExpanded(rep: string) {
    setExpandedReps((prev) => {
      const next = new Set(prev);
      if (next.has(rep)) next.delete(rep);
      else next.add(rep);
      return next;
    });
  }

  function handleQuery() {
    queryMutation.mutate({
      scopeField: scopeField || undefined,
      scopeValues: scopeField && selectedScopeValues.size > 0 ? Array.from(selectedScopeValues) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  }

  if (locale === "en") return <LocalizedVisitEfficiencyPage t={t} scopeField={scopeField} setScopeField={setScopeField} selectedScopeValues={selectedScopeValues} setSelectedScopeValues={setSelectedScopeValues} scopeValues={scopeValuesQuery.data?.values ?? []} scopeLoading={scopeValuesQuery.isLoading} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} pending={queryMutation.isPending} onQuery={handleQuery} result={result} visibleReps={visibleReps} setVisibleReps={setVisibleReps} expandedReps={expandedReps} toggleExpanded={toggleExpanded} mapPoints={mapPoints} repNames={repNames} visitsByRep={visitsByRep} totals={totals} />;

  return (
    <div className="relative space-y-6">

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <Footprints className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">كفاءة الزيارات</h1>
          <p className="text-muted-foreground">
            يقيس المسافة بين كل زيارة والتانية اللي بعدها في نفس يوم المندوب — قفزة كبيرة بين زيارتين معناها لفة غير منطقية جغرافيًا.
          </p>
        </div>
      </div>

      <Card className="glass-card rise-in rise-d1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <Filter className="h-4 w-4" />
            </span>
            الإعدادات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
            <div className="grid gap-2">
              <Label>نطاق التصفية (اختياري)</Label>
              <Select
                value={scopeField || "__none__"}
                onValueChange={(v) => {
                  setScopeField(v === "__none__" ? "" : (v as VisitEfficiencyScopeField));
                  setSelectedScopeValues(new Set());
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="بلا تصفية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بلا تصفية</SelectItem>
                  {SCOPE_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {scopeField && (
            <ScopeValueChecklist
              values={scopeValuesQuery.data?.values ?? []}
              loading={scopeValuesQuery.isLoading}
              selected={selectedScopeValues}
              onToggle={(v) =>
                setSelectedScopeValues((prev) => {
                  const next = new Set(prev);
                  if (next.has(v)) next.delete(v);
                  else next.add(v);
                  return next;
                })
              }
              onSelectAll={() => setSelectedScopeValues(new Set(scopeValuesQuery.data?.values ?? []))}
              onClearAll={() => setSelectedScopeValues(new Set())}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2 sm:max-w-md">
            <div className="grid gap-2">
              <Label>من تاريخ (اختياري)</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>إلى تاريخ (اختياري)</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <Button disabled={queryMutation.isPending} onClick={handleQuery}>
            {queryMutation.isPending ? <Spinner /> : <Footprints className="h-4 w-4" />}
            {queryMutation.isPending ? "جارٍ التحليل…" : "حلّل الآن"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="glass-card rise-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
                <Footprints className="h-4 w-4" />
              </span>
              النتيجة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{result.usedVisits} زيارة</Badge>
                {result.excludedSingleVisitDays > 0 && <Badge variant="outline">{result.excludedSingleVisitDays} يوم بزيارة واحدة (متجاهل)</Badge>}
                {result.excludedNoCoordinates > 0 && <Badge variant="warning">{result.excludedNoCoordinates} زيارة بدون إحداثيات صالحة</Badge>}
                {!result.timeColumnUsed && <Badge variant="outline">الترتيب بترتيب الصفوف (بدون وقت تسجيل دخول)</Badge>}
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => exportResultToExcel(result, visitsByRep)}>
                <Download className="h-3.5 w-3.5" />
                تصدير Excel
              </Button>
            </div>

            {result.points.length === 0 ? (
              <div className="space-y-1 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                <p className="font-medium">مفيش مواقع تتعرض على الخريطة بالبيانات دي.</p>
                <p className="text-muted-foreground">
                  الأسباب المحتملة: كل مندوب عنده زيارة واحدة بس في نفس اليوم (محتاج زيارتين على الأقل عشان نحسب مسافة)، أو
                  الإحداثيات فاضية/غلط في كل من الزيارات وسجل العميل المرتبط، أو المسار (RouteID) غير مربوط بعميل صحيح.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border bg-secondary/20 p-2.5">
                    {repNames.map((rep, i) => (
                      <span key={rep} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                        {rep}
                      </span>
                    ))}
                  </div>
                  <RepVisibilityDropdown reps={repNames} visibleReps={visibleReps} onChange={setVisibleReps} />
                </div>
                <VisitMap points={mapPoints} reps={repNames} />
              </>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>المندوب</TableHead>
                  <TableHead>أيام الزيارة</TableHead>
                  <TableHead>عدد الزيارات</TableHead>
                  <TableHead>إجمالي المسافة (كم)</TableHead>
                  <TableHead>متوسط/زيارة (كم)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.repSummaries.map((r) => {
                  const isOpen = expandedReps.has(r.rep);
                  const legs = visitsByRep.get(r.rep) ?? [];
                  return (
                    <Fragment key={r.rep}>
                      <TableRow className="cursor-pointer hover:bg-secondary/30" onClick={() => toggleExpanded(r.rep)}>
                        <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                        <TableCell>{r.rep}</TableCell>
                        <TableCell>{r.visitDays}</TableCell>
                        <TableCell>{r.totalVisits}</TableCell>
                        <TableCell>{r.totalDistanceKm.toFixed(1)}</TableCell>
                        <TableCell>{r.avgDistanceKmPerVisit.toFixed(2)}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          {/* max-w-0: same nested-table-in-a-cell scroll fix as Customer
                              Similarity — without it, this cell's nested <Table> can grow
                              the whole outer table instead of scrolling within itself. */}
                          <TableCell colSpan={6} className="max-w-0 bg-secondary/10 p-0">
                            {legs.length === 0 ? (
                              <p className="p-3 text-sm text-muted-foreground">مفيش زيارات ليها موقع صالح للمندوب ده.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>التاريخ</TableHead>
                                    <TableHead>العميل</TableHead>
                                    <TableHead>المسافة من الزيارة السابقة (كم)</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {legs.map((leg, legIndex) => (
                                    // leg.id is only unique within a single rep-day (backend builds
                                    // it as `${customerId}-${indexWithinThatDay}`), so the same rep
                                    // visiting the same customer first-thing on two different days
                                    // produces the same id twice here — this list spans every day
                                    // for the rep. legIndex (this list's own position) is always
                                    // unique, so combine both instead of relying on leg.id alone.
                                    <TableRow key={`${leg.id}-${legIndex}`}>
                                      <TableCell>{leg.dateKey}</TableCell>
                                      <TableCell>{leg.label}</TableCell>
                                      <TableCell>{leg.value.toFixed(2)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell />
                  <TableCell>الإجمالي</TableCell>
                  <TableCell>{totals.visitDays}</TableCell>
                  <TableCell>{totals.totalVisits}</TableCell>
                  <TableCell>{totals.totalDistanceKm.toFixed(1)}</TableCell>
                  <TableCell>{totals.avgDistanceKmPerVisit.toFixed(2)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LocalizedVisitEfficiencyPage({ t, scopeField, setScopeField, selectedScopeValues, setSelectedScopeValues, scopeValues, scopeLoading, dateFrom, setDateFrom, dateTo, setDateTo, pending, onQuery, result, visibleReps, setVisibleReps, expandedReps, toggleExpanded, mapPoints, repNames, visitsByRep, totals }: { t: (key: import("@/lib/i18n/dictionaries").TranslationKey, params?: Record<string, string | number>) => string; scopeField: VisitEfficiencyScopeField | ""; setScopeField: (value: VisitEfficiencyScopeField | "") => void; selectedScopeValues: Set<string>; setSelectedScopeValues: React.Dispatch<React.SetStateAction<Set<string>>>; scopeValues: string[]; scopeLoading: boolean; dateFrom: string; setDateFrom: (value: string) => void; dateTo: string; setDateTo: (value: string) => void; pending: boolean; onQuery: () => void; result: VisitEfficiencyResult | null; visibleReps: Set<string>; setVisibleReps: (value: Set<string>) => void; expandedReps: Set<string>; toggleExpanded: (rep: string) => void; mapPoints: VisitEfficiencyResult["points"]; repNames: string[]; visitsByRep: Map<string, VisitEfficiencyResult["points"]>; totals: { visitDays: number; totalVisits: number; totalDistanceKm: number; avgDistanceKmPerVisit: number } }) {
  const scopeFields: { value: VisitEfficiencyScopeField; label: string }[] = [{ value: "RouteID", label: t("visitEfficiency.scopeRoute") }, { value: "City", label: t("visitEfficiency.scopeCity") }, { value: "CustomerClass", label: t("visitEfficiency.scopeCustomerClass") }, { value: "Channel", label: t("visitEfficiency.scopeChannel") }];
  return <div className="relative space-y-6"><div className="rise-in flex items-center gap-4"><span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex"><Footprints className="h-6 w-6" /></span><div><h1 className="text-2xl font-semibold tracking-tight">{t("visitEfficiency.title")}</h1><p className="text-muted-foreground">{t("visitEfficiency.subtitle")}</p></div></div><Card className="glass-card rise-in rise-d1"><CardHeader><CardTitle className="flex items-center gap-2.5"><span className="crystal-badge h-9 w-9 bg-primary/15 text-primary"><Filter className="h-4 w-4" /></span>{t("visitEfficiency.settings")}</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:max-w-md sm:grid-cols-2"><div className="grid gap-2"><Label>{t("visitEfficiency.scopeField")}</Label><Select value={scopeField || "__none__"} onValueChange={(value) => { setScopeField(value === "__none__" ? "" : value as VisitEfficiencyScopeField); setSelectedScopeValues(new Set()); }}><SelectTrigger><SelectValue placeholder={t("visitEfficiency.noFilter")} /></SelectTrigger><SelectContent><SelectItem value="__none__">{t("visitEfficiency.noFilter")}</SelectItem>{scopeFields.map((field) => <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>)}</SelectContent></Select></div></div>{scopeField && <LocalizedScopeValues t={t} values={scopeValues} loading={scopeLoading} selected={selectedScopeValues} onToggle={(value) => setSelectedScopeValues((previous) => { const next = new Set(previous); next.has(value) ? next.delete(value) : next.add(value); return next; })} onSelectAll={() => setSelectedScopeValues(new Set(scopeValues))} onClearAll={() => setSelectedScopeValues(new Set())} />}<div className="grid gap-4 sm:max-w-md sm:grid-cols-2"><div className="grid gap-2"><Label>{t("visitEfficiency.fromDate")}</Label><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div><div className="grid gap-2"><Label>{t("visitEfficiency.toDate")}</Label><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div></div><Button disabled={pending} onClick={onQuery}>{pending ? <Spinner /> : <Footprints className="h-4 w-4" />}{pending ? t("visitEfficiency.analyzing") : t("visitEfficiency.analyze")}</Button></CardContent></Card>{result && <LocalizedResults t={t} result={result} visibleReps={visibleReps} setVisibleReps={setVisibleReps} expandedReps={expandedReps} toggleExpanded={toggleExpanded} mapPoints={mapPoints} repNames={repNames} visitsByRep={visitsByRep} totals={totals} />}</div>;
}
function LocalizedScopeValues({ t, values, loading, selected, onToggle, onSelectAll, onClearAll }: { t: (key: import("@/lib/i18n/dictionaries").TranslationKey, params?: Record<string, string | number>) => string; values: string[]; loading: boolean; selected: Set<string>; onToggle: (value: string) => void; onSelectAll: () => void; onClearAll: () => void }) { return <div className="grid gap-2"><div className="flex items-center justify-between"><Label>{t("visitEfficiency.scopeValues")}</Label>{values.length > 0 && <div className="flex gap-3 text-xs"><button type="button" className="text-primary underline underline-offset-2" onClick={onSelectAll}>{t("visitEfficiency.selectAll")}</button><button type="button" className="text-muted-foreground underline underline-offset-2" onClick={onClearAll}>{t("visitEfficiency.clearAll")}</button></div>}</div><div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">{loading ? <p className="p-1 text-sm text-muted-foreground">{t("visitEfficiency.loading")}</p> : values.length === 0 ? <p className="p-1 text-sm text-muted-foreground">{t("visitEfficiency.noScopeValues")}</p> : <div className="space-y-1">{values.map((value) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-secondary/50"><input type="checkbox" className="h-4 w-4 rounded border-border accent-primary" checked={selected.has(value)} onChange={() => onToggle(value)} />{value}</label>)}</div>}</div><p className="text-xs text-muted-foreground">{t("visitEfficiency.selectedValues", { count: selected.size })}</p></div>; }
function LocalizedResults({ t, result, visibleReps, setVisibleReps, expandedReps, toggleExpanded, mapPoints, repNames, visitsByRep, totals }: { t: (key: import("@/lib/i18n/dictionaries").TranslationKey, params?: Record<string, string | number>) => string; result: VisitEfficiencyResult; visibleReps: Set<string>; setVisibleReps: (value: Set<string>) => void; expandedReps: Set<string>; toggleExpanded: (rep: string) => void; mapPoints: VisitEfficiencyResult["points"]; repNames: string[]; visitsByRep: Map<string, VisitEfficiencyResult["points"]>; totals: { visitDays: number; totalVisits: number; totalDistanceKm: number; avgDistanceKmPerVisit: number } }) { return <Card className="glass-card rise-in"><CardHeader><CardTitle className="flex items-center gap-2.5"><span className="crystal-badge h-9 w-9 bg-primary/15 text-primary"><Footprints className="h-4 w-4" /></span>{t("visitEfficiency.result")}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{t("visitEfficiency.visits", { count: result.usedVisits })}</Badge>{result.excludedSingleVisitDays > 0 && <Badge variant="outline">{t("visitEfficiency.excludedSingleVisitDays", { count: result.excludedSingleVisitDays })}</Badge>}{result.excludedNoCoordinates > 0 && <Badge variant="warning">{t("visitEfficiency.excludedNoCoordinates", { count: result.excludedNoCoordinates })}</Badge>}{!result.timeColumnUsed && <Badge variant="outline">{t("visitEfficiency.rowOrder")}</Badge>}</div><Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => exportLocalizedResult(result, visitsByRep, t)}><Download className="h-3.5 w-3.5" />{t("visitEfficiency.exportExcel")}</Button></div>{result.points.length === 0 ? <div className="space-y-1 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm"><p className="font-medium">{t("visitEfficiency.noMapPoints")}</p><p className="text-muted-foreground">{t("visitEfficiency.noMapPointsHint")}</p></div> : <><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border bg-secondary/20 p-2.5">{repNames.map((rep, index) => <span key={rep} className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLORS[index % GROUP_COLORS.length] }} />{rep}</span>)}</div><LocalizedRepPicker t={t} reps={repNames} visibleReps={visibleReps} onChange={setVisibleReps} /></div><VisitMap points={mapPoints} reps={repNames} popupLabels={{ rep: t("visitEfficiency.rep"), date: t("visitEfficiency.date"), distance: t("visitEfficiency.distanceFromPrevious") }} /></>}<Table><TableHeader><TableRow><TableHead className="w-8" /><TableHead>{t("visitEfficiency.rep")}</TableHead><TableHead>{t("visitEfficiency.visitDays")}</TableHead><TableHead>{t("visitEfficiency.visitCount")}</TableHead><TableHead>{t("visitEfficiency.totalDistance")}</TableHead><TableHead>{t("visitEfficiency.avgDistance")}</TableHead></TableRow></TableHeader><TableBody>{result.repSummaries.map((rep) => { const isOpen = expandedReps.has(rep.rep); const legs = visitsByRep.get(rep.rep) ?? []; return <Fragment key={rep.rep}><TableRow className="cursor-pointer hover:bg-secondary/30" onClick={() => toggleExpanded(rep.rep)}><TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell><TableCell>{rep.rep}</TableCell><TableCell>{rep.visitDays}</TableCell><TableCell>{rep.totalVisits}</TableCell><TableCell>{rep.totalDistanceKm.toFixed(1)}</TableCell><TableCell>{rep.avgDistanceKmPerVisit.toFixed(2)}</TableCell></TableRow>{isOpen && <TableRow><TableCell colSpan={6} className="max-w-0 bg-secondary/10 p-0">{legs.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{t("visitEfficiency.noRepVisits")}</p> : <Table><TableHeader><TableRow><TableHead>{t("visitEfficiency.date")}</TableHead><TableHead>{t("visitEfficiency.customer")}</TableHead><TableHead>{t("visitEfficiency.distanceFromPrevious")}</TableHead></TableRow></TableHeader><TableBody>{legs.map((leg, index) => <TableRow key={`${leg.id}-${index}`}><TableCell>{leg.dateKey}</TableCell><TableCell>{leg.label}</TableCell><TableCell>{leg.value.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>}</TableCell></TableRow>}</Fragment>; })}</TableBody><TableFooter><TableRow><TableCell /><TableCell>{t("visitEfficiency.total")}</TableCell><TableCell>{totals.visitDays}</TableCell><TableCell>{totals.totalVisits}</TableCell><TableCell>{totals.totalDistanceKm.toFixed(1)}</TableCell><TableCell>{totals.avgDistanceKmPerVisit.toFixed(2)}</TableCell></TableRow></TableFooter></Table></CardContent></Card>; }
function LocalizedRepPicker({ t, reps, visibleReps, onChange }: { t: (key: import("@/lib/i18n/dictionaries").TranslationKey, params?: Record<string, string | number>) => string; reps: string[]; visibleReps: Set<string>; onChange: (value: Set<string>) => void }) { const [open, setOpen] = useState(false); const allSelected = visibleReps.size === reps.length; return <div className="relative"><Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(!open)}><Filter className="h-3.5 w-3.5" />{t("visitEfficiency.visibleReps", { summary: allSelected ? t("visitEfficiency.all") : t("visitEfficiency.selectedOf", { selected: visibleReps.size, total: reps.length }) })}<ChevronDown className="h-3.5 w-3.5" /></Button>{open && <div className="absolute end-0 top-9 z-[1200] w-64 rounded-md border border-border bg-popover p-1.5 shadow-lg"><label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm font-medium hover:bg-secondary/50"><input type="checkbox" className="h-4 w-4 rounded border-border accent-primary" checked={allSelected} onChange={() => onChange(allSelected ? new Set() : new Set(reps))} />{t("visitEfficiency.all")}</label><div className="my-1 h-px bg-border" />{reps.map((rep) => <label key={rep} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary/50"><input type="checkbox" className="h-4 w-4 rounded border-border accent-primary" checked={visibleReps.has(rep)} onChange={() => { const next = new Set(visibleReps); next.has(rep) ? next.delete(rep) : next.add(rep); onChange(next); }} />{rep}</label>)}</div>}</div>; }
async function exportLocalizedResult(result: VisitEfficiencyResult, visitsByRep: Map<string, VisitEfficiencyResult["points"]>, t: (key: import("@/lib/i18n/dictionaries").TranslationKey, params?: Record<string, string | number>) => string) { const XLSX = await import("xlsx"); const summary = XLSX.utils.json_to_sheet(result.repSummaries.map((rep) => ({ [t("visitEfficiency.rep")]: rep.rep, [t("visitEfficiency.visitDays")]: rep.visitDays, [t("visitEfficiency.visitCount")]: rep.totalVisits, [t("visitEfficiency.totalDistance")]: Number(rep.totalDistanceKm.toFixed(2)), [t("visitEfficiency.avgDistance")]: Number(rep.avgDistanceKmPerVisit.toFixed(2)) }))); const details: Record<string, string | number>[] = []; visitsByRep.forEach((legs, rep) => legs.forEach((leg) => details.push({ [t("visitEfficiency.rep")]: rep, [t("visitEfficiency.date")]: leg.dateKey, [t("visitEfficiency.customer")]: leg.label, [t("visitEfficiency.distanceFromPrevious")]: Number(leg.value.toFixed(2)) }))); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, summary, t("visitEfficiency.exportSummarySheet")); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(details), t("visitEfficiency.exportDetailsSheet")); XLSX.writeFile(workbook, t("visitEfficiency.exportFileName")); }
// Same "dropdown + select-all" pattern as Route Planning's
// ScopeValueChecklist, kept as its own local copy per this screen's own
// endpoint rather than shared, consistent with every other migrated screen.
function ScopeValueChecklist({
  values,
  loading,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  values: string[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (v: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>قيم النطاق (اختياري — سيب فاضي عشان كل البيانات)</Label>
        {values.length > 0 && (
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-primary underline underline-offset-2" onClick={onSelectAll}>
              تحديد الكل
            </button>
            <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={onClearAll}>
              إلغاء الكل
            </button>
          </div>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
        {loading ? (
          <p className="p-1 text-sm text-muted-foreground">جاري التحميل…</p>
        ) : values.length === 0 ? (
          <p className="p-1 text-sm text-muted-foreground">مفيش قيم في العمود ده</p>
        ) : (
          <div className="space-y-1">
            {values.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-secondary/50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary"
                  checked={selected.has(v)}
                  onChange={() => onToggle(v)}
                />
                {v}
              </label>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{selected.size} قيمة محددة</p>
    </div>
  );
}

// Same "dropdown + select-all" pattern as Customer Similarity's
// GroupVisibilityDropdown, adapted to a list of rep names instead of
// numbered clusters. Color swatches for each rep are shown in the legend
// row above the map (see the render below), not duplicated in here.
function RepVisibilityDropdown({
  reps,
  visibleReps,
  onChange,
}: {
  reps: string[];
  visibleReps: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allSelected = visibleReps.size === reps.length;
  const summary = allSelected ? "الكل" : `${visibleReps.size} من ${reps.length}`;

  function toggleRep(rep: string) {
    const next = new Set(visibleReps);
    if (next.has(rep)) next.delete(rep);
    else next.add(rep);
    onChange(next);
  }

  function toggleAll() {
    onChange(allSelected ? new Set() : new Set(reps));
  }

  return (
    <div className="relative" ref={containerRef}>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Filter className="h-3.5 w-3.5" />
        المناديب الظاهرة على الخريطة: {summary}
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute end-0 top-9 z-[1200] w-64 rounded-md border border-border bg-popover p-1.5 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm font-medium hover:bg-secondary/50">
            <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary" checked={allSelected} onChange={toggleAll} />
            الكل
          </label>
          <div className="my-1 h-px bg-border" />
          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {reps.map((rep) => (
              <label key={rep} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary/50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary"
                  checked={visibleReps.has(rep)}
                  onChange={() => toggleRep(rep)}
                />
                {rep}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function exportResultToExcel(result: VisitEfficiencyResult, visitsByRep: Map<string, VisitEfficiencyResult["points"]>) {
  const XLSX = await import("xlsx");

  const summarySheet = XLSX.utils.json_to_sheet(
    result.repSummaries.map((r) => ({
      "المندوب": r.rep,
      "أيام الزيارة": r.visitDays,
      "عدد الزيارات": r.totalVisits,
      "إجمالي المسافة (كم)": Number(r.totalDistanceKm.toFixed(2)),
      "متوسط المسافة/زيارة (كم)": Number(r.avgDistanceKmPerVisit.toFixed(2)),
    })),
  );

  const detailRows: Record<string, string | number>[] = [];
  for (const [rep, legs] of visitsByRep) {
    for (const leg of legs) {
      detailRows.push({
        "المندوب": rep,
        "التاريخ": leg.dateKey,
        "العميل": leg.label,
        "المسافة من الزيارة السابقة (كم)": Number(leg.value.toFixed(2)),
      });
    }
  }
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, "ملخص المناديب");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "تفاصيل الزيارات");
  XLSX.writeFile(workbook, "كفاءة-الزيارات.xlsx");
}
