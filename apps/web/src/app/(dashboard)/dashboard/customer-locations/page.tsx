"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crosshair, Download, MapPin, Navigation, Search, X } from "lucide-react";
import { toast } from "sonner";
import { customerLocationsApi, geoIntelligenceApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocationPickerMap } from "@/components/geo-intelligence/location-picker-map";
import type { CustomerLocationRecord, GeoIntelligenceCustomer } from "@/lib/types";

// Customer Location Capture — for companies whose Customers file has missing
// or incomplete lat/lon. A rep standing at the customer captures a
// coordinate on the spot; COMPANY_ADMIN/MANAGER later export everything
// captured so far as an Excel list and merge it into their own Customers
// file however they like (e.g. a VLOOKUP on customer code) — this screen
// deliberately does not attempt that merge itself. See
// packages/schemas/src/customer-location.schemas.ts for the full rationale
// (this app never rewrites an uploaded file in place).
//
// Location capture reuses the exact 3 methods from the "New Customer"
// screen's Step 1 (GPS / pin-on-map / manual entry) — same component
// (LocationPickerMap), same interaction pattern, so a rep already familiar
// with one screen needs no new mental model for this one.
export default function CustomerLocationsPage() {
  const { user } = useAuth();
  const canExport = user?.role.code === "COMPANY_ADMIN" || user?.role.code === "MANAGER";

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <MapPin className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">تحديد إحداثيات العملاء</h1>
          <p className="text-muted-foreground">
            لو العميل مالوش إحداثيات مسجلة، سجّلها وانت واقف عنده — ولاحقًا يقدر مدير/مسؤول الشركة يصدّرها كملف Excel.
          </p>
        </div>
      </div>

      <div className="rise-in rise-d1">
        <CaptureCard />
      </div>

      {canExport && (
        <div className="rise-in rise-d2">
          <ExportCard />
        </div>
      )}
    </div>
  );
}

function CaptureCard() {
  const [locationMethod, setLocationMethod] = useState<"gps" | "map" | "manual">("gps");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [manualLatText, setManualLatText] = useState("");
  const [manualLonText, setManualLonText] = useState("");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [customerCode, setCustomerCode] = useState("");
  const [customerName, setCustomerName] = useState("");

  // Customer lookup — search the company's canonical Customers entity via
  // RIE (same RieFacade-backed, hierarchy-filtered endpoint new-customer's
  // Point Wizard already uses), so the rep only ever sees customers within
  // their own scope. Previously this read raw, unscoped rows straight out
  // of the uploaded Customers file via filesApi.searchRows — that path had
  // no hierarchy filter applied at all. Falls back to plain manual entry
  // if the rep doesn't want to search (or no Customers dataset is
  // available yet) — the original two-field flow still works either way.
  const [manualEntry, setManualEntry] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const searchQuery = useQuery({
    queryKey: ["geo-intelligence", "customers", debouncedSearch],
    queryFn: () => geoIntelligenceApi.customers({ search: debouncedSearch }),
    enabled: !manualEntry && debouncedSearch.length >= 2,
  });

  const [selectedRow, setSelectedRow] = useState<GeoIntelligenceCustomer | null>(null);

  function selectMatch(customer: GeoIntelligenceCustomer) {
    setSelectedRow(customer);
    setCustomerCode(customer.id);
    setCustomerName(customer.name);
    setSearchText("");
  }

  function clearSelection() {
    setSelectedRow(null);
    setCustomerCode("");
    setCustomerName("");
  }

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

  const captureMutation = useMutation({
    mutationFn: customerLocationsApi.capture,
    onSuccess: () => {
      toast.success("تم تسجيل إحداثية العميل");
      clearSelection();
      setSearchText("");
      setLat(null);
      setLon(null);
      setManualLatText("");
      setManualLonText("");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر تسجيل الإحداثية"),
  });

  const canSave = !!customerCode.trim() && hasLocation;

  function handleSave() {
    if (!canSave) return;
    captureMutation.mutate({
      customerCode: customerCode.trim(),
      customerName: customerName.trim() || undefined,
      lat: lat!,
      lon: lon!,
    });
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
            <Crosshair className="h-4 w-4" />
          </span>
          تسجيل إحداثية جديدة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!manualEntry ? (
          <div className="grid gap-3 sm:max-w-md">
            <div className="grid gap-2">
              <Label>دوّر على العميل (بالاسم أو الكود)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    if (selectedRow) clearSelection();
                  }}
                  placeholder="مثال: محمد أو C-1042"
                  className="ps-9"
                />
              </div>
              <button
                type="button"
                onClick={() => setManualEntry(true)}
                className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                مش لاقي العميل؟ اكتب بياناته يدويًا
              </button>
            </div>

            {!selectedRow && searchText.trim().length >= 2 && (
              <div className="rounded-lg border">
                {searchQuery.isFetching ? (
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : searchQuery.isError ? (
                  <p className="p-3 text-sm text-muted-foreground">تعذر البحث في بيانات العملاء — اكتب بيانات العميل يدويًا.</p>
                ) : !searchQuery.data || searchQuery.data.customers.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">مفيش عميل بالاسم أو الكود ده.</p>
                ) : (
                  <ul className="divide-y">
                    {searchQuery.data.customers.map((customer) => (
                      <li key={customer.id}>
                        <button
                          type="button"
                          onClick={() => selectMatch(customer)}
                          className="flex w-full flex-wrap gap-x-3 gap-y-1 p-3 text-start text-sm hover:bg-accent"
                        >
                          <span>
                            <span className="text-muted-foreground">الكود: </span>
                            <span className="font-medium">{customer.id}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">الاسم: </span>
                            <span className="font-medium">{customer.name}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {!selectedRow && searchText.trim().length > 0 && searchText.trim().length < 2 && (
              <p className="text-xs text-muted-foreground">اكتب حرفين على الأقل.</p>
            )}

            {selectedRow && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <Check className="h-4 w-4" />
                    تم اختيار العميل — راجع بياناته قبل ما تكمل
                  </span>
                  <button type="button" onClick={clearSelection} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted-foreground">الكود: </span>
                    <span className="font-medium">{selectedRow.id}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">الاسم: </span>
                    <span className="font-medium">{selectedRow.name}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>كود العميل</Label>
              <Input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} placeholder="مثال: C-1042" />
            </div>
            <div className="grid gap-2">
              <Label>اسم العميل (اختياري)</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="للمرجعية فقط" />
            </div>
            <button
              type="button"
              onClick={() => setManualEntry(false)}
              className="col-span-2 w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              ارجع للبحث عن العميل
            </button>
          </div>
        )}

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

        {/* Always visible regardless of active method, same reasoning as
            new-customer/page.tsx — GPS and manual entry both benefit from
            visual confirmation, and dragging the pin works as a 4th
            implicit fine-tuning method. */}
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

        <Button disabled={!canSave || captureMutation.isPending} onClick={handleSave}>
          {captureMutation.isPending ? <Spinner className="h-4 w-4" /> : null}
          سجّل الإحداثية
        </Button>
      </CardContent>
    </Card>
  );
}

function ExportCard() {
  const queryClient = useQueryClient();
  const { data: records, isLoading } = useQuery({ queryKey: ["customer-locations"], queryFn: customerLocationsApi.list });

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2.5">
          <span className="crystal-badge h-9 w-9 bg-success/15 text-success">
            <Download className="h-4 w-4" />
          </span>
          الإحداثيات المسجّلة
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{records?.length ?? 0} عميل</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!records || records.length === 0}
            onClick={() => records && exportToExcel(records)}
          >
            <Download className="h-3.5 w-3.5" />
            تصدير Excel
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["customer-locations"] })}>
            تحديث
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !records || records.length === 0 ? (
          <p className="text-sm text-muted-foreground">لسه مفيش إحداثيات متسجّلة.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>كود العميل</TableHead>
                <TableHead>اسم العميل</TableHead>
                <TableHead>Latitude</TableHead>
                <TableHead>Longitude</TableHead>
                <TableHead>سجّلها</TableHead>
                <TableHead>تاريخ التسجيل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.customerCode}</TableCell>
                  <TableCell>{r.customerName ?? "—"}</TableCell>
                  <TableCell className="font-mono">{r.lat.toFixed(5)}</TableCell>
                  <TableCell className="font-mono">{r.lon.toFixed(5)}</TableCell>
                  <TableCell>{r.capturedByName}</TableCell>
                  <TableCell>{new Date(r.capturedAt).toLocaleString("ar-EG")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Client-side Excel export — same dynamic-import pattern used by Route
// Planning / Team Performance / Customer Similarity / Visit Efficiency
// (see PROJECT_LOG.md): no backend export endpoint, build the workbook
// directly from the already-fetched JSON. Column headers deliberately match
// common Excel VLOOKUP usage (a plain CustomerCode/Latitude/Longitude list)
// since the intended next step is the company merging this into their own
// Customers sheet by hand.
async function exportToExcel(records: CustomerLocationRecord[]) {
  const XLSX = await import("xlsx");
  const rows = records.map((r) => ({
    "كود العميل": r.customerCode,
    "اسم العميل": r.customerName ?? "",
    Latitude: r.lat,
    Longitude: r.lon,
    "سجّلها": r.capturedByName,
    "تاريخ التسجيل": new Date(r.capturedAt).toLocaleString("ar-EG"),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "إحداثيات العملاء");
  XLSX.writeFile(workbook, "إحداثيات-العملاء.xlsx");
}
