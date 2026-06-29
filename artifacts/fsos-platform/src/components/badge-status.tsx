import { cn } from "@/lib/utils";

type Status = "Active" | "At Risk" | "Completed" | "In Progress" | "Planned" | "Missed" | "New" | "Inactive";

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  "At Risk": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  "In Progress": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Planned: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  Missed: "bg-red-500/10 text-red-600 border-red-500/20",
  New: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  Inactive: "bg-muted text-muted-foreground border-border",
};

interface BadgeStatusProps {
  status: Status | string;
  className?: string;
}

export function BadgeStatus({ status, className }: BadgeStatusProps) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
      STATUS_STYLES[status] ?? STATUS_STYLES.Inactive,
      className,
    )}>
      {status}
    </span>
  );
}
