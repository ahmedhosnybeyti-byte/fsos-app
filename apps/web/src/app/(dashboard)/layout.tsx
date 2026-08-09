"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useRequireAuth } from "@/hooks/use-require-auth";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { CompanyScreenAccessGuard } from "@/components/company-screen-access-guard";
import { buildCompanyNavItems } from "@/lib/company-screen-registry";
import { useTranslation } from "@/components/translation-provider";
import { Spinner } from "@/components/ui/spinner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const isSuperAdmin = user?.role.code === "SUPER_ADMIN";
  const mustChangePassword = user?.mustChangePassword === true;

  useEffect(() => {
    if (mustChangePassword) router.replace("/account");
    else if (isSuperAdmin) router.replace("/admin");
  }, [isSuperAdmin, mustChangePassword, router]);

  if (isLoading || !user || isSuperAdmin || mustChangePassword) return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;

  const navItems: NavItem[] = [
    ...buildCompanyNavItems({ featureAccess: user.featureAccess, t, roleCode: user.role.code, groupLabels: { data: t("group.data"), aiInsights: t("group.aiInsights"), customersTerritory: t("group.customersTerritory"), team: t("group.team"), system: t("group.system") } }),
  ];

  return <AppShell navItems={navItems} user={user}><CompanyScreenAccessGuard user={user}>{children}</CompanyScreenAccessGuard></AppShell>;
}
