import { z } from "zod";
import { refreshRunStatusSchema, refreshTypeSchema } from "./enums";

// Phase 8 — Refresh Platform. MVP: Full Refresh only, synchronous
// orchestration. Does NOT migrate or touch any existing engine's read path —
// see apps/api/src/modules/refresh-platform.

export const triggerRefreshSchema = z.object({
  dataSourceId: z.string().trim().min(1),
  refreshType: refreshTypeSchema.optional(), // defaults to FULL server-side
});
export type TriggerRefreshInput = z.infer<typeof triggerRefreshSchema>;

// Data Quality Report — embedded 1:1 inside a RefreshRun's resultSummary
// rather than a separate table, per the constitution's own workflow (one
// report per refresh run).
export const dataQualityReportSchema = z.object({
  totalCategories: z.number(),
  matchedCategories: z.array(z.string()),
  missingFiles: z.array(z.string()),
  invalidSchema: z.array(z.string()),
  validationScore: z.number(), // 0..1
  structuralValidationError: z.string().nullable().optional(),
});
export type DataQualityReport = z.infer<typeof dataQualityReportSchema>;

export const refreshRunSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  dataSourceId: z.string(),
  triggeredByUserId: z.string().nullable(),
  refreshType: refreshTypeSchema,
  status: refreshRunStatusSchema,
  startedAt: z.union([z.string(), z.date()]).nullable(),
  completedAt: z.union([z.string(), z.date()]).nullable(),
  durationMs: z.number().nullable(),
  importedRecords: z.number(),
  errorCount: z.number(),
  dataQualityScore: z.number().nullable(),
  resultSummary: dataQualityReportSchema.nullable(),
  createdAt: z.union([z.string(), z.date()]),
});
export type RefreshRun = z.infer<typeof refreshRunSchema>;
