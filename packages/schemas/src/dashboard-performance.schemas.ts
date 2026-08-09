import { z } from "zod";

export const dashboardBenchmarkSchema = z.enum(["previous-month", "previous-quarter-average"]);
export type DashboardBenchmark = z.infer<typeof dashboardBenchmarkSchema>;

export const dashboardPerformanceQuerySchema = z.object({
  benchmark: dashboardBenchmarkSchema.default("previous-month"),
});
export type DashboardPerformanceQuery = z.infer<typeof dashboardPerformanceQuerySchema>;

const metricSchema = z.object({ current: z.number().nullable(), benchmark: z.number().nullable(), growthPct: z.number().nullable(), sparkline: z.array(z.number()) });
const targetSchema = z.object({ key: z.string(), label: z.string(), monthlyTarget: z.number(), actualMtd: z.number().nullable(), targetMtd: z.number(), aheadBehind: z.number().nullable(), progressPct: z.number().nullable(), remainingMonthlyTarget: z.number().nullable(), requiredDailyVelocity: z.number().nullable(), runRateForecast: z.number().nullable(), primary: z.boolean(), unit: z.enum(["currency", "count", "weight"]) });

export const dashboardPerformanceSchema = z.object({
  periodMonth: z.string(),
  benchmark: dashboardBenchmarkSchema,
  sellingDays: z.object({ elapsed: z.number(), total: z.number(), remaining: z.number(), available: z.boolean() }),
  metrics: z.object({ sales: metricSchema, collections: metricSchema, invoices: metricSchema, customers: metricSchema, skus: metricSchema, returns: metricSchema }),
  targets: z.array(targetSchema),
  warnings: z.array(z.string()),
});
export type DashboardPerformanceResult = z.infer<typeof dashboardPerformanceSchema>;
