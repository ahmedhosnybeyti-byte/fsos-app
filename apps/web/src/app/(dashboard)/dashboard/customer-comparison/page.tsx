"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitCompare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { geoIntelligenceApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "@/components/translation-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResolvedCustomersMap } from "@/components/geo-intelligence/resolved-customers-map";
import type { GeoIntelligenceCompareResult, GeoIntelligenceTalkingPointsResult } from "@/lib/types";

// Customer Comparison — "what does this customer's neighbors buy that they
// don't?" A sales-gap / upsell view for an EXISTING customer.
//
// Migration #1 (ADR-001 / RIE Migration Plan, 2026-07-17): this screen no
// longer asks the user to pick a file or map any column. Customers,
// Invoices, Invoice Items and Products are resolved automatically from the
// company's Canonical Database via RieFacade — the only inputs left are the
// business ones (which customer, how many neighbors, how many products).

export default function CustomerComparisonPage() {
  const { t } = useTranslation();

  const [nearestCount, setNearestCount] = useState(5);
  const [customerSearch, setCustomerSearch] = useState("");
  const [targetCustomerId, setTargetCustomerId] = useState("");

  const customersQuery = useQuery({
    queryKey: ["geo-intelligence", "compare-customers", customerSearch],
    queryFn: () => geoIntelligenceApi.compareCustomers({ search: customerSearch.trim() || undefined }),
  });

  const filteredCustomers = useMemo(() => (customersQuery.data?.customers ?? []).slice(0, 50), [customersQuery.data]);

  const [result, setResult] = useState<GeoIntelligenceCompareResult | null>(null);
  const [talkingPoints, setTalkingPoints] = useState<GeoIntelligenceTalkingPointsResult | null>(null);

  const compareMutation = useMutation({
    mutationFn: geoIntelligenceApi.compare,
    onSuccess: (data) => {
      setResult(data);
      setTalkingPoints(null);
      toast.success(t("customerComparison.compareSuccessToast", { gapCount: data.gapProducts.length, neighborCount: data.neighbors.length }));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("customerComparison.compareErrorFallback")),
  });

  const talkingPointsMutation = useMutation({
    mutationFn: geoIntelligenceApi.talkingPoints,
    onSuccess: (data) => setTalkingPoints(data),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("customerComparison.talkingPointsErrorFallback")),
  });

  const canCompare = !!targetCustomerId;

  function handleCompare() {
    compareMutation.mutate({ targetCustomerId, nearestCount });
  }

  function handleGenerateTalkingPoints() {
    if (!result) return;
    talkingPointsMutation.mutate({
      customerCount: result.neighbors.length,
      topProducts: result.gapProducts,
      framing: "gap",
    });
  }

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="crystal-badge h-11 w-11 bg-primary/15 text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <GitCompare className="h-5 w-5" />
          </span>
          {t("customerComparison.title")}
        </h1>
        <p className="text-muted-foreground">{t("customerComparison.subtitle")}</p>
      </div>

      <div className="glass-hero rise-in rise-d1 relative p-6">
        <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
        <h3 className="relative flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight">
          <span className="crystal-badge h-11 w-11 bg-primary/15 text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <GitCompare className="h-5 w-5" />
          </span>
          {t("customerComparison.settingsTitle")}
        </h3>
        <div className="relative mt-5 space-y-5">
          <div className="grid gap-2">
            <Label>{t("customerComparison.targetCustomerLabel")}</Label>
            <Input
              placeholder={t("customerComparison.searchPlaceholder")}
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="max-w-sm"
            />
            {customersQuery.isLoading ? (
              <Skeleton className="h-32" />
            ) : customersQuery.isError ? (
              <p className="text-sm text-destructive">
                {customersQuery.error instanceof ApiError ? customersQuery.error.message : t("customerComparison.customersLoadError")}
              </p>
            ) : (
              <div className="max-h-64 max-w-md space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {filteredCustomers.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">{t("customerComparison.noResults")}</p>
                ) : (
                  filteredCustomers.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <input
                        type="radio"
                        name="target-customer"
                        checked={targetCustomerId === c.id}
                        onChange={() => setTargetCustomerId(c.id)}
                        className="h-4 w-4"
                      />
                      <span>{c.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2 max-w-xs">
            <Label>{t("customerComparison.nearestCountLabel")}</Label>
            <Input type="number" min={1} max={20} value={nearestCount} onChange={(e) => setNearestCount(Number(e.target.value) || 5)} />
          </div>

          <Button onClick={handleCompare} disabled={!canCompare || compareMutation.isPending}>
            {compareMutation.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("customerComparison.compareButton")}
          </Button>
        </div>
      </div>

      {result && (
        <Card className="glass-card rise-in">
          <CardHeader>
            <CardTitle>{t("customerComparison.resultTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{t("customerComparison.targetCustomerBadge", { name: result.targetCustomer.name })}</Badge>
              <Badge variant="secondary">{t("customerComparison.neighborsBadge", { count: result.neighbors.length })}</Badge>
              <Badge variant="secondary">{t("customerComparison.targetProductCountBadge", { count: result.targetProductCount })}</Badge>
              <Badge variant="outline">{t("customerComparison.gapProductsBadge", { count: result.gapProducts.length })}</Badge>
              {result.excludedBadCoordinates > 0 && (
                <Badge variant="warning">{t("customerComparison.excludedBadge", { count: result.excludedBadCoordinates })}</Badge>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">{t("customerComparison.mapTitle")}</h3>
              <ResolvedCustomersMap
                customers={result.neighbors}
                newCustomerLocation={{ lat: result.targetCustomer.lat, lon: result.targetCustomer.lon }}
                centerLabel={t("customerComparison.mapCenterLabel")}
                centerName={result.targetCustomer.name}
                neighborLabel={t("customerComparison.mapNeighborLabel")}
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">{t("customerComparison.gapTableTitle")}</h3>
              {result.gapProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("customerComparison.noGapMessage")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("customerComparison.colProduct")}</TableHead>
                      <TableHead>{t("customerComparison.colCategory")}</TableHead>
                      <TableHead>{t("customerComparison.colTotalQty")}</TableHead>
                      <TableHead>{t("customerComparison.colTotalValue")}</TableHead>
                      <TableHead>{t("customerComparison.colCustomerCount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.gapProducts.map((p) => (
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
              )}
            </div>

            {result.gapProducts.length > 0 && (
              <div className="space-y-3 border-t border-border pt-5">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <span className="crystal-badge h-7 w-7 bg-ai/15 text-ai">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    {t("customerComparison.talkingPointsTitle")}
                  </h3>
                  <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("customerComparison.talkingPointsDescription")}</p>
                </div>
                <Button variant="secondary" onClick={handleGenerateTalkingPoints} disabled={talkingPointsMutation.isPending}>
                  {talkingPointsMutation.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  {t("customerComparison.generateTalkingPointsButton")}
                </Button>

                {talkingPoints && (
                  <div className="glow-ai rise-in space-y-2 rounded-lg p-4">
                    <p className="text-sm">{talkingPoints.summary}</p>
                    <ul className="list-inside list-disc space-y-1 text-sm">
                      {talkingPoints.talkingPoints.map((tp, i) => (
                        <li key={i}>{tp}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
