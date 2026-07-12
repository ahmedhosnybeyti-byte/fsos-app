"use client";

import { useQuery } from "@tanstack/react-query";
import { auditApi, rolesApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export default function AccessControlPage() {
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["admin", "roles", "matrix"],
    queryFn: rolesApi.permissionsMatrix,
  });
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: () => auditApi.list(1, 15),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Access Control</h1>
        <p className="text-muted-foreground">Role permissions and a live feed of security-relevant actions.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roles &amp; permissions</CardTitle>
          <CardDescription>Fixed per role today; the schema supports custom roles without a migration later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rolesLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            roles?.map((role) => (
              <div key={role.id} className="rounded-md border border-border p-4">
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

      <Card>
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
        </CardContent>
      </Card>
    </div>
  );
}
