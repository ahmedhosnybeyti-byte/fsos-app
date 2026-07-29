"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronRight, Clock, HelpCircle, Lightbulb, MessageCircle, PackageMinus, Search, TrendingDown, TrendingUp, Wallet } from "lucide-react";
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

// "مركز فرص النمو" (2026-07-29 redesign) — reframes the same 7 SGI
// situation types as opportunities rather than alerts. Per explicit
// product decision: NO generic `metricValue - metricValuePrior` formula
// across every type — each type gets its own explicit, code-verified
// mapping below (OPPORTUNITY_METRIC), confirmed line-by-line against
// sgi.service.ts's actual field assignments (read-only; this file never
// imports from or modifies that service). Where the two numbers aren't a
// reliable like-for-like subtraction, the raw source values are shown
// instead of a fabricated "impact" figure — see each case's comment.
export const TYPE_LABEL: Record<SgiSituationType, string> = {
  TARGET_BEHIND: "متأخر عن الهدف",
  LOST_SALES: "فرصة استرجاع عميل",
  CUSTOMER_DECLINING: "فرصة استرجاع عميل",
  CUSTOMER_INACTIVE: "فرصة استرجاع عميل",
  COLLECTION_RISK: "فرصة تحصيل",
  GROWTH_OPPORTUNITY: "فرصة انتشار صنف",
  PRODUCT_DECLINE: "فرصة استرجاع صنف",
};

const TYPE_ICON: Record<SgiSituationType, LucideIcon> = {
  TARGET_BEHIND: TrendingDown,
  LOST_SALES: AlertTriangle,
  CUSTOMER_DECLINING: TrendingDown,
  CUSTOMER_INACTIVE: Clock,
  COLLECTION_RISK: Wallet,
  GROWTH_OPPORTUNITY: TrendingUp,
  PRODUCT_DECLINE: PackageMinus,
};

// Filter categories shown to the user — TARGET_BEHIND is rep-level (not a
// customer opportunity card) so it's excluded from this list and shown in
// its own section instead (unchanged from the current Monthly Goal card).
export const FILTERABLE_TYPES: SgiSituationType[] = [
  "LOST_SALES",
  "CUSTOMER_DECLINING",
  "CUSTOMER_INACTIVE",
  "COLLECTION_RISK",
  "GROWTH_OPPORTUNITY",
  "PRODUCT_DECLINE",
];

// One entry per SgiSituationType, verified against sgi.service.ts's actual
// situation-building code (read on 2026-07-29, not touched or re-derived
// here):
//   LOST_SALES / CUSTOMER_DECLINING / PRODUCT_DECLINE:
//     metricValue = current-period sales (or per-product value for
//     PRODUCT_DECLINE), metricValuePrior = same metric, prior period. Same
//     unit, same meaning both sides -> metricValuePrior - metricValue is a
//     reliable "value that used to happen and now doesn't" figure.
//   COLLECTION_RISK:
//     metricValue = c.acc.collectionCurrent (amount actually collected),
//     metricValuePrior = c.acc.current (amount sold) — and
//     metricValuePrior - metricValue is exactly the same subtraction
//     sgi.service.ts itself uses to compute `uncollected` for the
//     recommendation text (see collectionRiskCandidates), so this is a
//     verified, not invented, figure: the outstanding uncollected amount.
//   CUSTOMER_INACTIVE:
//     metricValue = current sales (always 0 by definition of this type),
//     metricValuePrior = prior sales. NOT framed as a "gap" here — it's a
//     historical ceiling, not a live before/after comparison — so only
//     metricValuePrior is shown, labeled as what the customer used to buy.
//   GROWTH_OPPORTUNITY:
//     metricValue = potential value of the suggested product,
//     metricValuePrior = always null. Only metricValue is meaningful.
//   TARGET_BEHIND:
//     metricValue = rep's actual sales, metricValuePrior = rep's target.
//     Different level (rep, not customer) — rendered in its own section,
//     not mixed into the opportunity-card ranking below.
export type MetricPresentation =
  | { kind: "gap"; label: string; value: number } // metricValuePrior - metricValue, reliable subtraction
  | { kind: "single"; label: string; value: number } // one meaningful number only
  | { kind: "raw-pair"; labelA: string; valueA: number; labelB: string; valueB: number }; // show both source numbers as-is, no derived math

export function opportunityMetric(s: SgiSituation): MetricPresentation {
  switch (s.type) {
    case "LOST_SALES":
    case "CUSTOMER_DECLINING":
    case "PRODUCT_DECLINE":
      return { kind: "gap", label: "قيمة يمكن استرجاعها", value: Math.max(0, (s.metricValuePrior ?? 0) - s.metricValue) };
    case "COLLECTION_RISK":
      // Verified equal to sgi.service.ts's own `uncollected` computation.
      return { kind: "gap", label: "مبلغ غير محصّل", value: Math.max(0, (s.metricValuePrior ?? 0) - s.metricValue) };
    case "CUSTOMER_INACTIVE":
      return { kind: "single", label: "كان بيشتري بـ", value: s.metricValuePrior ?? 0 };
    case "GROWTH_OPPORTUNITY":
      return { kind: "single", label: "القيمة المحتملة للصنف المقترح", value: s.metricValue };
    case "TARGET_BEHIND":
      return { kind: "raw-pair", labelA: "المحقق", valueA: s.metricValue, labelB: "الهدف", valueB: s.metricValuePrior ?? 0 };
  }
}

// Within-type ranking value only — every type here uses a like-for-like,
// code-verified number (see opportunityMetric above), never mixed across
// types with different units/meanings. Situations of different types are
// never sorted against each other by this value; see sortWithinType.
export function rankableValue(s: SgiSituation): number {
  const m = opportunityMetric(s);
  if (m.kind === "gap" || m.kind === "single") return m.value;
  return 0; // raw-pair (TARGET_BEHIND) isn't ranked here — separate section
}

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

// Clickable — selecting a tile filters the tree/list below to that
// severity and smoothly scrolls it into view (see SummaryStats/PriorityCenter).
// Purely a display filter over situations SgiService already scored;
// invents nothing new.
function StatTile({
  label,
  value,
  className,
  active,
  onClick,
}: {
  label: string;
  value: number;
  className: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg p-3 text-center transition-all",
        className,
        onClick && "cursor-pointer hover:brightness-110",
        active && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs">{label}</p>
    </button>
  );
}

function SummaryStats({
  counts,
  activeSeverity,
  onSelect,
}: {
  counts: SeverityCounts;
  activeSeverity?: SgiSeverity | null;
  onSelect?: (severity: SgiSeverity | null) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <StatTile
        label="إجمالي الأولويات"
        value={counts.total}
        className="bg-secondary/40 text-foreground"
        active={!activeSeverity}
        onClick={onSelect ? () => onSelect(null) : undefined}
      />
      <StatTile
        label="عالية"
        value={counts.high}
        className="bg-destructive/10 text-destructive"
        active={activeSeverity === "high"}
        onClick={onSelect ? () => onSelect("high") : undefined}
      />
      <StatTile
        label="متوسطة"
        value={counts.medium}
        className="bg-warning/10 text-warning"
        active={activeSeverity === "medium"}
        onClick={onSelect ? () => onSelect("medium") : undefined}
      />
      <StatTile
        label="منخفضة"
        value={counts.low}
        className="bg-success/10 text-success"
        active={activeSeverity === "low"}
        onClick={onSelect ? () => onSelect("low") : undefined}
      />
    </div>
  );
}

function TreeNode({
  label,
  subtitle,
  counts,
  children,
  defaultOpen,
}: {
  label: string;
  subtitle?: string;
  counts: SeverityCounts;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
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

export function formatMoney(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Renders opportunityMetric's honest, code-verified presentation — never a
// label reading "الأثر المتوقع" (expected impact) unless the underlying
// number really is a like-for-like gap (kind: "gap"). "single"/"raw-pair"
// show the source value(s) as-is instead of implying a derived impact
// figure that doesn't exist.
function MetricDisplay({ situation }: { situation: SgiSituation }) {
  const m = opportunityMetric(situation);
  if (m.kind === "gap") {
    return (
      <p className="flex items-baseline gap-1.5 text-sm">
        <span className="text-muted-foreground">{m.label}:</span>
        <span className="font-semibold text-primary">{formatMoney(m.value)}</span>
      </p>
    );
  }
  if (m.kind === "single") {
    return (
      <p className="flex items-baseline gap-1.5 text-sm">
        <span className="text-muted-foreground">{m.label}:</span>
        <span className="font-semibold">{formatMoney(m.value)}</span>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span>
        <span className="text-muted-foreground">{m.labelA}:</span> <span className="font-semibold">{formatMoney(m.valueA)}</span>
      </span>
      <span>
        <span className="text-muted-foreground">{m.labelB}:</span> <span className="font-semibold">{formatMoney(m.valueB)}</span>
      </span>
    </p>
  );
}

// Compact, collapsed-by-default card. Expanded state answers the 4
// required questions in order: why this customer surfaced (situation.title
// + detail, already computed by SgiService), what the opportunity is
// (situation.detail again — SGI doesn't separate "why" from "what" as two
// distinct fields, both live in `detail`), the suggested action
// (situation.recommendation), and the supporting number (MetricDisplay,
// honestly labeled per-type — never a fabricated "expected impact" where
// the source data doesn't support one).
function SituationCard({ situation, onDiscuss }: { situation: SgiSituation; onDiscuss: (situation: SgiSituation) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICON[situation.type];
  // GROWTH_OPPORTUNITY is upside (something to sell), not risk — its
  // severity still ranks which opportunity is biggest, but the icon tint
  // shouldn't read as a "problem" the way the other five types do.
  const iconStyle = situation.type === "GROWTH_OPPORTUNITY" ? "bg-primary/15 text-primary" : SEVERITY_ICON_STYLE[situation.severity];
  return (
    <div className="rounded-md border border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3 text-start transition-colors hover:bg-secondary/30">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", iconStyle)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-medium">{situation.title}</p>
          {/* Category tag (2026-07-29, explicit feedback): the opportunity
              type must read at a glance while standing at this one
              customer's card, not just as a top filter chip — a rep
              scanning cards needs to see "فرصة تحصيل" etc. as a visual tag
              attached to the card itself. */}
          <span
            className={cn(
              "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
              situation.type === "GROWTH_OPPORTUNITY" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground",
            )}
          >
            {TYPE_LABEL[situation.type]}
          </span>
        </div>
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-border p-3">
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {situation.detail}
          </p>
          <p className="flex items-start gap-1.5 text-sm text-primary">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {situation.recommendation}
          </p>
          <MetricDisplay situation={situation} />
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

// Category filter chips — one per real SGI opportunity type (see
// FILTERABLE_TYPES above; TARGET_BEHIND excluded, it's rep-level and lives
// in its own Monthly Goal section, unchanged). Multi-select: an empty set
// means "show all types," matching how activeSeverity's null means "all
// severities."
function TypeFilterChips({
  active,
  onToggle,
  countsByType,
}: {
  active: Set<SgiSituationType>;
  onToggle: (type: SgiSituationType) => void;
  countsByType: Map<SgiSituationType, number>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FILTERABLE_TYPES.map((type) => {
        const count = countsByType.get(type) ?? 0;
        if (count === 0) return null;
        const isActive = active.has(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => onToggle(type)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              isActive ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50",
            )}
          >
            {TYPE_LABEL[type]} ({count})
          </button>
        );
      })}
    </div>
  );
}

// Within-type-only ranking (per explicit product constraint: never compare
// raw values across types with different units/meanings). Groups by type in
// first-seen order, sorts each group by rankableValue descending, then
// concatenates the buckets back in that same first-seen type order — each
// bucket is now impact-ranked instead of just severity-ranked, without ever
// comparing two different types' numbers against each other.
export function sortWithinType(situations: SgiSituation[]): SgiSituation[] {
  const typeOrder: SgiSituationType[] = [];
  const byType = new Map<SgiSituationType, SgiSituation[]>();
  for (const s of situations) {
    let arr = byType.get(s.type);
    if (!arr) {
      arr = [];
      byType.set(s.type, arr);
      typeOrder.push(s.type);
    }
    arr.push(s);
  }
  const result: SgiSituation[] = [];
  for (const type of typeOrder) {
    const arr = byType.get(type)!;
    arr.sort((a, b) => rankableValue(b) - rankableValue(a));
    result.push(...arr);
  }
  return result;
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
  // Selecting a summary tile filters the tree/list to that severity and
  // auto-expands whatever groups remain, so the click reads as "open the
  // relevant part of the tree" rather than just recoloring a number.
  const [activeSeverity, setActiveSeverity] = useState<SgiSeverity | null>(null);
  // Category filter — empty set = all types visible (see TypeFilterChips).
  const [activeTypes, setActiveTypes] = useState<Set<SgiSituationType>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const selectSeverity = (severity: SgiSeverity | null) => {
    setActiveSeverity(severity);
    // Next tick, after the filtered/expanded tree has rendered, so the
    // scroll target's height already reflects the new content.
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const toggleType = (type: SgiSituationType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Counts per type computed from the full (severity-unfiltered) set, so
  // the chip row's counts stay stable while a severity tile is active —
  // only which chips are AVAILABLE changes with severity, not their totals.
  const countsByType = useMemo(() => {
    const m = new Map<SgiSituationType, number>();
    for (const s of situations) m.set(s.type, (m.get(s.type) ?? 0) + 1);
    return m;
  }, [situations]);

  const visibleSituations = useMemo(() => {
    let result = activeSeverity ? situations.filter((s) => s.severity === activeSeverity) : situations;
    if (activeTypes.size > 0) result = result.filter((s) => activeTypes.has(s.type));
    return sortWithinType(result);
  }, [situations, activeSeverity, activeTypes]);

  // Perf pass (2026-07-21): groupByRep/groupBySector walk every visible
  // situation to build the tree — for a COMPANY_ADMIN/MANAGER with a large
  // company this was being redone on every keystroke in the search box
  // (query was a dependency of the render, not of the grouping itself),
  // even though the search only needs to filter the already-grouped
  // sectors/reps by name. Memoized separately from `query` so typing in
  // the search box only re-runs the cheap filterReps/filterSectors pass
  // below, not the full re-group.
  const groupedReps = useMemo(() => groupByRep(visibleSituations, repDirectory), [visibleSituations, repDirectory]);
  const groupedSectors = useMemo(() => groupBySector(visibleSituations, repDirectory), [visibleSituations, repDirectory]);

  if (situations.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">مفيش أولويات ظاهرة دلوقتي.</p>;
  }

  // SALES_REP (and any role that isn't a management role): flat list. See
  // the file-level note above on why this isn't a weekday tree yet.
  if (roleCode !== "COMPANY_ADMIN" && roleCode !== "MANAGER" && roleCode !== "SUPERVISOR") {
    return (
      <DayHeader>
        <div className="space-y-3">
          <SummaryStats counts={countSeverity(situations)} activeSeverity={activeSeverity} onSelect={selectSeverity} />
          <TypeFilterChips active={activeTypes} onToggle={toggleType} countsByType={countsByType} />
          <div ref={listRef} className="space-y-2 scroll-mt-4">
            {visibleSituations.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">مفيش مواقف بالدرجة دي دلوقتي.</p>
            ) : (
              visibleSituations.map((s) => <SituationCard key={s.id} situation={s} onDiscuss={onDiscuss} />)
            )}
          </div>
        </div>
      </DayHeader>
    );
  }

  if (roleCode === "SUPERVISOR") {
    const reps = filterReps(groupedReps, query);
    return (
      <DayHeader>
        <div className="space-y-3">
          <SummaryStats counts={countSeverity(situations)} activeSeverity={activeSeverity} onSelect={selectSeverity} />
          <TypeFilterChips active={activeTypes} onToggle={toggleType} countsByType={countsByType} />
          <SearchBox value={query} onChange={setQuery} placeholder="بحث في المناديب…" />
          <div ref={listRef} className="space-y-2 scroll-mt-4">
            {reps.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">مفيش نتيجة مطابقة.</p>
            ) : (
              reps.map((rep) => (
                <TreeNode
                  key={`${rep.key}::${activeSeverity ?? "all"}`}
                  label={rep.name}
                  subtitle={typeBreakdownLabel(rep.situations)}
                  counts={countSeverity(rep.situations)}
                  defaultOpen={!!activeSeverity}
                >
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
  const sectors = filterSectors(groupedSectors, query);
  return (
    <DayHeader>
      <div className="space-y-3">
        <SummaryStats counts={countSeverity(situations)} activeSeverity={activeSeverity} onSelect={selectSeverity} />
        <TypeFilterChips active={activeTypes} onToggle={toggleType} countsByType={countsByType} />
        <SearchBox value={query} onChange={setQuery} placeholder="بحث في القطاعات أو المناديب…" />
        <div ref={listRef} className="space-y-2 scroll-mt-4">
          {sectors.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">مفيش نتيجة مطابقة.</p>
          ) : (
            sectors.map((sector) => (
              <TreeNode
                key={`${sector.key}::${activeSeverity ?? "all"}`}
                label={sector.name}
                counts={countSeverity(sector.situations)}
                defaultOpen={!!activeSeverity}
              >
                {sector.reps.map((rep) => (
                  <TreeNode
                    key={`${rep.key}::${activeSeverity ?? "all"}`}
                    label={rep.name}
                    subtitle={typeBreakdownLabel(rep.situations)}
                    counts={countSeverity(rep.situations)}
                    defaultOpen={!!activeSeverity}
                  >
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
