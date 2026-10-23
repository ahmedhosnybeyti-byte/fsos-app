"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useRequireAuth } from "@/hooks/use-require-auth";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { CompanyScreenAccessGuard } from "@/components/company-screen-access-guard";
import { buildCompanyNavItems } from "@/lib/company-screen-registry";
import { useTranslation } from "@/components/translation-provider";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { supportsSfaOperations, getCompanyFeatureAccessState } from "@field-sales-os/schemas";
import { sfaSetupApi } from "@/lib/api/sfa-setup";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const canSetup = user?.role.code === "COMPANY_ADMIN" && !!user.companyId
    && getCompanyFeatureAccessState(user.featureAccess, "sfa-setup") === "ENABLED"
    && ["sfa.access", "company.manage"].every((permission) => user.permissions?.includes(permission));
  const operatingMode = useQuery({ queryKey: ["sfa-mode", user?.companyId], queryFn: sfaSetupApi.mode,
    enabled: (!!user?.companyId && getCompanyFeatureAccessState(user.featureAccess,"procurement") === "ENABLED" && user.permissions?.includes("procurement.read")) || canSetup || (!!user?.companyId && getCompanyFeatureAccessState(user.featureAccess,"accounting-core") === "ENABLED"
      && ["sfa.access","accounting.read"].every(p => user.permissions?.includes(p))) || (!!user?.companyId && getCompanyFeatureAccessState(user.featureAccess,"warehouse-core") === "ENABLED"
      && ["sfa.access","wms.read"].every(p => user.permissions?.includes(p))), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const isSuperAdmin = user?.role.code === "SUPER_ADMIN";
  const mustChangePassword = user?.mustChangePassword === true;

  useEffect(() => {
    if (mustChangePassword) router.replace("/account");
    else if (isSuperAdmin) router.replace("/admin");
  }, [isSuperAdmin, mustChangePassword, router]);

  if (isLoading || !user || isSuperAdmin || mustChangePassword) return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;

  const navItems: NavItem[] = [
    ...buildCompanyNavItems({ featureAccess: user.featureAccess, t, roleCode: user.role.code, groupLabels: { data: t("group.data"), aiInsights: t("group.aiInsights"), customersTerritory: t("group.customersTerritory"), team: t("group.team"), system: t("group.system") } })
      .filter(item => item.featureKey !== "procurement" || (operatingMode.data?.operatingMode === "FULL_ERP" && ["sfa.access","wms.read","procurement.read"].every(p=>user.permissions?.includes(p))))
      .filter((item) => item.featureKey !== "accounting-core" || (operatingMode.data?.operatingMode === "FULL_ERP" && ["MANAGER","ACCOUNTANT"].includes(user.role.code) && ["sfa.access","accounting.read"].every(p => user.permissions?.includes(p))))
      .filter((item) => item.featureKey !== "sfa-setup" || (canSetup && supportsSfaOperations(operatingMode.data?.operatingMode)))
      .filter((item) => item.featureKey !== "warehouse-core" || (supportsSfaOperations(operatingMode.data?.operatingMode) && ["sfa.access","wms.read"].every(p => user.permissions?.includes(p)))),
  ];

  return <AppShell navItems={navItems} user={user}><CompanyScreenAccessGuard user={user}>{children}</CompanyScreenAccessGuard></AppShell>;
}
