"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CreditCard } from "lucide-react";
import { subscriptionsApi } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";
import type { SubscriptionStatus } from "@field-sales-os/schemas";

const STATUS_VARIANT: Record<SubscriptionStatus, "success" | "warning" | "destructive" | "secondary"> = {
  TRIAL: "warning",
  ACTIVE: "success",
  EXPIRED: "destructive",
  SUSPENDED: "destructive",
};

// FSOS Design Constitution §4.2 (Official Language — no mixed-language
// screen) requires these enum values (raw English from the API/DB) to be
// shown through a proper Arabic/English label, not the raw literal. Same
// wording as settings/page.tsx's local SUBSCRIPTION_STATUS_LABELS, kept as
// a separate local map here rather than extracted to a shared module, per
// the "no refactor outside Dashboard scope" rule for this task.
export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: "فترة تجريبية",
  ACTIVE: "نشط",
  EXPIRED: "منتهي",
  SUSPENDED: "موقوف",
};

const STATUS_GLOW: Record<SubscriptionStatus, "warning" | "success" | "critical"> = {
  TRIAL: "warning",
  ACTIVE: "success",
  EXPIRED: "critical",
  SUSPENDED: "critical",
};

// Same glow key, mapped to the matching text/bg utility classes for the
// header's crystal-badge — kept as a plain lookup (not a shared util) per
// the "no refactor outside Dashboard scope" rule.
const STATUS_BADGE_CLASSES: Record<SubscriptionStatus, string> = {
  TRIAL: "bg-warning/15 text-warning",
  ACTIVE: "bg-success/15 text-success",
  EXPIRED: "bg-destructive/15 text-destructive",
  SUSPENDED: "bg-destructive/15 text-destructive",
};

export function SubscriptionStatusCard() {
  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscriptions", "me"],
    queryFn: subscriptionsApi.mine,
  });

  if (isLoading) return <Skeleton className="h-full min-h-[220px]" />;
  if (!subscription) return null;

  const isBlocked = subscription.status === "EXPIRED" || subscription.status === "SUSPENDED";

  return (
    <div className={cn("glass-card flex h-full flex-col gap-4 p-6", `glow-${STATUS_GLOW[subscription.status]}`)}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight">
          <span className={cn("crystal-badge h-9 w-9", STATUS_BADGE_CLASSES[subscription.status])}>
            <CreditCard className="h-4 w-4" />
          </span>
          الاشتراك
        </h3>
        <Badge variant={STATUS_VARIANT[subscription.status]}>{STATUS_LABEL[subscription.status]}</Badge>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">الباقة</span>
          <span className="font-medium">{subscription.plan.name}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">حالة الدفع</span>
          <Badge variant={subscription.paymentStatus === "PAID" ? "success" : "secondary"}>
            {subscription.paymentStatus === "PAID" ? "مدفوع" : "غير مدفوع"}
          </Badge>
        </div>
        {subscription.status === "TRIAL" && subscription.trialEndsAt && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">انتهاء الفترة التجريبية</span>
            <span className="font-medium">{formatDate(subscription.trialEndsAt)}</span>
          </div>
        )}
      </div>

      {isBlocked && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            اشتراكك حاليًا {subscription.status === "EXPIRED" ? "منتهي" : "موقوف"}. رفع الملفات وتشغيل مرشدك معطّلان لحد ما
            يتم حل الأمر.
          </span>
        </div>
      )}
    </div>
  );
}
