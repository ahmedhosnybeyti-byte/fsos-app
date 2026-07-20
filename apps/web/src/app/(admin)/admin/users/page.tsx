"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { companiesApi, usersApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

// Semantic glow per Constitution — mirrors dashboard/team's STATUS_GLOW map
// for the same UserStatus enum: success (active), warning (pending/invited),
// critical (suspended/locked), neutral fallback for disabled/archived.
const STATUS_GLOW: Record<string, string> = {
  PENDING: "glow-warning",
  ACTIVE: "glow-success",
  INVITED: "glow-warning",
  SUSPENDED: "glow-critical",
  LOCKED: "glow-critical",
  DISABLED: "",
  ARCHIVED: "",
};

export default function AdminUsersPage() {
  const [companyId, setCompanyId] = useState<string>();
  const [companySearch, setCompanySearch] = useState("");
  const queryClient = useQueryClient();

  const { data: companies } = useQuery({
    queryKey: ["admin", "companies", "picker", companySearch],
    queryFn: () => companiesApi.list(1, 100, companySearch || undefined),
  });
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "users", companyId],
    queryFn: () => usersApi.list(1, 50, companyId),
    enabled: !!companyId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      enable ? usersApi.enable(id, companyId) : usersApi.disable(id, companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users", companyId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update user"),
  });

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <Users className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground">Select a company to view and manage its users.</p>
        </div>
      </div>

      <div className="glass-card rise-in rise-d1 max-w-xs space-y-2 p-4">
        <Input
          placeholder="Search companies..."
          value={companySearch}
          onChange={(e) => setCompanySearch(e.target.value)}
        />
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a company" />
          </SelectTrigger>
          <SelectContent>
            {companies?.items.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-hero rise-in rise-d2 relative p-6">
        <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
        <h3 className="relative flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight">
          <span className="crystal-badge h-11 w-11 bg-primary/15 text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <Users className="h-5 w-5" />
          </span>
          Members
        </h3>
        <div className="relative mt-4">
          {!companyId && <p className="text-sm text-muted-foreground">Choose a company above.</p>}
          {companyId && isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {companyId && users && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.items.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium">{member.fullName}</div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </TableCell>
                    <TableCell>{member.role.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`border-transparent ${STATUS_GLOW[member.status] || "bg-secondary/60 text-muted-foreground"}`}
                      >
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(member.createdAt)}</TableCell>
                    <TableCell>
                      {member.status === "ACTIVE" ? (
                        <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: member.id, enable: false })}>
                          Disable
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: member.id, enable: true })}>
                          Enable
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
