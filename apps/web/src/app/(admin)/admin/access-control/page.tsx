"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { auditApi, rolesApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatDate } from "@/lib/utils";

export default function AccessControlPage() {
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["admin", "roles", "matrix"],
    queryFn: rolesApi.permissionsMatrix,
  });

  const [logsPage, setLogsPage] = useState(1);
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["admin", "audit-log", logsPage],
    queryFn: () => auditApi.list(logsPage, 15),
  });

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Access Control</h1>
          <p className="text-muted-foreground">Role permissions and a live feed of security-relevant actions.</p>
        </div>
      </div>

      <Card className="glass-card rise-in rise-d1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            Roles &amp; permissions
          </CardTitle>
          <CardDescription>Fixed per role today; the schema supports custom roles without a migration later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rolesLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            roles?.map((role) => (
              <div key={role.id} className="rounded-xl border border-border/60 bg-secondary/20 p-4 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="font-medium">{role.name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {role.permissions.map((permission) => (
                    <Badge key={permission} variant="secondary">
                      {permission}
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="glass-card rise-in rise-d2">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !logs || logs.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.entityType ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(entry.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {logs && <Pagination page={logsPage} total={logs.total} pageSize={logs.pageSize} onChange={setLogsPage} />}
        </CardContent>
      </Card>
    </div>
  );
}
