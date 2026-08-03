import { z } from "zod";

export const COMPANY_SCREEN_ACCESS_STATES = ["ENABLED", "LOCKED", "HIDDEN"] as const;
export const companyScreenAccessStateSchema = z.enum(COMPANY_SCREEN_ACCESS_STATES);
export type CompanyScreenAccessState = z.infer<typeof companyScreenAccessStateSchema>;

export const companyScreenRegistry = [
  { featureKey: "overview", route: "/dashboard", arabicLabel: "نظرة عامة", englishLabel: "Overview", navigationGroup: "overview", icon: "LayoutDashboard" },
  { featureKey: "files", route: "/dashboard/files", arabicLabel: "الملفات", englishLabel: "Files", navigationGroup: "data", icon: "FileSpreadsheet" },
  { featureKey: "assistant", route: "/dashboard/assistant", arabicLabel: "المساعد", englishLabel: "Assistant", navigationGroup: "aiInsights", icon: "Bot" },
  { featureKey: "visit-copilot", route: "/dashboard/visit-copilot", arabicLabel: "مساعد الزيارات", englishLabel: "Visit Copilot", navigationGroup: "aiInsights", icon: "Compass" },
  { featureKey: "smart-loading", route: "/dashboard/smart-loading", arabicLabel: "التحميل الذكي", englishLabel: "Smart Loading", navigationGroup: "aiInsights", icon: "PackagePlus" },
  { featureKey: "analysis-studio", route: "/dashboard/analysis-studio", arabicLabel: "استوديو التحليل", englishLabel: "Analysis Studio", navigationGroup: "aiInsights", icon: "Sparkles" },
  { featureKey: "heatmap", route: "/dashboard/heatmap", arabicLabel: "الخريطة الحرارية", englishLabel: "Heatmap", navigationGroup: "aiInsights", icon: "Flame" },
  { featureKey: "sales-growth", route: "/dashboard/sales-growth", arabicLabel: "نمو المبيعات", englishLabel: "Sales Growth", navigationGroup: "aiInsights", icon: "Target" },
  { featureKey: "territory-intelligence", route: "/dashboard/territory-intelligence", arabicLabel: "ذكاء المناطق", englishLabel: "Territory Intelligence", navigationGroup: "aiInsights", icon: "MapPinned" },
  { featureKey: "decision-analytics-studio", route: "/dashboard/decision-analytics-studio", arabicLabel: "استوديو تحليلات القرار", englishLabel: "Decision Analytics Studio", navigationGroup: "aiInsights", icon: "BarChart3" },
  { featureKey: "geo-engine", route: "/dashboard/geo-engine", arabicLabel: "محرك الجغرافيا", englishLabel: "Geo Engine", navigationGroup: "aiInsights", icon: "Globe2" },
  { featureKey: "fsos-360", route: "/dashboard/fsos-360", arabicLabel: "FSOS 360", englishLabel: "FSOS 360", navigationGroup: "aiInsights", icon: "BarChart3" },
  { featureKey: "new-customer", route: "/dashboard/new-customer", arabicLabel: "عميل جديد", englishLabel: "New Customer", navigationGroup: "customersTerritory", icon: "UserPlus" },
  { featureKey: "customer-comparison", route: "/dashboard/customer-comparison", arabicLabel: "مقارنة العملاء", englishLabel: "Customer Comparison", navigationGroup: "customersTerritory", icon: "GitCompare" },
  { featureKey: "customer-similarity", route: "/dashboard/customer-similarity", arabicLabel: "تشابه العملاء", englishLabel: "Customer Similarity", navigationGroup: "customersTerritory", icon: "Users2" },
  { featureKey: "route-planning", route: "/dashboard/route-planning", arabicLabel: "تخطيط المسارات", englishLabel: "Route Planning", navigationGroup: "customersTerritory", icon: "Map" },
  { featureKey: "visit-efficiency", route: "/dashboard/visit-efficiency", arabicLabel: "كفاءة الزيارات", englishLabel: "Visit Efficiency", navigationGroup: "customersTerritory", icon: "Footprints" },
  { featureKey: "customer-locations", route: "/dashboard/customer-locations", arabicLabel: "مواقع العملاء", englishLabel: "Customer Locations", navigationGroup: "customersTerritory", icon: "LocateFixed" },
  { featureKey: "team-performance", route: "/dashboard/team-performance", arabicLabel: "أداء الفريق", englishLabel: "Team Performance", navigationGroup: "team", icon: "TrendingUp" },
  { featureKey: "reports", route: "/dashboard/reports", arabicLabel: "التقارير", englishLabel: "Reports", navigationGroup: "team", icon: "FileText" },
  { featureKey: "team", route: "/dashboard/team", arabicLabel: "الفريق", englishLabel: "Team", navigationGroup: "team", icon: "Users" },
  { featureKey: "employees", route: "/dashboard/employees", arabicLabel: "الموظفون", englishLabel: "Employees", navigationGroup: "team", icon: "IdCard" },
  { featureKey: "settings", route: "/dashboard/settings", arabicLabel: "الإعدادات", englishLabel: "Settings", navigationGroup: "system", icon: "Settings" },
  { featureKey: "account", route: "/account", arabicLabel: "الحساب", englishLabel: "Account", navigationGroup: "system", icon: "CircleUserRound" },
] as const;

export type CompanyScreenFeatureKey = (typeof companyScreenRegistry)[number]["featureKey"];
export type CompanyFeatureAccess = Partial<Record<CompanyScreenFeatureKey, CompanyScreenAccessState>>;

export const updateCompanyFeatureAccessSchema = z.object({
  featureAccess: z.record(z.string(), companyScreenAccessStateSchema),
});
export type UpdateCompanyFeatureAccessInput = z.infer<typeof updateCompanyFeatureAccessSchema>;

const knownFeatureKeys = new Set<string>(companyScreenRegistry.map((screen) => screen.featureKey));

export function normalizeCompanyFeatureAccess(value: unknown): CompanyFeatureAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, state]) => knownFeatureKeys.has(key) && COMPANY_SCREEN_ACCESS_STATES.includes(state as CompanyScreenAccessState),
    ),
  ) as CompanyFeatureAccess;
}

export function getCompanyFeatureAccessState(featureAccess: CompanyFeatureAccess | null | undefined, featureKey: CompanyScreenFeatureKey): CompanyScreenAccessState {
  return featureAccess?.[featureKey] ?? "ENABLED";
}

export function getCompanyScreenForRoute(pathname: string) {
  return [...companyScreenRegistry]
    .sort((a, b) => b.route.length - a.route.length)
    .find((screen) => pathname === screen.route || pathname.startsWith(`${screen.route}/`));
}
