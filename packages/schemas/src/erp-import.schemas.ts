import { z } from "zod";
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
export const erpImportStartSchema = z.object({
  targetMode: z.enum(["SFA", "FULL_ERP"]), source: z.enum(["EXCEL", "EXISTING"]),
  syntheticDemo: z.boolean().default(false), demoAsOf: day.optional(), cutoverDate: day,
}).strict().refine(v => !v.syntheticDemo || !!v.demoAsOf, "Synthetic demo needs an explicit reference date");
export const erpImportApprovalSchema = z.object({ revision: z.number().int().nonnegative(), note: z.string().trim().min(5).max(500) }).strict();
export const erpImportPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), entity: z.string().max(80).optional() }).strict();
export type ErpImportStart = z.infer<typeof erpImportStartSchema>;
