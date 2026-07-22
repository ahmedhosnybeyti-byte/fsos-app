"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { geoEngineApi } from "@/lib/api";
import type { GeoFilters } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/components/translation-provider";

const PAGE_SIZE = 25;

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Geo Intelligence Engine — Phase 3 Detail Table. The "Invoice" step of the
// client's City -> Territory -> Customer -> Invoice drill chain — always
// reflects whatever GeoFilters the map/breadcrumb are currently scoped to,
// same established convention as decision-analytics-studio's own DetailTable
// (see that component's comment). Structure and columns are copied from
// that component (reusing its i18n keys directly — decisionAnalyticsStudio.*
// — rather than duplicating the labels), calling geoEngineApi.table instead
// of decisionAnalyticsStudioApi.table since GeoFilters/GeoTableRow are
// separate (but field-identical) types per this module's isolation
// convention.
export function GeoDetailTable({ filters }: { filters: GeoFilters }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPage(1), [JSON.stringify(filters)]);

  const tableQuery = useQuery({
    queryKey: ["geo-engine", "table", filters, page],
    queryFn: () => geoEngineApi.table({ ...filters, page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const data = tableQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.totalRows / PAGE_SIZE)) : 1;

  return (
    <Card className="glass-card rise-in">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("decisionAnalyticsStudio.detailTableTitle")}</CardTitle>
        {data && <span className="text-xs text-muted-foreground">{t("decisionAnalyticsStudio.detailTableCount", { count: data.totalRows })}</span>}
      </CardHeader>
      <CardContent>
        {tableQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Spinner className="h-5 w-5" />
          </div>
        ) : !data || data.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("decisionAnalyticsStudio.emptyResult")}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("decisionAnalyticsStudio.colInvoice")}</th>
                    <th className="px-3 py-2 text-start">{t("decisionAnalyticsStudio.colDate")}</th>
                    <th className="px-3 py-2 text-start">{t("decisionAnalyticsStudio.colCustomer")}</th>
                    <th className="px-3 py-2 text-start">{t("decisionAnalyticsStudio.dimTerritory")}</th>
                    <th className="px-3 py-2 text-start">{t("decisionAnalyticsStudio.colProduct")}</th>
                    <th className="px-3 py-2 text-start">{t("decisionAnalyticsStudio.dimBrand")}</th>
                    <th className="px-3 py-2 text-start">{t("decisionAnalyticsStudio.dimRepresentative")}</th>
                    <th className="px-3 py-2 text-end">{t("decisionAnalyticsStudio.kpiSales")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={`${row.invoiceNo}-${row.lineNo}`} className="border-t border-border hover:bg-secondary/20">
                      <td className="px-3 py-2 font-medium">{row.invoiceNo}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.date ?? "—"}</td>
                      <td className="px-3 py-2">{row.customerName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.city}</td>
                      <td className="px-3 py-2">{row.productName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.brand}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.repName}</td>
                      <td className="px-3 py-2 text-end">{formatAmount(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("decisionAnalyticsStudio.pageOf", { page, total: totalPages })}</span>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronRight className="h-4 w-4 rtl:hidden" />
                  <ChevronLeft className="hidden h-4 w-4 rtl:block" />
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronLeft className="h-4 w-4 rtl:hidden" />
                  <ChevronRight className="hidden h-4 w-4 rtl:block" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
