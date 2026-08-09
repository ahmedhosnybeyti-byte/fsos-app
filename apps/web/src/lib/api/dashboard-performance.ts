import { apiFetch } from "../api-client";

export type DashboardBenchmark = "previous-month" | "previous-quarter-average";
export interface DashboardMetric { current: number | null; benchmark: number | null; growthPct: number | null; sparkline: number[]; }
export interface DashboardTarget { key: string; label: string; monthlyTarget: number; actualMtd: number | null; targetMtd: number; aheadBehind: number | null; progressPct: number | null; remainingMonthlyTarget: number | null; requiredDailyVelocity: number | null; runRateForecast: number | null; primary: boolean; unit: "currency" | "count" | "weight"; }
export interface DashboardPerformance { periodMonth: string; benchmark: DashboardBenchmark; sellingDays: { elapsed: number; total: number; remaining: number; available: boolean }; metrics: { sales: DashboardMetric; collections: DashboardMetric; invoices: DashboardMetric; customers: DashboardMetric; skus: DashboardMetric; returns: DashboardMetric }; targets: DashboardTarget[]; warnings: string[]; }
export const dashboardPerformanceApi = { get: (benchmark: DashboardBenchmark) => apiFetch<DashboardPerformance>("/dashboard-performance", { query: { benchmark } }) };
