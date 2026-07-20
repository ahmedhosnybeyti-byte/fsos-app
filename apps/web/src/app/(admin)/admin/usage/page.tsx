"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { usageApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const EVENT_LABELS: Record<string, string> = {
  LAUNCH_TOKEN_ISSUED: "GPT launches",
  VERIFY_ACCESS: "Access verifications",
  DATASET_FETCH: "Dataset fetches",
  ANALYSIS_RUN: "Analysis runs",
};

export default function UsageStatisticsPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["usage", "platform"], queryFn: usageApi.platform });

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <BarChart3 className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage Statistics</h1>
          <p className="text-muted-foreground">How companies are using their Custom GPTs, platform-wide.</p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="rise-in rise-d1 h-64" />
      ) : (
        <div className="rise-in rise-d1 grid gap-6 md:grid-cols-2">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Subscriptions by status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(stats?.subscriptionsByStatus ?? {}).map(([status, count]) => (
                <StatRow key={status} label={status} value={count} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Platform totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow label="Companies" value={stats?.companiesCount ?? 0} />
              <StatRow label="Users" value={stats?.usersCount ?? 0} />
              <StatRow label="Total GPT usage events" value={stats?.totalEvents ?? 0} />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Event types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(EVENT_LABELS).map(([key, label]) => (
            <StatRow key={key} label={`${label} (${key})`} value={stats?.eventCounts?.[key] ?? 0} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value.toLocaleString()}</span>
    </div>
  );
}
