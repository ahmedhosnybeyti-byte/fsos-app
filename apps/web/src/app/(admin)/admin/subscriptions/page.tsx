"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { paymentsApi, plansApi, subscriptionsApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatMoneyCents } from "@/lib/utils";
import type { SubscriptionStatus } from "@field-sales-os/schemas";
import type { Subscription } from "@/lib/types";

export default function AdminSubscriptionsPage() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [recording, setRecording] = useState<Subscription | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["admin", "subscriptions", page], queryFn: () => subscriptionsApi.list(page) });

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex items-center gap-4">
        <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
          <CreditCard className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">Plan, status, and payment status for every company.</p>
        </div>
      </div>

      <Card className="glass-card rise-in rise-d1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <CreditCard className="h-4 w-4" />
            </span>
            All subscriptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.company?.name}</TableCell>
                      <TableCell>{sub.plan.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            sub.status === "ACTIVE"
                              ? "glow-success border-transparent"
                              : sub.status === "TRIAL"
                                ? "glow-warning border-transparent"
                                : "glow-critical border-transparent"
                          }
                        >
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={sub.paymentStatus === "PAID" ? "glow-success border-transparent" : "border-transparent bg-secondary/60 text-muted-foreground"}
                        >
                          {sub.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(sub)}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setRecording(sub)}>
                          Record payment
                        </Button>
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

      <EditSubscriptionDialog subscription={editing} onClose={() => setEditing(null)} />
      <RecordPaymentDialog subscription={recording} onClose={() => setRecording(null)} />
    </div>
  );
}

function EditSubscriptionDialog({ subscription, onClose }: { subscription: Subscription | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: plans } = useQuery({ queryKey: ["admin", "plans"], queryFn: plansApi.listAll, enabled: !!subscription });
  const [status, setStatus] = useState<SubscriptionStatus | undefined>(subscription?.status);
  const [planCode, setPlanCode] = useState<string | undefined>(subscription?.plan.code);
  const [trialEndsAt, setTrialEndsAt] = useState<string>(
    subscription?.trialEndsAt ? subscription.trialEndsAt.slice(0, 10) : "",
  );

  const mutation = useMutation({
    mutationFn: () =>
      subscriptionsApi.update(subscription!.companyId, {
        status,
        planCode,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : undefined,
      }),
    onSuccess: async () => {
      toast.success("Subscription updated");
      await queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update subscription"),
  });

  if (!subscription) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {subscription.company?.name}&apos;s subscription</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans?.map((plan) => (
                  <SelectItem key={plan.id} value={plan.code}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SubscriptionStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trialEndsAt">Trial ends</Label>
            <Input id="trialEndsAt" type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Only applies while status is TRIAL. Extend or shorten this company&apos;s trial without changing the
              platform-wide default.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({ subscription, onClose }: { subscription: Subscription | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      paymentsApi.record(subscription!.companyId, {
        subscriptionId: subscription!.id,
        amountCents: Math.round(Number(amount) * 100),
        currency: subscription!.plan.currency,
        status: "SUCCEEDED",
        paidAt: paidAt ? new Date(paidAt) : undefined,
        note: note || undefined,
      }),
    onSuccess: async () => {
      toast.success("Payment recorded");
      await queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
      setAmount("");
      setPaidAt("");
      setNote("");
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not record payment"),
  });

  if (!subscription) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment for {subscription.company?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="amount">Amount ({subscription.plan.currency})</Label>
          <Input id="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Plan price: {formatMoneyCents(subscription.plan.priceCents, subscription.plan.currency)}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="paidAt">Paid on (optional)</Label>
          <Input id="paidAt" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !amount}>
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
