import { Link } from "wouter";
import {
  CalendarCheck, MapPin, Clock, Flag, TrendingUp,
  CreditCard, UserPlus, Package, AlertTriangle,
  ChevronRight, CheckCircle2, Circle, Loader2,
  Navigation, BarChart2, Route, Cpu, Satellite,
  Star, ArrowRight, Zap, RefreshCw, RotateCcw,
  BadgeAlert,
} from "lucide-react";
import {
  MISSION_SUMMARY, DAY_TARGETS, MISSION_CUSTOMERS, ALERTS,
  type MissionCustomer, type AlertItem, type KpiStatus, type Priority,
} from "@/data/daily-mission-mock";
import { cn } from "@/lib/utils";

// ── Design tokens ──────────────────────────────────────────────────────────
const PRIORITY_LEFT: Record<Priority, string> = {
  Critical: "border-l-rose-500",
  High:     "border-l-amber-500",
  Medium:   "border-l-blue-500",
  Low:      "border-l-emerald-500",
};
const PRIORITY_BADGE: Record<Priority, string> = {
  Critical: "bg-rose-500/15 text-rose-700 border-rose-500/25",
  High:     "bg-amber-500/15 text-amber-700 border-amber-500/25",
  Medium:   "bg-blue-500/15 text-blue-600 border-blue-500/25",
  Low:      "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",
};
const PRIORITY_DOT: Record<Priority, string> = {
  Critical: "bg-rose-500",
  High:     "bg-amber-500",
  Medium:   "bg-blue-500",
  Low:      "bg-emerald-500",
};
const KPI_STATUS: Record<KpiStatus, string> = {
  "on-track": "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  "at-risk":  "bg-amber-500/10 text-amber-700 border-amber-500/20",
  "achieved": "bg-blue-500/10 text-blue-700 border-blue-500/20",
};
const ALERT_ICON: Record<string, React.ReactNode> = {
  collection:    <CreditCard className="h-4 w-4 text-rose-500" />,
  "lost-sales":  <TrendingUp className="h-4 w-4 rotate-180 text-amber-500" />,
  credit:        <BadgeAlert className="h-4 w-4 text-orange-500" />,
  returns:       <RotateCcw className="h-4 w-4 text-blue-500" />,
  "high-priority": <Zap className="h-4 w-4 text-rose-500" />,
};
const ALERT_BG: Record<string, string> = {
  collection:    "bg-rose-500/8 border-rose-500/20",
  "lost-sales":  "bg-amber-500/8 border-amber-500/20",
  credit:        "bg-orange-500/8 border-orange-500/20",
  returns:       "bg-blue-500/8 border-blue-500/20",
  "high-priority": "bg-rose-500/8 border-rose-500/20",
};

// ── Primitives ─────────────────────────────────────────────────────────────
function SectionTitle({ icon: Icon, iconColor = "text-muted-foreground", title, sub }: {
  icon: React.ComponentType<{ className?: string }>; iconColor?: string; title: string; sub?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {sub && <span className="ml-auto text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function ProgressBar({ value, max, colorClass = "bg-primary" }: { value: number; max: number; colorClass?: string }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", colorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Section 1: Mission Summary ─────────────────────────────────────────────
function MissionSummary() {
  const m = MISSION_SUMMARY;
  const pct = m.plannedVisits > 0 ? Math.round((m.completedVisits / m.plannedVisits) * 100) : 0;

  const cards = [
    { icon: CalendarCheck, label: "Planned Visits",    value: `${m.plannedVisits}`,          sub: `${m.completedVisits} completed`,  color: "text-primary"     },
    { icon: Navigation,    label: "Est. Distance",     value: `${m.estimatedDistanceKm} km`,  sub: "total route",                    color: "text-blue-500"    },
    { icon: Clock,         label: "Working Hours",     value: m.workingHoursLabel,            sub: "field schedule",                 color: "text-violet-500"  },
    { icon: Flag,          label: "Est. Finish",       value: m.estimatedFinishTime,          sub: "on current pace",                color: "text-emerald-500" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/15">
        <div>
          <p className="text-sm font-bold text-foreground">{m.date}</p>
          <p className="text-xs text-muted-foreground">{m.rep} · {m.territory}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-600">Mission Active</span>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        {cards.map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="flex flex-col gap-1 px-4 py-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={cn("h-3.5 w-3.5", color)} />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            </div>
            <p className="text-xl font-black text-foreground">{value}</p>
            <p className="text-[10px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {/* Visit progress */}
      <div className="px-5 py-3 border-t border-border bg-muted/10">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Visit Progress</p>
          <p className="text-[10px] font-bold text-foreground">{m.completedVisits} / {m.plannedVisits} visits · {pct}%</p>
        </div>
        <ProgressBar value={m.completedVisits} max={m.plannedVisits} colorClass="bg-primary" />
      </div>
    </div>
  );
}

// ── Section 2: Today's Targets ─────────────────────────────────────────────
function TodayTargets() {
  const t = DAY_TARGETS;

  return (
    <div className="space-y-3">
      <SectionTitle icon={BarChart2} iconColor="text-primary" title="Today's Targets" />

      {/* Sales + Collection row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Sales Target", icon: TrendingUp, target: t.sales.target, achieved: t.sales.achieved, color: "bg-emerald-500", valueColor: "text-emerald-600" },
          { label: "Collection Target", icon: CreditCard, target: t.collection.target, achieved: t.collection.achieved, color: "bg-amber-500", valueColor: "text-amber-600" },
        ].map(({ label, icon: Icon, target, achieved, color, valueColor }) => {
          const pct = target > 0 ? Math.round((achieved / target) * 100) : 0;
          return (
            <div key={label} className="rounded-xl border border-border bg-card px-4 py-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                <span className={cn("ml-auto text-xs font-black", valueColor)}>{pct}%</span>
              </div>
              <p className="text-xl font-black text-foreground mb-0.5">AED {achieved.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground mb-2">of AED {target.toLocaleString()} target</p>
              <ProgressBar value={achieved} max={target} colorClass={color} />
            </div>
          );
        })}
      </div>

      {/* New Customers + Product Focus */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* New Customers */}
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">New Customers</p>
            <span className="ml-auto text-xs font-black text-foreground">{t.newCustomers.achieved} / {t.newCustomers.target}</span>
          </div>
          <div className="flex items-center gap-3">
            {Array.from({ length: t.newCustomers.target }).map((_, i) => (
              <div key={i} className={cn("h-8 w-8 rounded-full border-2 flex items-center justify-center",
                i < t.newCustomers.achieved ? "border-emerald-500 bg-emerald-500/10" : "border-dashed border-border bg-muted/30"
              )}>
                {i < t.newCustomers.achieved
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </div>
            ))}
          </div>
        </div>

        {/* KPIs */}
        <div className="rounded-xl border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">KPIs</p>
          </div>
          <div className="space-y-1.5">
            {t.kpis.map((k) => (
              <div key={k.label} className="flex items-center gap-2">
                <p className="text-xs text-foreground flex-1 truncate">{k.label}</p>
                <span className="text-[10px] text-muted-foreground">{k.current}</span>
                <span className="text-[10px] text-muted-foreground">/ {k.target}</span>
                <span className={cn("text-[10px] font-bold rounded-full border px-1.5 py-0.5", KPI_STATUS[k.status])}>
                  {k.status === "on-track" ? "On Track" : k.status === "at-risk" ? "At Risk" : "Achieved"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Product Focus */}
      <div className="rounded-xl border border-border bg-card px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground">Product Focus</p>
          <span className="ml-auto text-[10px] text-muted-foreground">{t.productFocus.length} priority SKUs today</span>
        </div>
        <div className="space-y-3">
          {t.productFocus.map((p) => {
            const pct = p.targetCases > 0 ? Math.round((p.achievedCases / p.targetCases) * 100) : 0;
            return (
              <div key={p.sku}>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-foreground flex-1">{p.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{p.sku}</p>
                  <p className="text-xs font-bold text-foreground">{p.achievedCases} / {p.targetCases} cases</p>
                </div>
                <ProgressBar value={p.achievedCases} max={p.targetCases} colorClass="bg-violet-500" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Section 3: Priority Customer List ─────────────────────────────────────
function CustomerCard({ customer }: { customer: MissionCustomer }) {
  const CLS: Record<string, string> = { A: "bg-amber-500/20 text-amber-700 border-amber-500/30", B: "bg-muted text-muted-foreground border-border" };
  const statusIcon = {
    pending:     <Circle    className="h-4 w-4 text-muted-foreground" />,
    "in-progress": <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    completed:   <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    skipped:     <Circle    className="h-4 w-4 text-muted-foreground opacity-40" />,
  };

  return (
    <div className={cn("rounded-xl border-l-4 border border-border bg-card hover:bg-accent/30 transition-colors overflow-hidden", PRIORITY_LEFT[customer.priority])}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Status icon */}
          <div className="pt-0.5 shrink-0">{statusIcon[customer.status]}</div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-foreground">{customer.name}</p>
                  <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-black", CLS[customer.classification])}>
                    <Star className="h-2.5 w-2.5" /> {customer.classification}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{customer.type} · {customer.code}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black", PRIORITY_BADGE[customer.priority])}>
                  {customer.priority}
                </span>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {customer.distanceKm} km
                </div>
              </div>
            </div>

            {/* Objective */}
            <div className="mt-2 flex items-start gap-1.5 rounded-md bg-muted/40 px-2.5 py-2">
              <Flag className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-foreground leading-relaxed">{customer.objective}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Est. {customer.estimatedDurationMin} min
          </div>
          {customer.hasDetailPage ? (
            <Link href={`/customers/${customer.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
              Open Customer 360 <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <button className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-not-allowed" disabled>
              Customer 360 <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PriorityCustomerList() {
  const criticalCount = MISSION_CUSTOMERS.filter(c => c.priority === "Critical").length;
  const highCount     = MISSION_CUSTOMERS.filter(c => c.priority === "High").length;

  return (
    <div className="space-y-3">
      <SectionTitle icon={CalendarCheck} iconColor="text-primary" title="Priority Customer List"
        sub={`${MISSION_CUSTOMERS.length} stops · ${criticalCount} critical · ${highCount} high`} />
      <div className="space-y-2.5">
        {MISSION_CUSTOMERS.map((c) => <CustomerCard key={c.id} customer={c} />)}
      </div>
    </div>
  );
}

// ── Section 4: Alerts Panel ────────────────────────────────────────────────
function AlertCard({ alert }: { alert: AlertItem }) {
  return (
    <div className={cn("rounded-xl border p-4 flex items-start gap-3", ALERT_BG[alert.type])}>
      <div className="h-8 w-8 rounded-lg bg-background/70 flex items-center justify-center shrink-0">
        {ALERT_ICON[alert.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className="text-xs font-bold text-foreground">{alert.customer}</p>
          <span className={cn("text-[10px] font-black rounded-full border px-2 py-0.5",
            alert.severity === "Critical" ? "bg-rose-500/15 text-rose-700 border-rose-500/25" :
            alert.severity === "High" ? "bg-amber-500/15 text-amber-700 border-amber-500/25" :
            "bg-blue-500/15 text-blue-600 border-blue-500/25"
          )}>{alert.severity}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
      </div>
      {alert.actionLabel && (
        <button className="text-[11px] font-semibold text-primary hover:text-primary/80 whitespace-nowrap flex items-center gap-0.5 shrink-0 pt-0.5 transition-colors">
          {alert.actionLabel} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function AlertsPanel() {
  const criticalAlerts = ALERTS.filter(a => a.severity === "Critical");
  return (
    <div className="space-y-3">
      <SectionTitle icon={AlertTriangle} iconColor="text-amber-500" title="Alerts"
        sub={`${ALERTS.length} active · ${criticalAlerts.length} critical`} />
      <div className="space-y-2.5">
        {ALERTS.map((a) => <AlertCard key={a.id} alert={a} />)}
      </div>
    </div>
  );
}

// ── Section 5: Intelligence Engine Placeholders ────────────────────────────
interface Engine { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string; title: string; description: string; badge: string }

const ENGINES: Engine[] = [
  {
    icon: Cpu,
    color: "text-violet-500", bg: "bg-violet-500/8", border: "border-violet-500/20",
    title: "Loading Intelligence Engine",
    description: "Will analyze visit history, order patterns, and rep performance to predict the optimal visit sequence and surface pre-visit briefings automatically.",
    badge: "Engine Pending",
  },
  {
    icon: Satellite,
    color: "text-blue-500", bg: "bg-blue-500/8", border: "border-blue-500/20",
    title: "Geo Intelligence Engine",
    description: "Will process real-time area data — competitor activity, zone velocity benchmarks, nearby account trends — and surface geo-specific selling recommendations.",
    badge: "Engine Pending",
  },
  {
    icon: Route,
    color: "text-emerald-500", bg: "bg-emerald-500/8", border: "border-emerald-500/20",
    title: "Route Intelligence Engine",
    description: "Will auto-sequence customer stops for maximum revenue yield, factoring in traffic, visit windows, customer priority scores, and collection urgency.",
    badge: "Engine Pending",
  },
];

function IntelligenceEngines() {
  return (
    <div className="space-y-3">
      <SectionTitle icon={Cpu} iconColor="text-violet-500" title="Intelligence Engines"
        sub="Connecting soon" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ENGINES.map((engine) => {
          const Icon = engine.icon;
          return (
            <div key={engine.title} className={cn("rounded-xl border p-5 flex flex-col gap-4", engine.bg, engine.border)}>
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className={cn("h-10 w-10 rounded-xl bg-background/60 flex items-center justify-center")}>
                  <Icon className={cn("h-5 w-5", engine.color)} />
                </div>
                <span className="text-[10px] font-black border rounded-full px-2 py-0.5 bg-background/60 text-muted-foreground border-border">
                  {engine.badge}
                </span>
              </div>

              {/* Content */}
              <div>
                <p className="text-sm font-bold text-foreground mb-1.5">{engine.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{engine.description}</p>
              </div>

              {/* Status bar */}
              <div className="rounded-lg bg-background/50 border border-border/50 px-3 py-2 flex items-center gap-2">
                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">Awaiting engine connection</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function DailyMission() {
  return (
    <div className="space-y-6 max-w-4xl">
      <MissionSummary />
      <TodayTargets />
      <PriorityCustomerList />
      <AlertsPanel />
      <IntelligenceEngines />
    </div>
  );
}
