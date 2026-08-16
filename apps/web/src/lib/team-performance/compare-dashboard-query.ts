import type { DashboardBenchmark } from "@/lib/api/dashboard-performance";

export interface DashboardPeriod {
  dateFrom?: string;
  dateTo?: string;
  comparisonFrom?: string;
  comparisonTo?: string;
}

// Compare cards must be keyed and fetched with the same scope and period as
// focus cards; otherwise React Query can reuse a response from another run.
export function compareDashboardQuery(benchmark: DashboardBenchmark, entityId: string, routeIds: string[], period: DashboardPeriod) {
  return {
    queryKey: ["team-compare", benchmark, entityId, routeIds.join(","), period.dateFrom, period.dateTo, period.comparisonFrom, period.comparisonTo] as const,
    period,
  };
}
