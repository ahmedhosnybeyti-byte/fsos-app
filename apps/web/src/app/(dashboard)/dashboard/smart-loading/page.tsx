"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SmartLoadingScreen } from "@/components/smart-loading/smart-loading-screen";
import { smartLoadingApi } from "@/lib/api/smart-loading";

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function SmartLoadingPage() {
  const [targetDate, setTargetDate] = useState(tomorrowIso);
  const session = useQuery({
    queryKey: ["smart-loading", "session", targetDate],
    queryFn: () => smartLoadingApi.getSession(targetDate),
  });

  return (
    <SmartLoadingScreen
      session={session.data}
      isLoading={session.isLoading}
      isError={session.isError}
      targetDate={targetDate}
      onTargetDateChange={setTargetDate}
      onRetry={async () => {
        const result = await session.refetch();
        if (result.isError) throw result.error;
        return result.data;
      }}
    />
  );
}