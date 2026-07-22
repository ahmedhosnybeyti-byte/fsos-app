"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/decision-analytics-studio/multi-select-filter";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";
import type { DecisionFilterField } from "@/lib/types";
import type { GeoFilters, GeoGroupBy, GeoKpi } from "@/lib/types";

// Geo Intelligence Engine — unified filter bar (Phase 1, "الفلاتر
// موحدة"). Every future map mode (Heat/Choropleth/Bubble/Cluster in Phase 2)
// is meant to read the SAME GeoFilters + GeoKpi state this bar edits,
// instead of each map screen inventing its own filter form the way
// heatmap/page.tsx's single-scopeField form and Territory Intelligence's
// hierarchy drill-down each currently do.
//
// Dropdown option VALUES (City/Channel/Category/Brand/Product/Customer/
// Representative/Supervisor/Branch) are deliberately fetched via the
// pre-existing MultiSelectFilter component, which calls GET
// /decision-analytics-studio/filter-options — same field set, same
// Canonical Entities, reused as-is rather than duplicated (explicit "reuse
// existing services" instruction in the client's spec). This bar's OWN new
// surface is just the KPI selector, the group-by toggle, and wiring 9
// simultaneous filters into one GeoFilters object (Decision Analytics
// Studio's filter bar only ever edits one DecisionFilters object the exact
// same way — this mirrors that, not reinvents it).
// Narrowed to just the array-valued filter fields (excludes the date
// strings) so setArrayFilter never needs an unsafe cast — same pattern
// decision-analytics-studio's page.tsx uses for its own ArrayFilterField.
type ArrayFilterField = Exclude<keyof GeoFilters, "dateFrom" | "dateTo" | "priorDateFrom" | "priorDateTo">;

const DIMENSION_FIELDS: { field: DecisionFilterField; arrayKey: ArrayFilterField }[] = [
  { field: "branch", arrayKey: "branchIds" },
  { field: "territory", arrayKey: "cityValues" },
  { field: "channel", arrayKey: "channelValues" },
  { field: "category", arrayKey: "categoryValues" },
  { field: "brand", arrayKey: "brandValues" },
  { field: "product", arrayKey: "productCodes" },
  { field: "customer", arrayKey: "customerCodes" },
  { field: "representative", arrayKey: "repEmails" },
  { field: "supervisor", arrayKey: "supervisorEmails" },
];

const KPI_VALUES: GeoKpi[] = ["sales", "orders", "customers", "visits", "collections", "returns", "lostSales"];

export function GeoFilterBar({
  filters,
  onChangeFilters,
  kpi,
  onChangeKpi,
  groupBy,
  onChangeGroupBy,
  // "city" grouping collapses every customer in a city into ONE centroid
  // point. In Territory mode that's exactly what's needed (one shape per
  // territory). In Heat/Bubble/Cluster — all point-based visualizations —
  // a single point per city can only ever render as one small blob, no
  // matter how many cities are in view; it can never "spread out" the way
  // per-customer data does. That's not a bug in the aggregation, it's math
  // (confirmed against the client's own screenshots, 2026-07-22 and again
  // 2026-07-22 follow-up: "with every city"). Rather than let the user pick
  // a combination that's guaranteed to look broken, the group-by control
  // itself is only shown when it's actually meaningful — i.e. Territory
  // mode. Heat/Bubble/Cluster silently stay on "customer" (already the
  // page-level default set in geo-engine/page.tsx).
  allowGroupByChoice,
}: {
  filters: GeoFilters;
  onChangeFilters: (next: GeoFilters) => void;
  kpi: GeoKpi;
  onChangeKpi: (next: GeoKpi) => void;
  groupBy: GeoGroupBy;
  onChangeGroupBy: (next: GeoGroupBy) => void;
  allowGroupByChoice: boolean;
}) {
  const { t } = useTranslation();

  const KPI_LABEL: Record<GeoKpi, string> = {
    sales: t("geoEngine.kpiSales"),
    orders: t("geoEngine.kpiOrders"),
    customers: t("geoEngine.kpiCustomers"),
    visits: t("geoEngine.kpiVisits"),
    collections: t("geoEngine.kpiCollections"),
    returns: t("geoEngine.kpiReturns"),
    lostSales: t("geoEngine.kpiLostSales"),
  };

  const DIMENSION_LABEL: Record<DecisionFilterField, string> = {
    branch: t("geoEngine.filterBranch"),
    territory: t("geoEngine.filterCity"),
    channel: t("geoEngine.filterChannel"),
    category: t("geoEngine.filterCategory"),
    brand: t("geoEngine.filterBrand"),
    product: t("geoEngine.filterProduct"),
    customer: t("geoEngine.filterCustomer"),
    representative: t("geoEngine.filterRepresentative"),
    supervisor: t("geoEngine.filterSupervisor"),
  };

  function setArrayFilter(arrayKey: ArrayFilterField, values: string[]) {
    onChangeFilters({ ...filters, [arrayKey]: values.length > 0 ? values : undefined });
  }

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-4", allowGroupByChoice ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        <div className="grid gap-2">
          <Label>{t("geoEngine.dateFromLabel")}</Label>
          <Input type="date" value={filters.dateFrom} onChange={(e) => onChangeFilters({ ...filters, dateFrom: e.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label>{t("geoEngine.dateToLabel")}</Label>
          <Input type="date" value={filters.dateTo} onChange={(e) => onChangeFilters({ ...filters, dateTo: e.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label>{t("geoEngine.kpiLabel")}</Label>
          <Select value={kpi} onValueChange={(v) => onChangeKpi(v as GeoKpi)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KPI_VALUES.map((k) => (
                <SelectItem key={k} value={k}>
                  {KPI_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {allowGroupByChoice && (
          <div className="grid gap-2">
            <Label>{t("geoEngine.groupByLabel")}</Label>
            <Select value={groupBy} onValueChange={(v) => onChangeGroupBy(v as GeoGroupBy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">{t("geoEngine.groupByCustomer")}</SelectItem>
                <SelectItem value="city">{t("geoEngine.groupByCity")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {DIMENSION_FIELDS.map(({ field, arrayKey }) => (
          <MultiSelectFilter
            key={field}
            field={field}
            label={DIMENSION_LABEL[field]}
            selected={filters[arrayKey] ?? []}
            onChange={(values) => setArrayFilter(arrayKey, values)}
          />
        ))}
      </div>
    </div>
  );
}
