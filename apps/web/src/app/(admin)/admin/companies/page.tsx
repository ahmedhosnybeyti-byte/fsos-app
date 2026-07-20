"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { companiesApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatDate } from "@/lib/utils";

export default function AdminCompaniesPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "companies", page], queryFn: () => companiesApi.list(page) });

  // Goes through the validated lifecycle state machine (companies.service.ts's
  // transitionStatus) instead of a raw status PATCH, so transitions are
  // checked against STATUS_TRANSITIONS and get a correct, typed audit-log
  // entry (company.lifecycle.suspend/reactivate) and platform event.
  const mutation = useMutation({
    mutationFn: ({ id, event }: { id: string; event: "SUSPEND" | "REACTIVATE" }) => companiesApi.lifecycle(id, event),
    onSuccess: async () => {
      toast.success("Company updated");
      await queryClient.invalidateQueries({ queryKey: ["admin", "companies"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update company"),
  });

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <Building2 className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-muted-foreground">Every tenant on the platform.</p>
        </div>
      </div>

      <div className="glass-hero rise-in rise-d1 relative p-6">
        <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
        <h3 className="relative flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight">
          <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          All companies
        </h3>
        <div className="relative mt-4">
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
                        <Badge
                          variant="outline"
                          className={
                            company.status === "ACTIVE"
                              ? "glow-success border-transparent"
                              : company.status === "DRAFT" || company.status === "CONFIGURING"
                                ? "border-transparent bg-secondary/60 text-muted-foreground"
                                : "glow-critical border-transparent"
                          }
                        >
                          {company.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(company.createdAt)}</TableCell>
                      <TableCell>
                        {company.status === "ACTIVE" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => mutation.mutate({ id: company.id, event: "SUSPEND" })}
                          >
                            Suspend
                          </Button>
                        ) : company.status === "SUSPENDED" ? (
                          <Button variant="outline" size="sm" onClick={() => mutation.mutate({ id: company.id, event: "REACTIVATE" })}>
                            Reactivate
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} total={data?.total ?? 0} pageSize={data?.pageSize ?? 20} onChange={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
