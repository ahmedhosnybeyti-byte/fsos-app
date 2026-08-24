"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SmartLoadingScreen } from "@/components/smart-loading/smart-loading-screen";
import { SmartLoadingManagementScreen } from "@/components/smart-loading/smart-loading-management-screen";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { DEFAULT_SMART_LOADING_STALE_DAYS } from "@field-sales-os/schemas";
import { useAuth } from "@/hooks/use-auth";

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function SmartLoadingPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [targetDate, setTargetDate] = useState(tomorrowIso);
  const [staleDaysThreshold, setStaleDaysThreshold] = useState(DEFAULT_SMART_LOADING_STALE_DAYS);
  const isSalesRep = user?.role.code === "SALES_REP";
  const session = useQuery({
    queryKey: ["smart-loading", "session", targetDate, staleDaysThreshold],
    queryFn: () => smartLoadingApi.getSession(targetDate, staleDaysThreshold),
    enabled: isSalesRep,
  });

  if (isAuthLoading) return <div className="space-y-3"><div className="h-32 animate-pulse rounded-md bg-muted" /><div className="h-32 animate-pulse rounded-md bg-muted" /></div>;
  if (user && !isSalesRep) return <SmartLoadingManagementScreen />;

  return (
    <SmartLoadingScreen
      session={session.data}
      isLoading={session.isLoading}
      isError={session.isError}
      targetDate={targetDate}
      onTargetDateChange={setTargetDate}
      staleDaysThreshold={staleDaysThreshold}
      onStaleDaysThresholdChange={setStaleDaysThreshold}
      onRetry={async () => {
        const result = await session.refetch();
        if (result.isError) throw result.error;
        return result.data;
      }}
    />
  );
}
