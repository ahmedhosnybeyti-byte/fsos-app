"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, Users, Zap } from "lucide-react";
import { usageApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["usage", "platform"], queryFn: usageApi.platform });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-muted-foreground">Snapshot across every company on Field Sales OS.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Building2} label="Companies" value={stats?.companiesCount ?? 0} />
          <StatCard icon={Users} label="Users" value={stats?.usersCount ?? 0} />
          <StatCard icon={Zap} label="GPT usage events" value={stats?.totalEvents ?? 0} />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CreditCard className="h-4 w-4" /> Subscriptions
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {Object.entries(stats?.subscriptionsByStatus ?? {}).map(([status, count]) => (
                <Badge key={status} variant="secondary">
                  {status}: {count}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Icon className="h-4 w-4" /> {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
