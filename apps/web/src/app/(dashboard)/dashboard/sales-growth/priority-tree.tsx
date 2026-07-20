"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, ChevronRight, Clock, HelpCircle, Lightbulb, MessageCircle, Search, TrendingDown, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SgiRepDirectoryEntry, SgiSeverity, SgiSituation, SgiSituationType } from "@/lib/types";

// "Priority Center" — the hierarchical replacement for the old flat
// Opportunities/Risks lists (Task #123, explicit product decision: this is
// not a notifications screen, it's a navigation structure that mirrors how
// a manager/supervisor/rep actually thinks — Sector -> Rep -> Priorities —
// so attention lands on the right level instead of one long list. Visual
// language (summary tiles, dot+count chips, search-by-name, compact
// collapsed cards) follows the product owner's reference mockup.
//
// This file holds ZERO business logic. Every grouping/filtering function
// here is a pure reshuffle of SgiSituation[] that SgiService already
// computed and already scored (severity, type, recommendation) — no new
// thresholds, no new decisions, nothing invented. The only "new" data
// involved is `repDirectory` (email -> display name / supervisor),
// likewise just human-readable labels for entities the engine already
// identified (see sgi.service.ts's getLatest()).
//
// Role -> shape (per the product owner's explicit spec):
//   COMPANY_ADMIN / MANAGER : Sector (by supervisor) -> Rep -> Priorities
//   SUPERVISOR              : Rep -> Priorities (already scoped to their team)
//   SALES_REP (and anyone else): a flat "today" list — see the note below.
//
// Known, deliberate gap vs. the reference mockup: the mockup's rep column
// shows a Sunday-Thursday day strip (each with its own count) and per-item
// clock times. SgiSituation carries no visit-day or time-of-day dimension
// at all — that's Visit Planning/route-schedule data, which doesn't exist
// in this codebase yet (confirmed with the product owner separately).
// Faking a 5-day tab strip or per-item times over data that has neither
// would be indistinguishable from real structure to the rep using it, so
// this component shows reps exactly what's real: a single "today" list,
// still using the same compact card style as the mockup. The day strip can
// be added later as one more grouping function, once each situation's
// customer can be mapped to a scheduled visit day — no rework of the tree
// mechanics below needed.

const TYPE_LABEL: Record<SgiSituationType, string> = {
  TARGET_BEHIND: "متأخر عن الهدف",
  LOST_SALES: "توقف شراء",
  CUSTOMER_DECLINING: "تراجع",
  CUSTOMER_INACTIVE: "خامل",
  COLLECTION_RISK: "تحصيل",
};

const TYPE_ICON: Record<SgiSituationType, LucideIcon> = {
  TARGET_BEHIND: TrendingDown,
  LOST_SALES: AlertTriangle,
  CUSTOMER_DECLINING: TrendingDown,
  CUSTOMER_INACTIVE: Clock,
  COLLECTION_RISK: Wallet,
};

const SEVERITY_ICON_STYLE: Record<SgiSeverity, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-warning/15 text-warning",
  low: "bg-success/15 text-success",
};

const SEVERITY_DOT: Record<SgiSeverity, string> = { high: "bg-destructive", medium: "bg-warning", low: "bg-success" };

const UNASSIGNED_KEY = "__unassigned__";

interface SeverityCounts {
  total: number;
  high: number;
  medium: number;
  low: number;
}

function countSeverity(situations: SgiSituation[]): SeverityCounts {
  const counts: SeverityCounts = { total: 0, high: 0, medium: 0, low: 0 };
  for (const s of situations) {
    counts.total += 1;
    counts[s.severity] += 1;
  }
  return counts;
}

function typeBreakdownLabel(situations: SgiSituation[]): string {
  const counts = new Map<SgiSituationType, number>();
  for (const s of situations) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${TYPE_LABEL[type]}: ${n}`)
    .join("، ");
}

// Most urgent groups first (by high-severity count, then total count) — a
// display sort, not a new decision: it doesn't change which situations
// exist or their severity, only the order groups appear in the tree.
function sortByImpact<T extends { situations: SgiSituation[] }>(groups: T[]): T[] {
  const impact = (g: T) => g.situations.filter((s) => s.severity === "high").length * 1000 + g.situations.length;
  return [...groups].sort((a, b) => impact(b) - impact(a));
}

interface RepGroup {
  key: string;
  name: string;
  situations: SgiSituation[];
}

function groupByRep(situations: SgiSituation[], directory: SgiRepDirectoryEntry[]): RepGroup[] {
  const nameByEmail = new Map(directory.map((d) => [d.email, d.name]));
  const buckets = new Map<string, SgiSituation[]>();
  for (const s of situations) {
    const key = s.ownerRepEmail ?? UNASSIGNED_KEY;
    const arr = buckets.get(key) ?? [];
    arr.push(s);
    buckets.set(key, arr);
  }
  const groups: RepGroup[] = Array.from(buckets.entries()).map(([key, sits]) => ({
    key,
    name: key === UNASSIGNED_KEY ? "غير محدد" : (nameByEmail.get(key) ?? key),
    situations: sits,
  }));
  return sortByImpact(groups);
}

interface SectorGroup {
  key: string;
  name: string;
  reps: RepGroup[];
  situations: SgiSituation[];
}

function groupBySector(situations: SgiSituation[], directory: SgiRepDirectoryEntry[]): SectorGroup[] {
  const directoryByEmail = new Map(directory.map((d) => [d.email, d]));
  const buckets = new Map<string, SgiSituation[]>();
  for (const s of situations) {
    const dirEntry = s.ownerRepEmail ? directoryByEmail.get(s.ownerRepEmail) : undefined;
    const key = dirEntry?.supervisorEmail ?? UNASSIGNED_KEY;
    const arr = buckets.get(key) ?? [];
    arr.push(s);
    buckets.set(key, arr);
  }
  const groups: SectorGroup[] = Array.from(buckets.entries()).map(([key, sits]) => {
    const supervisorEntry = directory.find((d) => d.supervisorEmail === key);
    return {
      key,
      name: key === UNASSIGNED_KEY ? "بدون مشرف محدد" : (supervisorEntry?.supervisorName ?? key),
      reps: groupByRep(sits, directory),
      situations: sits,
    };
  });
  return sortByImpact(groups);
}

// Name-only search over the tree (matches the reference mockup's "بحث في
// القطاعات أو المناديب") — filters which groups are shown, never touches
// the underlying situations or their scoring.
function filterSectors(sectors: SectorGroup[], query: string): SectorGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return sectors;
  return sectors
    .map((sector) => {
      const sectorMatches = sector.name.toLowerCase().includes(q);
      const reps = sectorMatches ? sector.reps : sector.reps.filter((r) => r.name.toLowerCase().includes(q));
      return { ...sector, reps };
    })
    .filter((sector) => sector.name.toLowerCase().includes(q) || sector.reps.length > 0);
}

function filterReps(reps: RepGroup[], query: string): RepGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return reps;
  return reps.filter((r) => r.name.toLowerCase().includes(q));
}

function CountChip({ color, value }: { color: string; value: number }) {
  if (value === 0) return null;
  return (
    <span className="flex items-center gap-1 text-xs font-medium">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {value}
    </span>
  );
}

function StatTile({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={cn("rounded-lg p-3 text-center", className)}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function SummaryStats({ counts }: { counts: SeverityCounts }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <StatTile label="إجمالي الأولويات" value={counts.total} className="bg-secondary/40 text-foreground" />
      <StatTile label="عالية" value={counts.high} className="bg-destructive/10 text-destructive" />
      <StatTile label="متوسطة" value={counts.medium} className="bg-warning/10 text-warning" />
      <StatTile label="منخفضة" value={counts.low} className="bg-success/10 text-success" />
    </div>
  );
}

function TreeNode({ label, subtitle, counts, children }: { label: string; subtitle?: string; counts: SeverityCounts; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-3 text-start transition-colors hover:bg-secondary/30"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <div className="min-w-0">
            <p className="truncate font-medium">{label}</p>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-xs text-muted-foreground">{counts.total}</span>
          <CountChip color={SEVERITY_DOT.high} value={counts.high} />
          <CountChip color={SEVERITY_DOT.medium} value={counts.medium} />
          <CountChip color={SEVERITY_DOT.low} value={counts.low} />
        </div>
      </button>
      {open && <div className="space-y-2 border-t border-border p-3">{children}</div>}
    </div>
  );
}

// Compact, collapsed-by-default card — matches the reference mockup's rep
// list style. Expands to reveal the reasoning (situation.detail, already
// computed) and the recommendation + "ناقشني" handoff.
function SituationCard({ situation, onDiscuss }: { situation: SgiSituation; onDiscuss: (situation: SgiSituation) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICON[situation.type];
  return (
    <div className="rounded-md border border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3 text-start transition-colors hover:bg-secondary/30">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", SEVERITY_ICON_STYLE[situation.severity])}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{situation.title}</p>
          <p className="truncate text-xs text-muted-foreground">{situation.recommendation}</p>
        </div>
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {situation.detail}
          </p>
          <p className="flex items-start gap-1.5 text-sm text-primary">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {situation.recommendation}
          </p>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => onDiscuss(situation)}>
            <MessageCircle className="h-3.5 w-3.5" />
            ناقشني
          </Button>
        </div>
      )}
    </div>
  );
}

function DayHeader({ children }: { children: React.ReactNode }) {
  const todayLabel = new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <CalendarDays className="h-4 w-4" /> {todayLabel}
      </p>
      {children}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute end-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pe-9" />
    </div>
  );
}

export function PriorityCenter({
  situations,
  repDirectory,
  roleCode,
  onDiscuss,
}: {
  situations: SgiSituation[];
  repDirectory: SgiRepDirectoryEntry[];
  roleCode: string;
  onDiscuss: (situation: SgiSituation) => void;
}) {
  const [query, setQuery] = useState("");

  if (situations.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">مفيش أولويات ظاهرة دلوقتي.</p>;
  }

  // SALES_REP (and any role that isn't a management role): flat list. See
  // the file-level note above on why this isn't a weekday tree yet.
  if (roleCode !== "COMPANY_ADMIN" && roleCode !== "MANAGER" && roleCode !== "SUPERVISOR") {
    return (
      <DayHeader>
        <div className="space-y-2">
          {situations.map((s) => (
            <SituationCard key={s.id} situation={s} onDiscuss={onDiscuss} />
          ))}
        </div>
      </DayHeader>
    );
  }

  if (roleCode === "SUPERVISOR") {
    const reps = filterReps(groupByRep(situations, repDirectory), query);
    return (
      <DayHeader>
        <div className="space-y-3">
          <SummaryStats counts={countSeverity(situations)} />
          <SearchBox value={query} onChange={setQuery} placeholder="بحث في المناديب…" />
          <div className="space-y-2">
            {reps.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">مفيش نتيجة مطابقة.</p>
            ) : (
              reps.map((rep) => (
                <TreeNode key={rep.key} label={rep.name} subtitle={typeBreakdownLabel(rep.situations)} counts={countSeverity(rep.situations)}>
                  {rep.situations.map((s) => (
                    <SituationCard key={s.id} situation={s} onDiscuss={onDiscuss} />
                  ))}
                </TreeNode>
              ))
            )}
          </div>
        </div>
      </DayHeader>
    );
  }

  // COMPANY_ADMIN / MANAGER: full 3-level tree.
  const sectors = filterSectors(groupBySector(situations, repDirectory), query);
  return (
    <DayHeader>
      <div className="space-y-3">
        <SummaryStats counts={countSeverity(situations)} />
        <SearchBox value={query} onChange={setQuery} placeholder="بحث في القطاعات أو المناديب…" />
        <div className="space-y-2">
          {sectors.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">مفيش نتيجة مطابقة.</p>
          ) : (
            sectors.map((sector) => (
              <TreeNode key={sector.key} label={sector.name} counts={countSeverity(sector.situations)}>
                {sector.reps.map((rep) => (
                  <TreeNode key={rep.key} label={rep.name} subtitle={typeBreakdownLabel(rep.situations)} counts={countSeverity(rep.situations)}>
                    {rep.situations.map((s) => (
                      <SituationCard key={s.id} situation={s} onDiscuss={onDiscuss} />
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            ))
          )}
        </div>
      </div>
    </DayHeader>
  );
}
