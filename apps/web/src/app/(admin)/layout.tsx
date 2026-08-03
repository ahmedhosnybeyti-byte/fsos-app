"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Receipt,
  ShieldCheck,
  BarChart3,
  Settings,
  CircleUserRound,
} from "lucide-react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { useTranslation } from "@/components/translation-provider";
import { Spinner } from "@/components/ui/spinner";

const adminNavItems = (t: (key: any) => string): NavItem[] => [
  { href: "/admin", label: t("admin.nav.dashboard"), icon: LayoutDashboard },
  { href: "/admin/users", label: t("admin.nav.users"), icon: Users },
  { href: "/admin/companies", label: t("admin.nav.companies"), icon: Building2 },
  { href: "/admin/subscriptions", label: t("admin.nav.subscriptions"), icon: CreditCard },
  { href: "/admin/payments", label: t("admin.nav.payments"), icon: Receipt },
  { href: "/admin/access-control", label: t("admin.nav.accessControl"), icon: ShieldCheck },
  { href: "/admin/usage", label: t("admin.nav.usage"), icon: BarChart3 },
  { href: "/admin/settings", label: t("admin.nav.settings"), icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth(["SUPER_ADMIN"]);
  const router = useRouter();
  const { t } = useTranslation();
  const navItems: NavItem[] = [...adminNavItems(t), { href: "/admin/account", label: t("nav.account"), icon: CircleUserRound }];
  const mustChangePassword = user?.mustChangePassword === true;

  useEffect(() => {
    if (mustChangePassword) router.replace("/account");
  }, [mustChangePassword, router]);

  if (isLoading || !user || mustChangePassword) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  }

  return <AppShell navItems={navItems} user={user}>{children}</AppShell>;
}