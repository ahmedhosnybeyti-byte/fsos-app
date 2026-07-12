"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatDate, formatMoneyCents } from "@/lib/utils";

export default function AdminPaymentsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "payments", page], queryFn: () => paymentsApi.list(page) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground">Ledger of every payment recorded across the platform.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All payments</CardTitle>
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
                        <Badge variant={payment.status === "SUCCEEDED" ? "success" : "secondary"}>{payment.status}</Badge>
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
