import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  className?: string;
}

export function StatCard({ label, value, sub, trend, icon: Icon, iconColor, iconBg, className }: StatCardProps) {
  const isPositive = trend !== undefined && trend >= 0;

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", iconBg ?? "bg-primary/10")}>
            <Icon className={cn("h-4 w-4", iconColor ?? "text-primary")} />
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
        <div className="flex items-center gap-2 mt-1">
          {trend !== undefined && (
            <span className={cn("flex items-center gap-0.5 text-xs font-medium", isPositive ? "text-emerald-500" : "text-red-500")}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isPositive ? "+" : ""}{trend}%
            </span>
          )}
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </div>
    </div>
  );
}
