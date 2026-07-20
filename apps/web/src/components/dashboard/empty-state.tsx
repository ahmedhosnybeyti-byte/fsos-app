import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// FSOS Design Constitution §5.11 (Empty States) — every empty screen/section
// must show: a clear message, the reason there's no data, a suggested
// action, and a visual element. Uses the shared crystal-badge treatment
// (§3.2 Crystal Design) — the same icon-badge material as the other
// Dashboard card headers, not a bespoke 3D object.
export function DashboardEmptyState({
  icon: Icon,
  title,
  reason,
  actionLabel,
  actionHref,
}: {
  icon: LucideIcon;
  title: string;
  reason: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="crystal-badge h-16 w-16 bg-primary/15 text-primary">
        <Icon className="h-7 w-7" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{reason}</p>
      </div>
      <Button asChild size="sm" className="mt-1">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </div>
  );
}
