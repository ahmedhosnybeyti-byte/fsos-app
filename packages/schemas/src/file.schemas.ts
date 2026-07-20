import { z } from "zod";

// Free-form by design — see SUGGESTED_DATASET_TYPES in enums.ts for the
// upload dropdown's presets. Trimmed, bounded length, no path-separator
// characters (it becomes part of the object storage key server-side).
export const datasetTypeSchema = z
  .string()
  .trim()
  .min(1, "Dataset type is required")
  .max(60, "Dataset type must be 60 characters or fewer")
  .refine((v) => !/[\\/]/.test(v), "Dataset type cannot contain slashes");

// Free-text row search inside a single uploaded file (any column, not a
// specific mapped one — the caller doesn't know the file's column layout).
// Used by Customer Location Capture so a rep typing a customer code/name can
// see the matching row(s) from the company's own Customers file and confirm
// they typed the right value before saving a location. No column mapping
// required on purpose: it's a plain "does any cell in this row contain what
// I typed" match, so it works regardless of which columns the file has.
export const searchFileRowsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});
export type SearchFileRowsQueryInput = z.infer<typeof searchFileRowsQuerySchema>;

export const searchFileRowsResultSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
});
export type SearchFileRowsResult = z.infer<typeof searchFileRowsResultSchema>;
