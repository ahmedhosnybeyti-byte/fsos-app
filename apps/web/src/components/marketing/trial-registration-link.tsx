"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { platformSettingsApi } from "@/lib/api";

export function TrialRegistrationLink() {
  const { data } = useQuery({
    queryKey: ["platform-settings", "public-trial-registration"],
    queryFn: platformSettingsApi.getPublicTrialRegistrationVisibility,
    refetchOnWindowFocus: true,
  });

  if (!data?.showTrialRegistration) return null;

  return (
    <Button size="lg" asChild className="shadow-[0_0_32px_-6px_hsl(var(--primary)/0.7)]">
      <Link href="/register">
        Start free trial <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}
