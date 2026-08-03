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
  const state = screen ? getCompanyFeatureAccessState(user.featureAccess, screen.featureKey) : "ENABLED";

  useEffect(() => {
    if (state === "HIDDEN") router.replace("/dashboard");
  }, [router, state]);

  if (state === "HIDDEN") return <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  if (state === "LOCKED") return <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-3 text-center"><LockKeyhole className="h-10 w-10 text-muted-foreground" /><h1 className="text-xl font-semibold">This screen is unavailable</h1><p className="text-muted-foreground">This screen is not available under your company&apos;s current settings.</p></div>;
  return <>{children}</>;
}
