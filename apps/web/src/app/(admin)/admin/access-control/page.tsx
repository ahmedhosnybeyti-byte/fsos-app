"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { auditApi, rolesApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatDate } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";

const editableRoles = new Set(["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"]);
const platformOnly = new Set(["access_control.view", "access_control.manage", "platform_settings.view", "platform_settings.manage", "companies.manage", "subscriptions.manage", "payments.manage", "usage.view", "audit.view", "platform.admin"]);

export default function AccessControlPage() {
  const queryClient = useQueryClient();
  const { data: roles, isLoading: rolesLoading, isError: rolesError } = useQuery({ queryKey: ["admin", "roles", "matrix"], queryFn: rolesApi.permissionsMatrix });
  const [pending, setPending] = useState<Record<string, string[]>>({});
  const [confirmRole, setConfirmRole] = useState<string | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const { data: logs, isLoading: logsLoading } = useQuery({ queryKey: ["admin", "audit-log", logsPage], queryFn: () => auditApi.list(logsPage, 15) });
  const allPermissions = useMemo(() => [...new Set((roles ?? []).flatMap((role) => role.permissions))].sort(), [roles]);
  const saveMutation = useMutation({
    mutationFn: ({ roleCode, permissions }: { roleCode: string; permissions: string[] }) => rolesApi.updatePermissions(roleCode, permissions),
    onSuccess: () => { setConfirmRole(null); void queryClient.invalidateQueries({ queryKey: ["admin", "roles", "matrix"] }); },
  });
  const selectionFor = (roleCode: string, current: string[]) => pending[roleCode] ?? current;
  const toggle = (roleCode: string, current: string[], permission: string, checked: boolean) => {
    if (platformOnly.has(permission)) return;
    const selected = new Set(selectionFor(roleCode, current));
    checked ? selected.add(permission) : selected.delete(permission);
    setPending((state) => ({ ...state, [roleCode]: [...selected].sort() }));
  };

  return <div className="relative space-y-6 px-1 sm:px-0">
    <div className="rise-in flex items-center gap-4"><span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary sm:flex"><ShieldCheck className="h-6 w-6" /></span><div><h1 className="text-2xl font-semibold tracking-tight">Access Control</h1><p className="text-muted-foreground">Review and update company-role permissions. Platform permissions remain protected.</p></div></div>
    <Card className="glass-card"><CardHeader><CardTitle>Roles &amp; permissions</CardTitle><CardDescription>Changes are recorded with a before/after audit entry.</CardDescription></CardHeader><CardContent className="space-y-4">
      {rolesLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : rolesError ? <p className="text-sm text-destructive">Could not load role permissions.</p> : roles?.map((role) => {
        const editable = editableRoles.has(role.code); const selected = selectionFor(role.code, role.permissions); const dirty = pending[role.code] !== undefined;
        return <div key={role.id} className="rounded-xl border border-border/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{role.name}</p><p className="text-xs text-muted-foreground">{role.code}</p></div>{editable ? <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => setConfirmRole(role.code)}>Save changes</Button> : <Badge variant="secondary">Protected</Badge>}</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{allPermissions.map((permission) => <label key={permission} className="flex min-h-10 items-center gap-2 rounded-md border p-2 text-sm"><input type="checkbox" checked={selected.includes(permission)} disabled={!editable || platformOnly.has(permission) || saveMutation.isPending} onChange={(event) => toggle(role.code, role.permissions, permission, event.target.checked)} /><span className="font-mono text-xs">{permission}</span>{platformOnly.has(permission) && <span className="text-xs text-muted-foreground">Platform only</span>}</label>)}</div>
        </div>;
      })}
    </CardContent></Card>
    {confirmRole && <Card className="border-primary"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">Save the permission changes for {confirmRole}?</p><div className="flex gap-2"><Button variant="outline" disabled={saveMutation.isPending} onClick={() => setConfirmRole(null)}>Cancel</Button><Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ roleCode: confirmRole, permissions: pending[confirmRole] ?? [] })}>{saveMutation.isPending ? "Saving..." : "Confirm"}</Button></div>{saveMutation.isError && <p className="w-full text-sm text-destructive">{saveMutation.error instanceof ApiError ? saveMutation.error.message : "Could not save permission changes."}</p>}</CardContent></Card>}
    <Card className="glass-card"><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent>{logsLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : !logs?.items.length ? <p className="text-sm text-muted-foreground">No activity recorded yet.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Entity</TableHead><TableHead>When</TableHead></TableRow></TableHeader><TableBody>{logs.items.map((entry) => <TableRow key={entry.id}><TableCell className="font-mono text-xs">{entry.action}</TableCell><TableCell className="text-muted-foreground">{entry.entityType ?? "—"}</TableCell><TableCell className="text-muted-foreground">{formatDate(entry.createdAt)}</TableCell></TableRow>)}</TableBody></Table></div>}{logs && <Pagination page={logsPage} total={logs.total} pageSize={logs.pageSize} onChange={setLogsPage} />}</CardContent></Card>
  </div>;
}