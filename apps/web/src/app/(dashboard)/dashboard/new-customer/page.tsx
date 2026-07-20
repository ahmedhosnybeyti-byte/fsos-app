"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Crosshair, LayoutGrid, MapPin, Navigation, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { geoIntelligenceApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocationPickerMap } from "@/components/geo-intelligence/location-picker-map";
import { ResolvedCustomersMap } from "@/components/geo-intelligence/resolved-customers-map";
import { HeatmapMap } from "@/components/heatmap/heatmap-map";
import type { GeoIntelligenceAnalyzeResult, GeoIntelligenceExpansionResult, GeoIntelligenceScopeField, GeoIntelligenceTalkingPointsResult } from "@/lib/types";

// New Customer — Geo Intelligence. Deliberately narrow scope (see
// PROJECT_LOG.md): Step 1 captures a location by any of 3 methods, Step 2
// resolves a reference customer set (nearest-N auto and/or manually picked)
// from the company's data and surfaces its best-performing product
// assortment, then generates optional AI talking points. It stops there —
// no invoice/order/customer-creation steps follow.
//
// Migration #5 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file or
// column mapping anymore. Customers/Invoices/Invoice Items/Products are
// resolved automatically via RieFacade — only the business choices remain.

const SCOPE_FIELDS: { value: GeoIntelligenceScopeField; label: string }[] = [
  { value: "RouteID", label: "الخط (Route)" },
  { value: "City", label: "المدينة" },
  { value: "CustomerClass", label: "فئة العميل" },
  { value: "Channel", label: "القناة" },
];

// Top-level: point-scope wizard (single new-customer location, existing
// feature) vs. territory-scope expansion (GVE catalog's "New Customer
// Expansion Map" territory-level upgrade — where in a whole territory is
// under-served whitespace worth targeting, not just "near this one pin").
export default function NewCustomerPage() {
  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <MapPin className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">عميل جديد</h1>
          <p className="text-muted-foreground">تحليل موقع عميل واحد جديد، أو مسح قطاع كامل لاكتشاف مناطق التوسع.</p>
        </div>
      </div>
      <Tabs defaultValue="point" className="rise-in rise-d1">
        <TabsList>
          <TabsTrigger value="point">
            <MapPin className="me-1.5 h-4 w-4" />
            عميل واحد (موقع محدد)
          </TabsTrigger>
          <TabsTrigger value="territory">
            <LayoutGrid className="me-1.5 h-4 w-4" />
            قطاع كامل (اكتشاف مناطق التوسع)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="point">
          <PointWizard />
        </TabsContent>
        <TabsContent value="territory">
          <TerritoryExpansion />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PointWizard() {
  const [step, setStep] = useState<1 | 2>(1);

  // ---- Step 1: location ----
  const [locationMethod, setLocationMethod] = useState<"gps" | "map" | "manual">("gps");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [manualLatText, setManualLatText] = useState("");
  const [manualLonText, setManualLonText] = useState("");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "error">("idle");

  function requestGpsLocation() {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      toast.error("المتصفح ده مش بيدعم تحديد الموقع");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
        setGpsStatus("idle");
        toast.success("تم تحديد الموقع");
      },
      () => {
        setGpsStatus("error");
        toast.error("تعذر الوصول للموقع — جرب تحديد على الخريطة أو إدخال يدوي");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function applyManualCoordinates() {
    const la = Number(manualLatText);
    const lo = Number(manualLonText);
    if (!Number.isFinite(la) || la < -90 || la > 90 || !Number.isFinite(lo) || lo < -180 || lo > 180) {
      toast.error("إحداثيات غير صحيحة");
      return;
    }
    setLat(la);
    setLon(lo);
  }

  const hasLocation = lat !== null && lon !== null;

  // ---- Step 2: reference customers + analysis ----
  const [mode, setMode] = useState<"auto" | "manual" | "both">("auto");
  const [nearestCount, setNearestCount] = useState(5);

  const [customerSearch, setCustomerSearch] = useState("");
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<string>>(new Set());

  // Fetched once (unfiltered) when the manual picker is needed, then
  // filtered client-side as the user types — same UX as before the
  // migration, just sourced from RIE Customers instead of an uploaded file.
  const customersQuery = useQuery({
    queryKey: ["geo-intelligence", "customers"],
    queryFn: () => geoIntelligenceApi.customers({}),
    enabled: mode === "manual" || mode === "both",
  });

  const filteredCustomers = useMemo(() => {
    const list = customersQuery.data?.customers ?? [];
    if (!customerSearch.trim()) return list.slice(0, 50);
    const q = customerSearch.trim().toLowerCase();
    return list.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 50);
  }, [customersQuery.data, customerSearch]);

  const [areaLabel, setAreaLabel] = useState("");
  const [result, setResult] = useState<GeoIntelligenceAnalyzeResult | null>(null);
  const [talkingPoints, setTalkingPoints] = useState<GeoIntelligenceTalkingPointsResult | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: geoIntelligenceApi.analyze,
    onSuccess: (data) => {
      setResult(data);
      setTalkingPoints(null);
      toast.success(`تم التحليل — ${data.resolvedCustomers.length} عميل مرجعي، ${data.topProducts.length} صنف`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر إتمام التحليل"),
  });

  const talkingPointsMutation = useMutation({
    mutationFn: geoIntelligenceApi.talkingPoints,
    onSuccess: (data) => setTalkingPoints(data),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر توليد نقاط الحديث"),
  });

  const canAnalyze = hasLocation && (mode === "auto" || manualSelectedIds.size > 0);

  function handleAnalyze() {
    if (!hasLocation) return;
    analyzeMutation.mutate({
      location: { lat: lat!, lon: lon! },
      mode,
      nearestCount,
      manualCustomerIds: Array.from(manualSelectedIds),
    });
  }

  function handleGenerateTalkingPoints() {
    if (!result) return;
    talkingPointsMutation.mutate({
      areaLabel: areaLabel || undefined,
      customerCount: result.resolvedCustomers.length,
      topProducts: result.topProducts,
    });
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="flex gap-2">
        <Badge variant={step === 1 ? "default" : "secondary"}>1. الموقع</Badge>
        <Badge variant={step === 2 ? "default" : "secondary"}>2. العملاء والتحليل</Badge>
      </div>

      {step === 1 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>الخطوة 1 — موقع العميل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Tabs value={locationMethod} onValueChange={(v) => setLocationMethod(v as typeof locationMethod)}>
              <TabsList>
                <TabsTrigger value="gps">
                  <Navigation className="me-1.5 h-4 w-4" />
                  لوكيشن (GPS)
                </TabsTrigger>
                <TabsTrigger value="map">
                  <MapPin className="me-1.5 h-4 w-4" />
                  تحديد على الخريطة
                </TabsTrigger>
                <TabsTrigger value="manual">
                  <Crosshair className="me-1.5 h-4 w-4" />
                  إدخال يدوي
                </TabsTrigger>
              </TabsList>

              <TabsContent value="gps" className="space-y-3">
                <Button onClick={requestGpsLocation} disabled={gpsStatus === "loading"}>
                  {gpsStatus === "loading" ? <Spinner className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
                  حدد موقعي الحالي
                </Button>
              </TabsContent>

              <TabsContent value="map">
                <p className="mb-2 text-xs text-muted-foreground">اضغط على الخريطة أو اسحب العلامة لتحديد موقع العميل بدقة.</p>
              </TabsContent>

              <TabsContent value="manual" className="space-y-3">
                <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Latitude</Label>
                    <Input value={manualLatText} onChange={(e) => setManualLatText(e.target.value)} placeholder="21.6" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Longitude</Label>
                    <Input value={manualLonText} onChange={(e) => setManualLonText(e.target.value)} placeholder="39.19" />
                  </div>
                </div>
                <Button variant="secondary" onClick={applyManualCoordinates}>
                  استخدم هذه الإحداثيات
                </Button>
              </TabsContent>
            </Tabs>

            {/* Always visible regardless of which method is active — GPS and
                manual entry both need visual confirmation of the pin too,
                not just the "map" tab. Clicking/dragging here also works as
                a 4th implicit way to fine-tune whatever location was just
                set. */}
            <LocationPickerMap
              lat={lat}
              lon={lon}
              onPick={(la, lo) => {
                setLat(la);
                setLon(lo);
              }}
            />

            {hasLocation && (
              <p className="text-sm text-muted-foreground">
                الموقع المحدد: <span className="font-mono">{lat!.toFixed(5)}, {lon!.toFixed(5)}</span>
              </p>
            )}

            <Button disabled={!hasLocation} onClick={() => setStep(2)}>
              التالي — تحديد العملاء
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <>
          <Card className="glass-card rise-in">
            <CardHeader>
              <CardTitle>الخطوة 2 — تحديد العملاء المرجعيين والتحليل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                ← رجوع لتعديل الموقع
              </Button>

              <div className="space-y-3">
                <Label>طريقة تحديد العملاء المرجعيين</Label>
                <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <TabsList>
                    <TabsTrigger value="auto">تلقائي (أقرب عملاء)</TabsTrigger>
                    <TabsTrigger value="manual">يدوي (بحث واختيار)</TabsTrigger>
                    <TabsTrigger value="both">الاثنين معًا</TabsTrigger>
                  </TabsList>

                  <TabsContent value="auto" className="max-w-xs">
                    <div className="grid gap-2">
                      <Label>عدد أقرب العملاء</Label>
                      <Input type="number" min={1} max={20} value={nearestCount} onChange={(e) => setNearestCount(Number(e.target.value) || 5)} />
                    </div>
                  </TabsContent>

                  <TabsContent value="manual">
                    <ManualCustomerPicker
                      loading={customersQuery.isLoading}
                      customers={filteredCustomers}
                      search={customerSearch}
                      onSearch={setCustomerSearch}
                      selected={manualSelectedIds}
                      onToggle={(id) =>
                        setManualSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                    />
                  </TabsContent>

                  <TabsContent value="both" className="space-y-4">
                    <div className="grid gap-2 max-w-xs">
                      <Label>عدد أقرب العملاء تلقائيًا</Label>
                      <Input type="number" min={1} max={20} value={nearestCount} onChange={(e) => setNearestCount(Number(e.target.value) || 5)} />
                    </div>
                    <ManualCustomerPicker
                      loading={customersQuery.isLoading}
                      customers={filteredCustomers}
                      search={customerSearch}
                      onSearch={setCustomerSearch}
                      selected={manualSelectedIds}
                      onToggle={(id) =>
                        setManualSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <Button onClick={handleAnalyze} disabled={!canAnalyze || analyzeMutation.isPending}>
                {analyzeMutation.isPending ? <Spinner className="h-4 w-4" /> : null}
                نفّذ التحليل
              </Button>
            </CardContent>
          </Card>

          {result && (
            <Card className="glass-card rise-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2.5">
                  <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
                    <MapPin className="h-4 w-4" />
                  </span>
                  النتيجة
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{result.resolvedCustomers.length} عميل مرجعي</Badge>
                  <Badge variant="secondary">{result.topProducts.length} صنف</Badge>
                  {result.excludedBadCoordinates > 0 && <Badge variant="outline">{result.excludedBadCoordinates} صف تم تجاهله (إحداثيات غير صالحة)</Badge>}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium">العملاء المرجعيون على الخريطة</h3>
                  {hasLocation && (
                    <ResolvedCustomersMap customers={result.resolvedCustomers} newCustomerLocation={{ lat: lat!, lon: lon! }} />
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium">أفضل تشكيلة أصناف</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الصنف</TableHead>
                        <TableHead>التصنيف</TableHead>
                        <TableHead>إجمالي الكمية</TableHead>
                        <TableHead>إجمالي القيمة</TableHead>
                        <TableHead>عدد العملاء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.topProducts.map((p) => (
                        <TableRow key={p.sku}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell>{p.category ?? "—"}</TableCell>
                          <TableCell>{p.totalQty.toLocaleString()}</TableCell>
                          <TableCell>{p.totalValue.toLocaleString()}</TableCell>
                          <TableCell>{p.customerCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 border-t border-border pt-5">
                  <div>
                    <h3 className="text-sm font-medium">نقاط حديث بالذكاء الاصطناعي (اختياري)</h3>
                    <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                      يحلل الذكاء الاصطناعي جدول &quot;أفضل تشكيلة أصناف&quot; اللي طلع فوق ويكتب للمندوب ملخص قصير + 3-6 جمل عملية يقدر
                      يقولها فعليًا وهو قدام العميل الجديد (مش أرقام مجردة — كلام جاهز للاستخدام).
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-2">
                      <Label>اسم المنطقة (اختياري — لسياق أفضل)</Label>
                      <Input className="sm:w-64" value={areaLabel} onChange={(e) => setAreaLabel(e.target.value)} placeholder="مثال: جدة جنوب" />
                    </div>
                    <Button variant="secondary" onClick={handleGenerateTalkingPoints} disabled={talkingPointsMutation.isPending}>
                      {talkingPointsMutation.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                      ولّد نقاط حديث بالذكاء الاصطناعي
                    </Button>
                  </div>

                  {talkingPoints && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-sm">{talkingPoints.summary}</p>
                      <ul className="list-inside list-disc space-y-1 text-sm">
                        {talkingPoints.talkingPoints.map((tp, i) => (
                          <li key={i}>{tp}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// Territory-scope expansion — see geo-intelligence.schemas.ts's
// geoIntelligenceExpansionSchema comment for the grid-scoring idea. Reuses
// HeatmapMap verbatim (the result is already {id,label,lat,lon,value}
// points) instead of writing a new map component.
function TerritoryExpansion() {
  const [scopeField, setScopeField] = useState<GeoIntelligenceScopeField | "">("");
  const [selectedScopeValues, setSelectedScopeValues] = useState<Set<string>>(new Set());
  const [gridSizeKm, setGridSizeKm] = useState(3);

  const scopeValuesQuery = useQuery({
    queryKey: ["geo-intelligence", "expansion", "scope-values", scopeField],
    queryFn: () => geoIntelligenceApi.expansionScopeValues({ scopeField: scopeField as GeoIntelligenceScopeField }),
    enabled: !!scopeField,
  });

  const [result, setResult] = useState<GeoIntelligenceExpansionResult | null>(null);
  const expansionMutation = useMutation({
    mutationFn: geoIntelligenceApi.expansion,
    onSuccess: (data) => {
      setResult(data);
      toast.success(`${data.emptyCellsScored} منطقة مرشحة للتوسع`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر تنفيذ التحليل"),
  });

  function handleRun() {
    expansionMutation.mutate({
      scopeField: scopeField || undefined,
      scopeValues: scopeField && selectedScopeValues.size > 0 ? Array.from(selectedScopeValues) : undefined,
      gridSizeKm,
    });
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
            <LayoutGrid className="h-4 w-4" />
          </span>
          مسح قطاع — اكتشاف مناطق التوسع
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          بيقسّم القطاع لشبكة خلايا، وبيحسب لكل خلية فاضية (مفيهاش عملاء) درجة فرصة بناءً على قد إيه العملاء والمبيعات حواليها —
          يعني منطقة فاضية جنب تجمع عملاء قوي بتاخد درجة عالية، ومنطقة فاضية معزولة عن أي حد بتتجاهل.
        </p>

        <div className="grid gap-4 sm:grid-cols-3 sm:max-w-2xl">
          <div className="grid gap-2">
            <Label>عمود النطاق (اختياري — قطاع/منطقة)</Label>
            <Select
              value={scopeField || "__none__"}
              onValueChange={(v) => {
                setScopeField(v === "__none__" ? "" : (v as GeoIntelligenceScopeField));
                setSelectedScopeValues(new Set());
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="بلا (اختياري)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">بلا (اختياري)</SelectItem>
                {SCOPE_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>قيمة النطاق</Label>
            <Select
              value={selectedScopeValues.size === 1 ? Array.from(selectedScopeValues)[0] : "__all__"}
              onValueChange={(v) => setSelectedScopeValues(v === "__all__" ? new Set() : new Set([v]))}
              disabled={!scopeField}
            >
              <SelectTrigger>
                <SelectValue placeholder={scopeValuesQuery.isLoading ? "جاري التحميل…" : "الكل"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">الكل</SelectItem>
                {(scopeValuesQuery.data?.values ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>حجم الخلية (كم)</Label>
            <Input type="number" min={0.5} max={50} step={0.5} value={gridSizeKm} onChange={(e) => setGridSizeKm(Number(e.target.value) || 3)} />
          </div>
        </div>

        <Button disabled={expansionMutation.isPending} onClick={handleRun}>
          {expansionMutation.isPending ? <Spinner className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          نفّذ المسح
        </Button>

        {result && (
          <div className="space-y-4 border-t border-border pt-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{result.customerCount} عميل</Badge>
              <Badge variant="secondary">{result.emptyCellsScored} منطقة مرشحة</Badge>
              <Badge variant="secondary">حجم الخلية: {result.gridSizeKm} كم</Badge>
            </div>
            <HeatmapMap points={result.points} maxValue={result.maxScore} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManualCustomerPicker({
  loading,
  customers,
  search,
  onSearch,
  selected,
  onToggle,
}: {
  loading: boolean;
  customers: { id: string; name: string }[];
  search: string;
  onSearch: (v: string) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Input placeholder="دور بالاسم أو الكود…" value={search} onChange={(e) => onSearch(e.target.value)} className="max-w-sm" />
      {loading ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="max-h-64 max-w-md space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {customers.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">مفيش نتائج</p>
          ) : (
            customers.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => onToggle(c.id)} className="h-4 w-4" />
                <span>{c.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
              </label>
            ))
          )}
        </div>
      )}
      {selected.size > 0 && <p className="text-xs text-muted-foreground">{selected.size} عميل محدد</p>}
    </div>
  );
}
