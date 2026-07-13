"use client";

import { LayoutDashboard, FileSpreadsheet, Sparkles, Users, Settings, Map } from "lucide-react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { Spinner } from "@/components/ui/spinner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useRequireAuth();

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/analysis-studio", label: "Analysis Studio", icon: Sparkles },
    { href: "/dashboard/files", label: "Files", icon: FileSpreadsheet },
    { href: "/dashboard/route-planning", label: "Route Planning", icon: Map },
    ...(user.role.code === "COMPANY_ADMIN" ? [{ href: "/dashboard/team", label: "Team", icon: Users }] : []),
    ...(user.role.code === "COMPANY_ADMIN" ? [{ href: "/dashboard/settings", label: "Settings", icon: Settings }] : []),
  ];

  return (
    <AppShell navItems={navItems} user={user}>
      {children}
    </AppShell>
  );
}
