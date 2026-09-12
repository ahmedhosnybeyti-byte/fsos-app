"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformSettingsApi } from "@/lib/api";

export function usePublicTrialRegistration() {
  return useQuery({
    queryKey: ["platform-settings", "public-trial-registration"],
    queryFn: platformSettingsApi.getPublicTrialRegistrationVisibility,
    refetchOnWindowFocus: true,
  });
}

export function PublicTrialRegistration({ children }: { children: ReactNode }) {
  const { data } = usePublicTrialRegistration();

  return data?.showTrialRegistration ? <>{children}</> : null;
}
