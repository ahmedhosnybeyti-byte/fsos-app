"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { filesApi, routePlanningApi } from "@/lib/api";
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
import { RouteSplitMap } from "@/components/route-planning/route-split-map";
import type { FileRecord, RoutePlanningSplitResult } from "@/lib/types";

// Balanced Route/Territory Split — dashboard-only feature (chosen over a
// GPT Action so it's a one-click, always-visible dashboard tool rather than
// something a supervisor has to know to ask a chatbot for). See
// docs/PROJECT_LOG.md's "Route-splitting / territory design" section for
// the full design history behind the algorithm this calls.
export default function RoutePlanningPage() {
  const { data: files, isLoading: filesLoading } = useQuery({ queryKey: ["files"], queryFn: filesApi.list });
  const readyFiles = useMemo(() => (files ?? []).filter((f) => f.status === "READY" && f.datasetTypeConfirmed), [files]);

  const [customerFileId, setCustomerFileId] = useState<string>("");
  const customerFile = readyFiles.find((f) => f.id === customerFileId);
  const customerHeaders = customerFile?.parsedMetadata?.headers ?? [];

  const [latitudeColumn, setLatitudeColumn] = useState("");
  const [longitudeColumn, setLongitudeColumn] = useState("");
  const [idColumn, setIdColumn] = useState("");
  const [labelColumn, setLabelColumn] = useState("");
  const [scopeColumn, setScopeColumn] = useState("");
  const [scopeValue, setScopeValue] = useState("");
  const [groupCount, setGroupCount] = useState(6);

  const [salesMode, setSalesMode] = useState<"column" | "aggregate">("column");
  const [salesColumn, setSalesColumn] = useState("");
  const [salesFileId, setSalesFileId] = useState("");
  const salesFile = readyFiles.find((f) => f.id === salesFileId);
  const salesFileHeaders = salesFile?.parsedMetadata?.headers ?? [];
  const [salesFileCustomerIdColumn, setSalesFileCustomerIdColumn] = useState("");
  const [salesFileAmountColumn, setSalesFileAmountColumn] = useState("");

  const scopeValuesQuery = useQuery({
    queryKey: ["route-planning", "distinct-values", customerFileId, scopeColumn],
    queryFn: () => routePlanningApi.distinctValues(customerFileId, scopeColumn),
    enabled: !!customerFileId && !!scopeColumn,
  });

  const [result, setResult] = useState<RoutePlanningSplitResult | null>(null);
  const [mode, setMode] = useState<"before" | "after">("after");

  const splitMutation = useMutation({
    mutationFn: routePlanningApi.split,
    onSuccess: (data) => {
      setResult(data);
      setMode("after");
      toast.success(`تم التقسيم — ${data.usedRows} عميل على ${data.groupCount} مجموعات`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "تعذر إتمام التقسيم"),
  });

  const canSubmit =
    !!customerFileId &&
    !!latitudeColumn &&
    !!longitudeColumn &&
    !!idColumn &&
    !!scopeColumn &&
    !!scopeValue &&
    groupCount >= 2 &&
    (salesMode === "column" ? !!salesColumn : !!salesFileId && !!salesFileCustomerIdColumn && !!salesFileAmountColumn);

  function handleSubmit() {
    splitMutation.mutate({
      customerFileId,
      latitudeColumn,
      longitudeColumn,
      idColumn,
      labelColumn: labelColumn || undefined,
      scopeColumn,
      scopeValue,
      groupCount,
      ...(salesMode === "column"
        ? { salesColumn }
        : { salesFileId, salesFileCustomerIdColumn, salesFileAmountColumn }),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Route Planning</h1>
        <p className="text-muted-foreground">
          إعادة تقسيم قطاع أو خط سير إلى مجموعات متوازنة في المبيعات ومتماسكة جغرافيًا — تماسك جغرافي أولاً، ثم توازن مبيعات عن طريق
          نمو تدريجي من الجيران المباشرين فقط.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الإعدادات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {filesLoading ? (
            <Skeleton className="h-24" />
          ) : readyFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">ارفع ملف عملاء (فيه إحداثيات) من صفحة Files أولاً.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:max-w-md">
                <Label>ملف العملاء</Label>
                <FileSelect files={readyFiles} value={customerFileId} onChange={setCustomerFileId} />
              </div>

              {customerFileId && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <ColumnField label="عمود خط العرض (Latitude)" headers={customerHeaders} value={latitudeColumn} onChange={setLatitudeColumn} />
                    <ColumnField label="عمود خط الطول (Longitude)" headers={customerHeaders} value={longitudeColumn} onChange={setLongitudeColumn} />
                    <ColumnField label="عمود رقم العميل" headers={customerHeaders} value={idColumn} onChange={setIdColumn} />
                    <ColumnField label="عمود الاسم (اختياري)" headers={customerHeaders} value={labelColumn} onChange={setLabelColumn} optional />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <ColumnField label="عمود النطاق (مندوب/منطقة)" headers={customerHeaders} value={scopeColumn} onChange={setScopeColumn} />
                    <div className="grid gap-2">
                      <Label>قيمة النطاق</Label>
                      <Select value={scopeValue} onValueChange={setScopeValue} disabled={!scopeColumn}>
                        <SelectTrigger>
                          <SelectValue placeholder={scopeValuesQuery.isLoading ? "جاري التحميل…" : "اختر قيمة…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(scopeValuesQuery.data?.values ?? []).map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>عدد المجموعات</Label>
                      <Input
                        type="number"
                        min={2}
                        max={20}
                        value={groupCount}
                        onChange={(e) => setGroupCount(Number(e.target.value) || 2)}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>مصدر قيمة المبيعات</Label>
                    <Tabs value={salesMode} onValueChange={(v) => setSalesMode(v as "column" | "aggregate")}>
                      <TabsList>
                        <TabsTrigger value="column">عمود في نفس الملف</TabsTrigger>
                        <TabsTrigger value="aggregate">تجميع من ملف آخر (مثل الفواتير)</TabsTrigger>
                      </TabsList>
                      <TabsContent value="column">
                        <div className="max-w-sm">
                          <ColumnField label="عمود المبيعات" headers={customerHeaders} value={salesColumn} onChange={setSalesColumn} />
                        </div>
                      </TabsContent>
                      <TabsContent value="aggregate" className="space-y-4">
                        <div className="grid gap-2 sm:max-w-md">
                          <Label>ملف المبيعات (مثل الفواتير)</Label>
                          <FileSelect files={readyFiles} value={salesFileId} onChange={setSalesFileId} />
                        </div>
                        {salesFileId && (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <ColumnField
                              label="عمود رقم العميل (في ملف المبيعات)"
                              headers={salesFileHeaders}
                              value={salesFileCustomerIdColumn}
                              onChange={setSalesFileCustomerIdColumn}
                            />
                            <ColumnField
                              label="عمود قيمة المبيعات"
                              headers={salesFileHeaders}
                              value={salesFileAmountColumn}
                              onChange={setSalesFileAmountColumn}
                            />
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>

                  <Button disabled={!canSubmit || splitMutation.isPending} onClick={handleSubmit}>
                    {splitMutation.isPending ? <Spinner /> : <Wand2 className="h-4 w-4" />}
                    {splitMutation.isPending ? "جارٍ التقسيم…" : "قسّم الآن"}
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {result && <ResultView result={result} mode={mode} onModeChange={setMode} />}
    </div>
  );
}

function FileSelect({ files, value, onChange }: { files: FileRecord[]; value: string; onChange: (id: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="اختر ملف…" />
      </SelectTrigger>
      <SelectContent>
        {files.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.fileName} ({f.datasetType})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ColumnField({
  label,
  headers,
  value,
  onChange,
  optional,
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={headers.length === 0}>
        <SelectTrigger>
          <SelectValue placeholder={optional ? "بلا (اختياري)" : "اختر عمود…"} />
        </SelectTrigger>
        <SelectContent>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ResultView({
  result,
  mode,
  onModeChange,
}: {
  result: RoutePlanningSplitResult;
  mode: "before" | "after";
  onModeChange: (m: "before" | "after") => void;
}) {
  const totals = mode === "after" ? result.afterTotals : result.beforeTotals;
  const counts = mode === "after" ? result.afterCounts : result.beforeCounts;
  const maxDevPct = Math.max(...totals.map((t) => Math.abs(t - result.target))) / result.target * 100;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MapIcon className="h-4 w-4" /> النتيجة
        </CardTitle>
        <div className="flex gap-2">
          <Button variant={mode === "before" ? "default" : "outline"} size="sm" onClick={() => onModeChange("before")}>
            قبل (جغرافي فقط)
          </Button>
          <Button variant={mode === "after" ? "default" : "outline"} size="sm" onClick={() => onModeChange("after")}>
            بعد (متوازن)
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{result.usedRows} عميل مستخدم</Badge>
          <Badge variant="secondary">المتوسط المستهدف: {Math.round(result.target).toLocaleString("en-US")}</Badge>
          <Badge variant={maxDevPct <= 10 ? "success" : "warning"}>أقصى انحراف: {maxDevPct.toFixed(1)}%</Badge>
          {result.excludedBadCoordinates > 0 && (
            <Badge variant="warning">{result.excludedBadCoordinates} صف مستبعد (إحداثيات غير صالحة)</Badge>
          )}
        </div>

        <RouteSplitMap result={result} mode={mode} />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المجموعة</TableHead>
              <TableHead>عملاء</TableHead>
              <TableHead>إجمالي المبيعات</TableHead>
              <TableHead>الانحراف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totals.map((t, i) => {
              const dev = ((t - result.target) / result.target) * 100;
              return (
                <TableRow key={i}>
                  <TableCell>مجموعة {i + 1}</TableCell>
                  <TableCell>{counts[i]}</TableCell>
                  <TableCell>{Math.round(t).toLocaleString("en-US")}</TableCell>
                  <TableCell className={Math.abs(dev) <= 10 ? "text-success" : "text-destructive"}>
                    {dev >= 0 ? "+" : ""}
                    {dev.toFixed(1)}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
