import { z } from "zod";

export const companyOperatingModeSchema = z.enum(["ANALYSIS_ONLY", "SFA"]);
export type CompanyOperatingMode = z.infer<typeof companyOperatingModeSchema>;

export const updateCompanyOperatingSettingsSchema = z.object({
  operatingMode: companyOperatingModeSchema,
}).strict();
export type UpdateCompanyOperatingSettingsInput = z.infer<typeof updateCompanyOperatingSettingsSchema>;

export const SFA_ACCESS_PERMISSION = "sfa.access";
export const DEFAULT_COMPANY_OPERATING_MODE: CompanyOperatingMode = "ANALYSIS_ONLY";
