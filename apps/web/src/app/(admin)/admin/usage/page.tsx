"use client";

import { useQuery } from "@tanstack/react-query";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage Statistics</h1>
        <p className="text-muted-foreground">How companies are using their Custom GPTs, platform-wide.</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
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
          <CardTitle>What the event types mean</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {Object.entries(EVENT_LABELS).map(([key, label]) => (
            <p key={key}>
              <span className="font-mono text-xs">{key}</span> — {label}
            </p>
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
