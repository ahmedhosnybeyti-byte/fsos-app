"use client";

import { useQuery } from "@tanstack/react-query";
import { SmartLoadingScreen } from "@/components/smart-loading/smart-loading-screen";
import { smartLoadingApi } from "@/lib/api/smart-loading";

export default function SmartLoadingPage() {
  const session = useQuery({ queryKey: ["smart-loading", "session"], queryFn: smartLoadingApi.getSession });

  return (
    <SmartLoadingScreen
      session={session.data}
      isLoading={session.isLoading}
      isError={session.isError}
      onRetry={() => session.refetch()}
    />
  );
}
