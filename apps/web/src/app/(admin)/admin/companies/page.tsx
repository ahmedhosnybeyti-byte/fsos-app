"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { companiesApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatDate } from "@/lib/utils";
import type { CompanyStatus } from "@field-sales-os/schemas";

export default function AdminCompaniesPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "companies", page], queryFn: () => companiesApi.list(page) });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CompanyStatus }) => companiesApi.update(id, { status }),
    onSuccess: async () => {
      toast.success("Company updated");
      await queryClient.invalidateQueries({ queryKey: ["admin", "companies"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update company"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
        <p className="text-muted-foreground">Every tenant on the platform.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All companies</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell className="text-muted-foreground">{company.slug}</TableCell>
                      <TableCell>
                        <Badge variant={company.status === "ACTIVE" ? "success" : "destructive"}>{company.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(company.createdAt)}</TableCell>
                      <TableCell>
                        {company.status === "ACTIVE" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => mutation.mutate({ id: company.id, status: "SUSPENDED" })}
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => mutation.mutate({ id: company.id, status: "ACTIVE" })}>
                            Reactivate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} total={data?.total ?? 0} pageSize={data?.pageSize ?? 20} onChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
