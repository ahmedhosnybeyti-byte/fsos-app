"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SmartLoadingScreen } from "@/components/smart-loading/smart-loading-screen";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { DEFAULT_SMART_LOADING_STALE_DAYS } from "@field-sales-os/schemas";

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function SmartLoadingPage() {
  const [targetDate, setTargetDate] = useState(tomorrowIso);
  const [staleDaysThreshold, setStaleDaysThreshold] = useState(DEFAULT_SMART_LOADING_STALE_DAYS);
  const [salesRepId, setSalesRepId] = useState<string>();
  const [managerId, setManagerId] = useState<string>();
  const [supervisorId, setSupervisorId] = useState<string>();
  const session = useQuery({
    queryKey: ["smart-loading", "session", targetDate, staleDaysThreshold, salesRepId, managerId, supervisorId],
    queryFn: () => smartLoadingApi.getSession(targetDate, staleDaysThreshold, salesRepId, managerId, supervisorId),
    placeholderData: (previous) => previous,
  });

  return (
    <SmartLoadingScreen
      session={session.data}
      isLoading={session.isLoading}
      isError={session.isError}
      targetDate={targetDate}
      onTargetDateChange={setTargetDate}
      staleDaysThreshold={staleDaysThreshold}
      onStaleDaysThresholdChange={setStaleDaysThreshold}
      salesRepId={salesRepId}
      managerId={managerId}
      supervisorId={supervisorId}
      onSalesRepChange={setSalesRepId}
      onManagementScopeChange={({ managerId: nextManagerId, supervisorId: nextSupervisorId, salesRepId: nextSalesRepId }) => {
        setManagerId(nextManagerId);
        setSupervisorId(nextSupervisorId);
        setSalesRepId(nextSalesRepId);
      }}
      onRetry={async () => {
        const result = await session.refetch();
        if (result.isError) throw result.error;
        return result.data;
      }}
    />
  );
}
