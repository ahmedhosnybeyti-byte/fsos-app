"use client";

import { LayoutDashboard, FileSpreadsheet, FileText, Sparkles, Users, Settings, Map, Flame, UserPlus, GitCompare, Bot, TrendingUp, Users2, Footprints, Target, LocateFixed, IdCard, Compass, MapPinned, BarChart3, Globe2 } from "lucide-react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { useTranslation } from "@/components/translation-provider";
import { Spinner } from "@/components/ui/spinner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth();
  const { t } = useTranslation();

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  // Grouped to match the shared visual-identity reference (sections like
  // "SALES"/"ANALYTICS"/"SYSTEM"), adapted to this app's actual feature set
  // rather than the reference's fictional nav items. Order matters here:
  // AppShell renders a section heading whenever `group` changes, so items
  // in the same group must stay contiguous.
  const navItems: NavItem[] = [
    { href: "/dashboard", label: t("nav.overview"), icon: LayoutDashboard, colorKey: "overview" },
    { href: "/dashboard/files", label: t("nav.files"), icon: FileSpreadsheet, colorKey: "files", group: t("group.data") },
    { href: "/dashboard/assistant", label: t("nav.assistant"), icon: Bot, colorKey: "assistant", group: t("group.aiInsights") },
    { href: "/dashboard/visit-copilot", label: t("nav.visitCopilot"), icon: Compass, colorKey: "visitCopilot", group: t("group.aiInsights") },
    { href: "/dashboard/analysis-studio", label: t("nav.analysisStudio"), icon: Sparkles, colorKey: "analysisStudio", group: t("group.aiInsights") },
    { href: "/dashboard/heatmap", label: t("nav.heatmap"), icon: Flame, colorKey: "heatmap", group: t("group.aiInsights") },
    { href: "/dashboard/sales-growth", label: t("nav.sgi"), icon: Target, colorKey: "sgi", group: t("group.aiInsights") },
    {
      href: "/dashboard/territory-intelligence",
      label: t("nav.territoryIntelligence"),
      icon: MapPinned,
      colorKey: "territoryIntelligence",
      group: t("group.aiInsights"),
    },
    {
      href: "/dashboard/decision-analytics-studio",
      label: t("nav.decisionAnalyticsStudio"),
      icon: BarChart3,
      colorKey: "decisionAnalyticsStudio",
      group: t("group.aiInsights"),
    },
    {
      href: "/dashboard/geo-engine",
      label: t("nav.geoEngine"),
      icon: Globe2,
      colorKey: "geoEngine",
      group: t("group.aiInsights"),
    },
    { href: "/dashboard/new-customer", label: t("nav.newCustomer"), icon: UserPlus, colorKey: "newCustomer", group: t("group.customersTerritory") },
    {
      href: "/dashboard/customer-comparison",
      label: t("nav.customerComparison"),
      icon: GitCompare,
      colorKey: "customerComparison",
      group: t("group.customersTerritory"),
    },
    {
      href: "/dashboard/customer-similarity",
      label: t("nav.customerSimilarity"),
      icon: Users2,
      colorKey: "customerSimilarity",
      group: t("group.customersTerritory"),
    },
    {
      href: "/dashboard/route-planning",
      label: t("nav.routePlanning"),
      icon: Map,
      colorKey: "routePlanning",
      group: t("group.customersTerritory"),
    },
    {
      href: "/dashboard/visit-efficiency",
      label: t("nav.visitEfficiency"),
      icon: Footprints,
      colorKey: "visitEfficiency",
      group: t("group.customersTerritory"),
    },
    {
      href: "/dashboard/customer-locations",
      label: t("nav.customerLocations"),
      icon: LocateFixed,
      colorKey: "customerLocations",
      group: t("group.customersTerritory"),
    },
    ...(["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(user.role.code)
      ? [
          {
            href: "/dashboard/team-performance",
            label: t("nav.teamPerformance"),
            icon: TrendingUp,
            colorKey: "teamPerformance" as const,
            group: t("group.team"),
          },
        ]
      : []),
    ...(["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(user.role.code)
      ? [
          {
            href: "/dashboard/reports",
            label: t("nav.reports"),
            icon: FileText,
            colorKey: "reports" as const,
            group: t("group.team"),
          },
        ]
      : []),
    ...(user.role.code === "COMPANY_ADMIN"
      ? [{ href: "/dashboard/team", label: t("nav.team"), icon: Users, colorKey: "team" as const, group: t("group.team") }]
      : []),
    ...(user.role.code === "COMPANY_ADMIN"
      ? [
          {
            href: "/dashboard/employees",
            label: t("nav.employees"),
            icon: IdCard,
            colorKey: "employees" as const,
            group: t("group.team"),
          },
        ]
      : []),
    ...(user.role.code === "COMPANY_ADMIN"
      ? [{ href: "/dashboard/settings", label: t("nav.settings"), icon: Settings, colorKey: "settings" as const, group: t("group.system") }]
      : []),
  ];

  return (
    <AppShell navItems={navItems} user={user}>
      {children}
    </AppShell>
  );
}
