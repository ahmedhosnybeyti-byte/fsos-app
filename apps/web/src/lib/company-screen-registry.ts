import type { CompanyFeatureAccess, CompanyScreenFeatureKey } from "@field-sales-os/schemas";
import { companyScreenRegistry, getCompanyFeatureAccessState } from "@field-sales-os/schemas";
import { BarChart3, Bot, CircleUserRound, Compass, FileSpreadsheet, FileText, Flame, GitCompare, Globe2, IdCard, LayoutDashboard, LocateFixed, Map, MapPinned, PackagePlus, Settings, Sparkles, Target, TrendingUp, UserPlus, Users, Users2, Footprints, type LucideIcon } from "lucide-react";
import type { NavItem } from "@/components/shell/app-shell";

const icons: Record<(typeof companyScreenRegistry)[number]["icon"], LucideIcon> = { LayoutDashboard, FileSpreadsheet, Bot, Compass, PackagePlus, Sparkles, Flame, Target, MapPinned, BarChart3, Globe2, UserPlus, GitCompare, Users2, Map, Footprints, LocateFixed, TrendingUp, FileText, Users, IdCard, Settings, CircleUserRound };

const colorKeys: Record<CompanyScreenFeatureKey, NonNullable<NavItem["colorKey"]>> = {
  overview: "overview", files: "files", assistant: "assistant", "visit-copilot": "visitCopilot", "smart-loading": "smartLoading", "analysis-studio": "analysisStudio", heatmap: "heatmap", "sales-growth": "sgi", "territory-intelligence": "territoryIntelligence", "decision-analytics-studio": "decisionAnalyticsStudio", "geo-engine": "geoEngine", "fsos-360": "decisionAnalyticsStudio", "new-customer": "newCustomer", "customer-comparison": "customerComparison", "customer-similarity": "customerSimilarity", "route-planning": "routePlanning", "visit-efficiency": "visitEfficiency", "customer-locations": "customerLocations", "team-performance": "teamPerformance", reports: "reports", team: "team", employees: "employees", settings: "settings", account: "settings",
};

export function companyScreenLabel(screen: (typeof companyScreenRegistry)[number], locale: "ar" | "en") {
  return locale === "ar" ? screen.arabicLabel : screen.englishLabel;
}

export function buildCompanyNavItems({ featureAccess, locale, groupLabels, roleCode }: { featureAccess: CompanyFeatureAccess | null | undefined; locale: "ar" | "en"; groupLabels: Record<string, string>; roleCode: string }) {
  return companyScreenRegistry
    .filter((screen) => !(screen.featureKey === "team-performance" || screen.featureKey === "reports") || ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(roleCode))
    .filter((screen) => !["team", "employees", "settings"].includes(screen.featureKey) || roleCode === "COMPANY_ADMIN")
    .filter((screen) => getCompanyFeatureAccessState(featureAccess, screen.featureKey) !== "HIDDEN")
    .map((screen): NavItem => ({
      href: screen.route,
      label: companyScreenLabel(screen, locale),
      icon: icons[screen.icon],
      colorKey: colorKeys[screen.featureKey],
      group: screen.navigationGroup === "overview" ? undefined : groupLabels[screen.navigationGroup],
      featureKey: screen.featureKey,
      locked: getCompanyFeatureAccessState(featureAccess, screen.featureKey) === "LOCKED",
    }));
}
