"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { subscriptionsApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import type { SubscriptionStatus } from "@field-sales-os/schemas";

const STATUS_VARIANT: Record<SubscriptionStatus, "success" | "warning" | "destructive" | "secondary"> = {
  TRIAL: "warning",
  ACTIVE: "success",
  EXPIRED: "destructive",
  SUSPENDED: "destructive",
};

export function SubscriptionStatusCard() {
  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscriptions", "me"],
    queryFn: subscriptionsApi.mine,
  });

  if (isLoading) return <Skeleton className="h-40" />;
  if (!subscription) return null;

  const isBlocked = subscription.status === "EXPIRED" || subscription.status === "SUSPENDED";

  return (
    <Card className={isBlocked ? "border-destructive/50" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Subscription</CardTitle>
        <Badge variant={STATUS_VARIANT[subscription.status]}>{subscription.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium">{subscription.plan.name}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Payment status</span>
          <Badge variant={subscription.paymentStatus === "PAID" ? "success" : "secondary"}>{subscription.paymentStatus}</Badge>
        </div>
        {subscription.status === "TRIAL" && subscription.trialEndsAt && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Trial ends</span>
            <span className="font-medium">{formatDate(subscription.trialEndsAt)}</span>
          </div>
        )}
        {isBlocked && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Your subscription is {subscription.status.toLowerCase()}. Uploading files and launching your GPT are disabled
              until this is resolved.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
