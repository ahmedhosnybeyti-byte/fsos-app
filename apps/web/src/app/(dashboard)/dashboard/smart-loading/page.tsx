"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SmartLoadingScreen } from "@/components/smart-loading/smart-loading-screen";
import { smartLoadingApi } from "@/lib/api/smart-loading";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_SMART_LOADING_STALE_DAYS } from "@field-sales-os/schemas";

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function SmartLoadingPage() {
  const { user } = useAuth();
  const [targetDate, setTargetDate] = useState(tomorrowIso);
  const [staleDaysThreshold, setStaleDaysThreshold] = useState(DEFAULT_SMART_LOADING_STALE_DAYS);
  const [salesRepId, setSalesRepId] = useState<string>();
  const [managerId, setManagerId] = useState<string>();
  const [supervisorId, setSupervisorId] = useState<string>();
  const [includeDeferredAnalysis, setIncludeDeferredAnalysis] = useState(false);
  const managementView = ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR"].includes(user?.role.code ?? "");
  // Management starts with headers only. Once a manager, supervisor, or rep
  // is selected, fetch the existing session scoped to that selection.
  const deferManagementDetails = managementView && !managerId && !supervisorId && !salesRepId;
  const session = useQuery({
    queryKey: ["smart-loading", "session", targetDate, staleDaysThreshold, salesRepId, managerId, supervisorId, includeDeferredAnalysis],
    queryFn: () => smartLoadingApi.getSession(targetDate, staleDaysThreshold, salesRepId, managerId, supervisorId, includeDeferredAnalysis),
    enabled: !deferManagementDetails,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return (
    <SmartLoadingScreen
      session={session.data}
      isLoading={session.isLoading || session.isFetching}
      isError={session.isError}
      targetDate={targetDate}
      onTargetDateChange={(value) => { setIncludeDeferredAnalysis(false); setTargetDate(value); }}
      staleDaysThreshold={staleDaysThreshold}
      onStaleDaysThresholdChange={(value) => { setIncludeDeferredAnalysis(false); setStaleDaysThreshold(value); }}
      salesRepId={salesRepId}
      managerId={managerId}
      supervisorId={supervisorId}
      deferManagementDetails={deferManagementDetails}
      onLoadDeferredAnalysis={() => setIncludeDeferredAnalysis(true)}
      onSalesRepChange={(value) => { setIncludeDeferredAnalysis(false); setSalesRepId(value); }}
      onManagementScopeChange={({ managerId: nextManagerId, supervisorId: nextSupervisorId, salesRepId: nextSalesRepId }) => {
        setIncludeDeferredAnalysis(false);
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
