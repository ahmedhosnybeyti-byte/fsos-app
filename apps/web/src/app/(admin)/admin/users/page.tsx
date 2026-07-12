"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { companiesApi, usersApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export default function AdminUsersPage() {
  const [companyId, setCompanyId] = useState<string>();
  const queryClient = useQueryClient();

  const { data: companies } = useQuery({ queryKey: ["admin", "companies", "picker"], queryFn: () => companiesApi.list(1, 100) });
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "users", companyId],
    queryFn: () => usersApi.list(1, 50, companyId),
    enabled: !!companyId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) => (enable ? usersApi.enable(id) : usersApi.disable(id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users", companyId] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update user"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground">Select a company to view and manage its users.</p>
      </div>

      <div className="max-w-xs">
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

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
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
                      <Badge variant={member.status === "ACTIVE" ? "success" : "secondary"}>{member.status}</Badge>
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
        </CardContent>
      </Card>
    </div>
  );
}
