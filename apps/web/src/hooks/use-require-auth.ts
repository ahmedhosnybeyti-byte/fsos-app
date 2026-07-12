"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RoleCode } from "@field-sales-os/schemas";
import { useAuth } from "./use-auth";

// Client-side guard for pages inside (dashboard)/(admin) layouts. The real
// security boundary is the API's guard chain — this only prevents a flash
// of protected UI and bounces users who land somewhere their role can't use.
export function useRequireAuth(allowedRoles?: RoleCode[]) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (allowedRoles && user && !allowedRoles.includes(user.role.code)) {
      router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, user]);

  return { user, isLoading };
}
