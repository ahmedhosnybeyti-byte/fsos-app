"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Count-up entrance for purely numeric KPI values (polish pass): the real
// value eases in over ~600ms on mount, once. Non-numeric values (dates,
// "لسه مفيش", status words) render as-is with no animation — this never
// invents or interpolates data, it only animates the arrival of the real
// number. Skipped entirely under prefers-reduced-motion.
function useCountUp(target: string): string {
  const numericTarget = /^\d+$/.test(target) ? parseInt(target, 10) : null;
  const [display, setDisplay] = useState<number | null>(numericTarget !== null ? 0 : null);

  useEffect(() => {
    if (numericTarget === null) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(numericTarget);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 600;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * numericTarget));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [numericTarget]);

  return numericTarget === null ? target : String(display ?? 0);
}

// FSOS Design Constitution §5.4 (KPI Cards) — name / value / % change /
// direction / small trend, readable within two seconds. `trend` is
// optional and intentionally omitted by every current Dashboard caller:
// none of the KPIs on this screen have a real historical baseline behind
// the existing hooks (files list, subscription), and the Constitution's
// own governing principle (§2.1 Decision First / no fabricated data) rules
// out inventing a percentage just to fill the slot. The prop exists so a
// future KPI backed by real trend data can use this same card without a
// rebuild — see the Dashboard Redesign completion report for the disclosed
// scope note.
//
// `featured` + `tagLabel` (added in the visual-elevation pass) give the
// row real hierarchy instead of four equal-weight tiles: the caller picks
// exactly one KPI to feature based on already-known real state (risk >
// urgency > default — see page.tsx), never a fabricated ranking.
const GLOW_TEXT: Record<NonNullable<KpiGlow>, string> = {
  ai: "text-ai",
  success: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
  premium: "text-premium",
};

const GLOW_BADGE_BG: Record<NonNullable<KpiGlow>, string> = {
  ai: "bg-ai/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
  critical: "bg-destructive/15",
  premium: "bg-premium/15",
};

type KpiGlow = "ai" | "success" | "warning" | "critical" | "premium" | undefined;

export function KpiCard({
  icon: Icon,
  label,
  value,
  caption,
  glow,
  trend,
  featured,
  tagLabel,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption?: string;
  glow?: KpiGlow;
  trend?: { direction: "up" | "down"; changeLabel: string };
  featured?: boolean;
  tagLabel?: string;
}) {
  const glowClass = glow ? `glow-${glow}` : undefined;
  const iconTint = glow ? GLOW_TEXT[glow] : "text-primary";
  const badgeBg = glow ? GLOW_BADGE_BG[glow] : "bg-primary/15";
  const displayValue = useCountUp(value);

  return (
    <div
      className={cn("glass-card card-lift", glowClass, featured ? "p-6 sm:col-span-2" : "p-5 opacity-90")}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {featured ? (
          <span className={cn("crystal-badge h-10 w-10", badgeBg, iconTint)}>
            <Icon className="h-5 w-5" />
          </span>
        ) : (
          <Icon className={cn("h-4 w-4 shrink-0", iconTint)} />
        )}
      </div>
      {tagLabel && (
        <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", badgeBg, iconTint)}>
          {tagLabel}
        </span>
      )}
      <p className={cn("mt-2 font-semibold tracking-tight text-foreground", featured ? "text-4xl" : "text-2xl")}>{displayValue}</p>
      {trend && (
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-xs font-medium",
            trend.direction === "up" ? "text-success" : "text-destructive",
          )}
        >
          {trend.direction === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend.changeLabel}
        </p>
      )}
      {!trend && caption && <p className="mt-1 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}
