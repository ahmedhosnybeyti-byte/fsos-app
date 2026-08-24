"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCompanyFeatureAccessState, getCompanyScreenForRoute } from "@field-sales-os/schemas";
import { LockKeyhole } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { User } from "@/lib/types";

export function CompanyScreenAccessGuard({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const screen = getCompanyScreenForRoute(pathname);
  const isPlatformSuperAdmin = user.role.code === "SUPER_ADMIN" && user.companyId === null;
  const allowsMandatoryPasswordChange = screen?.featureKey === "account" && user.mustChangePassword;
  const allowsCompanyAdminSmartLoading = user.role.code === "COMPANY_ADMIN" && screen?.featureKey === "smart-loading";
  const state = isPlatformSuperAdmin || allowsCompanyAdminSmartLoading || !screen ? "ENABLED" : getCompanyFeatureAccessState(user.featureAccess, screen.featureKey);

  useEffect(() => {
    if (state === "HIDDEN" && !allowsMandatoryPasswordChange) router.replace("/dashboard");
  }, [allowsMandatoryPasswordChange, router, state]);

  useEffect(() => {
    if (state !== "LOCKED" || allowsMandatoryPasswordChange) return;
    const blockKeyboardShortcuts = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("keydown", blockKeyboardShortcuts, true);
    return () => document.removeEventListener("keydown", blockKeyboardShortcuts, true);
  }, [allowsMandatoryPasswordChange, state]);

  if (state === "HIDDEN" && !allowsMandatoryPasswordChange) return <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  if (state === "LOCKED" && !allowsMandatoryPasswordChange) return <div className="space-y-4"><div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-foreground"><LockKeyhole className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />هذه الميزة غير متاحة خلال الفترة التجريبية.</div><div inert aria-disabled="true" className="pointer-events-none select-none opacity-85">{children}</div></div>;
  return <>{children}</>;
}
