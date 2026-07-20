"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { paymentsApi, companiesApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoneyCents } from "@/lib/utils";

export default function AdminPaymentsPage() {
  const [page, setPage] = useState(1);
  const [companyId, setCompanyId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: companies } = useQuery({ queryKey: ["admin", "companies", "picker"], queryFn: () => companiesApi.list(1, 100) });
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", page, companyId, from, to],
    queryFn: () => paymentsApi.list(page, 20, { companyId: companyId || undefined, from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <Receipt className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">Ledger of every payment recorded across the platform.</p>
        </div>
      </div>

      <Card className="glass-card rise-in rise-d1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <Receipt className="h-4 w-4" />
            </span>
            All payments
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Select
              value={companyId || "all"}
              onValueChange={(v) => {
                setCompanyId(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companies?.items.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.company?.name}</TableCell>
                      <TableCell>{formatMoneyCents(payment.amountCents, payment.currency)}</TableCell>
                      <TableCell className="text-muted-foreground">{payment.provider}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            payment.status === "SUCCEEDED"
                              ? "glow-success border-transparent"
                              : payment.status === "FAILED"
                                ? "glow-critical border-transparent"
                                : "border-transparent bg-secondary/60 text-muted-foreground"
                          }
                        >
                          {payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(payment.paidAt ?? payment.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} total={data.total} pageSize={data.pageSize} onChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
