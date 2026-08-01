"use client";

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

const adminNavItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/companies", label: "Companies", icon: Building2 },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/payments", label: "Payments", icon: Receipt },
  { href: "/admin/access-control", label: "Access Control", icon: ShieldCheck },
  { href: "/admin/usage", label: "Usage Statistics", icon: BarChart3 },
  { href: "/admin/settings", label: "Platform Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth(["SUPER_ADMIN"]);
  const { t } = useTranslation();
  const navItems: NavItem[] = [...adminNavItems, { href: "/account", label: t("nav.account"), icon: CircleUserRound }];

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <AppShell navItems={navItems} user={user}>
      {children}
    </AppShell>
  );
}
