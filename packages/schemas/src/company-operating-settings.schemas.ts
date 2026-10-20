import { z } from "zod";

export const companyOperatingModeSchema = z.enum(["ANALYSIS_ONLY", "SFA", "FULL_ERP"]);
export type CompanyOperatingMode = z.infer<typeof companyOperatingModeSchema>;

export const updateCompanyOperatingSettingsSchema = z.object({
  operatingMode: companyOperatingModeSchema,
}).strict();
export type UpdateCompanyOperatingSettingsInput = z.infer<typeof updateCompanyOperatingSettingsSchema>;

export const SFA_ACCESS_PERMISSION = "sfa.access";
export const DEFAULT_COMPANY_OPERATING_MODE: CompanyOperatingMode = "ANALYSIS_ONLY";

// Mode is a capability ceiling, never a role grant, subscription or screen grant.
// Keep SFA's existing warehouse admission intact; Full ERP adds no unfinished API.
export function supportsSfaOperations(mode: unknown): boolean {
  return mode === "SFA" || mode === "FULL_ERP";
}

export const companyOperatingModes = [
  { value: "ANALYSIS_ONLY", arabicLabel: "مرشدك للتحليلات", englishLabel: "Murshidak Analytics" },
  { value: "SFA", arabicLabel: "مرشدك للمبيعات الميدانية", englishLabel: "Murshidak SFA" },
  { value: "FULL_ERP", arabicLabel: "مرشدك ERP المتكامل", englishLabel: "Murshidak Full ERP" },
] as const;

// Describes implemented boundaries rather than marketing completion claims.
// Deferred units have no route or permission that can be enabled by this registry.
export const companyModuleRegistry = [
  { key: "analytics", arabicLabel: "التحليلات وExcel وRIE والتقارير", englishLabel: "Analytics, Excel, RIE and reports", delivery: "AVAILABLE", modes: ["ANALYSIS_ONLY", "SFA", "FULL_ERP"] },
  { key: "operations-setup", arabicLabel: "تجهيز التشغيل والمستودعات الأساسية", englishLabel: "Operations setup and warehouse registry", delivery: "AVAILABLE", modes: ["SFA", "FULL_ERP"] },
  { key: "field-sales", arabicLabel: "دورة الزيارات والبيع التشغيلي الكاملة", englishLabel: "Complete operational visits and field sales cycle", delivery: "DEFERRED", modes: ["SFA", "FULL_ERP"] },
  { key: "warehouse", arabicLabel: "المستودع: أصناف واستلام وFEFO وحجز وتجهيز وصرف", englishLabel: "Warehouse: products, receiving, FEFO, reservations, picking and dispatch", delivery: "PARTIAL", modes: ["SFA", "FULL_ERP"] },
  { key: "purchasing", arabicLabel: "المشتريات والموردون", englishLabel: "Purchasing and suppliers", delivery: "DEFERRED", modes: ["FULL_ERP"] },
  { key: "accounting", arabicLabel: "الحسابات والأستاذ العام", englishLabel: "Accounting and general ledger", delivery: "DEFERRED", modes: ["FULL_ERP"] },
  { key: "invoicing", arabicLabel: "ترحيل الفواتير والمرتجعات", englishLabel: "Invoice and return posting", delivery: "DEFERRED", modes: ["FULL_ERP"] },
  { key: "collections", arabicLabel: "التحصيل وذمم العملاء", englishLabel: "Trade collections and receivables", delivery: "DEFERRED", modes: ["FULL_ERP"] },
] as const;

export function getCompanyModuleEntitlements(mode: CompanyOperatingMode) {
  return companyModuleRegistry.map((module) => ({ ...module,
    eligible: (module.modes as readonly string[]).includes(mode) && module.delivery !== "DEFERRED",
  }));
}
