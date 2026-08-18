"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, Users, Zap } from "lucide-react";
import { usageApi, usersApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatDate } from "@/lib/utils";

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["usage", "platform"], queryFn: usageApi.platform });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const { data: newSubscribers, isLoading: isNewSubscribersLoading } = useQuery({
    queryKey: ["admin", "new-subscribers", page, from, to],
    queryFn: () => usersApi.newSubscribers(page, 20, { from: from || undefined, to: to || undefined }),
  });

  const updateDateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

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

      <section className="glass-hero p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-lg font-semibold">New subscribers</h2>
            <p className="text-sm text-muted-foreground">Registrations based on account creation date.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-muted-foreground">From date<Input type="date" value={from} onChange={(event) => updateDateFilter(setFrom, event.target.value)} /></label>
            <label className="space-y-1 text-sm text-muted-foreground">To date<Input type="date" value={to} onChange={(event) => updateDateFilter(setTo, event.target.value)} /></label>
          </div>
        </div>
        <p className="mt-5 text-3xl font-semibold">{isNewSubscribersLoading ? "…" : (newSubscribers?.total ?? 0).toLocaleString()}</p>
        <p className="mb-4 text-sm text-muted-foreground">Total registered in the selected period</p>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Company</TableHead><TableHead>Plan / Trial</TableHead><TableHead>Registered</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {isNewSubscribersLoading ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading registrations…</TableCell></TableRow> : newSubscribers?.items.length ? newSubscribers.items.map((subscriber) => <TableRow key={subscriber.id}><TableCell className="font-medium">{subscriber.fullName}</TableCell><TableCell>{subscriber.email}</TableCell><TableCell>{subscriber.whatsapp ?? "—"}</TableCell><TableCell>{subscriber.companyName ?? "—"}</TableCell><TableCell>{subscriber.plan ? `${subscriber.plan.plan.name} · ${subscriber.plan.status}` : "—"}</TableCell><TableCell>{formatDate(subscriber.createdAt)}</TableCell><TableCell><Badge variant="outline">{subscriber.status}</Badge></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No registrations in this period.</TableCell></TableRow>}
          </TableBody>
        </Table>
        {newSubscribers && <div className="mt-4"><Pagination page={newSubscribers.page} pageSize={newSubscribers.pageSize} total={newSubscribers.total} onChange={setPage} /></div>}
      </section>
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
