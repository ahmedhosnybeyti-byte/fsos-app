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

// Upload itself takes no dataset-type input from the client — the platform
// classifies the file automatically (see DatasetClassifierService). This is
// used only when a classification needs a human decision:
//   - confidence 60-90%: confirming (or overriding) the platform's guess
//   - confidence < 60%: picking manually
//   - mixed workbook: picking which sheet's classification to accept
export const confirmDatasetTypeSchema = z.object({
  datasetType: datasetTypeSchema,
  sheetIndex: z.number().int().min(0).optional(),
});
export type ConfirmDatasetTypeInput = z.infer<typeof confirmDatasetTypeSchema>;
