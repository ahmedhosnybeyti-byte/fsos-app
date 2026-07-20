import { z } from "zod";

// Sales Growth Intelligence (SGI) Phase 1 — Goal Planning's target model.
// See docs/SGI_ROADMAP.md section 3 point 1: a target can come from an
// uploaded "Targets"-type file (source=UPLOAD) or be entered directly in
// the platform's own target-list UI (source=MANUAL) — both write into the
// same table, so Goal Planning always reads from one place regardless of
// where a given month's number came from.

export const targetSourceSchema = z.enum(["UPLOAD", "MANUAL"]);
export type TargetSource = z.infer<typeof targetSourceSchema>;

// "YYYY-MM" — matches how every other month-scoped feature in this app
// (Team Performance's date range, etc.) already thinks about periods,
// kept as a plain string rather than a Date since a target is inherently
// month-granularity, not a specific day.
const periodMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "periodMonth must be in YYYY-MM format");

export const upsertTargetSchema = z.object({
  // A platform user email (same convention as File.repColumn/
  // supervisorColumn's row-level access control values) or a free-text
  // territory/route identifier — there's no dedicated Territory table in
  // this schema today.
  repOrTerritoryKey: z.string().min(1).max(200),
  periodMonth: periodMonthSchema,
  value: z.number().nonnegative(),
});
export type UpsertTargetInput = z.infer<typeof upsertTargetSchema>;

export const upsertTargetsBatchSchema = z.object({
  targets: z.array(upsertTargetSchema).min(1).max(500),
});
export type UpsertTargetsBatchInput = z.infer<typeof upsertTargetsBatchSchema>;

// Import path for the "Targets"-type uploaded file — same file-picker +
// column-mapping pattern as every other module (Customer Similarity,
// Team Performance, etc.), not a new upload UX.
export const importTargetsFromFileSchema = z.object({
  fileId: z.string().min(1),
  repOrTerritoryColumn: z.string().min(1).max(200),
  periodMonthColumn: z.string().min(1).max(200),
  valueColumn: z.string().min(1).max(200),
});
export type ImportTargetsFromFileInput = z.infer<typeof importTargetsFromFileSchema>;

export const listTargetsQuerySchema = z.object({
  periodMonth: periodMonthSchema.optional(),
});
export type ListTargetsQuery = z.infer<typeof listTargetsQuerySchema>;

export const targetRecordSchema = z.object({
  id: z.string(),
  repOrTerritoryKey: z.string(),
  periodMonth: z.string(),
  value: z.number(),
  source: targetSourceSchema,
  createdByUserId: z.string().nullable(),
  sourceFileId: z.string().nullable(),
  updatedAt: z.string(),
});
export type TargetRecord = z.infer<typeof targetRecordSchema>;

export const importTargetsResultSchema = z.object({
  importedCount: z.number(),
  skippedInvalidRows: z.number(),
});
export type ImportTargetsResult = z.infer<typeof importTargetsResultSchema>;
