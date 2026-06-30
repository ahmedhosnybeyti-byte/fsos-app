import {
  MapPin, Users, TrendingUp, TrendingDown, Zap, CreditCard,
  Brain, Building2, Satellite, Truck, RefreshCw, Info,
  CheckCircle2, Loader2, Circle, AlertOctagon, ChevronRight,
  Target, BarChart2, Flag, Star, AlertTriangle, Clock,
} from "lucide-react";
import {
  ROUTE_INFO, ROUTE_KPIS, CUSTOMER_SEGMENTS, PRODUCT_GROUPS,
  ROUTE_ALERTS, ROUTE_TIMELINE, INTELLIGENCE_ENGINES,
  type KPIStatus, type AlertSeverity, type StopStatus,
  type RouteKPI, type ProductGroup, type RouteAlert,
  type TimelineStop, type IntelligenceEngine,
} from "@/data/route-360-mock";
import { cn } from "@/lib/utils";

// ── Design tokens ──────────────────────────────────────────────────────────
const KPI_STATUS: Record<KPIStatus, { badge: string; bar: string; label: string }> = {
  "on-track": { badge: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25", bar: "bg-emerald-500", label: "On Track" },
  "at-risk":  { badge: "bg-amber-500/15 text-amber-700 border-amber-500/25",       bar: "bg-amber-500",   label: "At Risk"  },
  "critical": { badge: "bg-rose-500/15 text-rose-700 border-rose-500/25",          bar: "bg-rose-500",    label: "Critical" },
};

const ALERT_STYLE: Record<AlertSeverity, { left: string; badge: string; dot: string }> = {
  Critical: { left: "border-l-rose-500",    badge: "bg-rose-500/15 text-rose-700 border-rose-500/25",    dot: "bg-rose-500"    },
  High:     { left: "border-l-amber-500",   badge: "bg-amber-500/15 text-amber-700 border-amber-500/25", dot: "bg-amber-500"   },
  Medium:   { left: "border-l-blue-500",    badge: "bg-blue-500/15 text-blue-600 border-blue-500/25",    dot: "bg-blue-500"    },
  Low:      { left: "border-l-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25", dot: "bg-emerald-500" },
};

const STOP_STATUS: Record<StopStatus, { icon: React.ComponentType<{className?:string}>; color: string; ring: string; label: string }> = {
  "Completed":   { icon: CheckCircle2, color: "text-emerald-500", ring: "bg-emerald-500",     label: "Done"        },
  "In Progress": { icon: Loader2,      color: "text-blue-500",    ring: "bg-blue-500",         label: "In Progress" },
  "Planned":     { icon: Circle,       color: "text-muted-foreground", ring: "bg-muted",       label: "Planned"     },
  "Skipped":     { icon: AlertOctagon, color: "text-rose-500",    ring: "bg-rose-500",         label: "Skipped"     },
};

const SEGMENT_COLORS: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-700", border: "border-emerald-500/25", bar: "bg-emerald-500" },
  rose:    { bg: "bg-rose-500/10",    text: "text-rose-700",    border: "border-rose-500/25",    bar: "bg-rose-500"    },
  amber:   { bg: "bg-amber-500/10",   text: "text-amber-700",   border: "border-amber-500/25",   bar: "bg-amber-500"   },
  orange:  { bg: "bg-orange-500/10",  text: "text-orange-700",  border: "border-orange-500/25",  bar: "bg-orange-500"  },
  violet:  { bg: "bg-violet-500/10",  text: "text-violet-700",  border: "border-violet-500/25",  bar: "bg-violet-500"  },
};

const PRODUCT_COLORS: Record<string, { left: string; icon: string; dot: string }> = {
  emerald: { left: "border-l-emerald-500", icon: "text-emerald-500", dot: "bg-emerald-500/10" },
  amber:   { left: "border-l-amber-500",   icon: "text-amber-500",   dot: "bg-amber-500/10"  },
  rose:    { left: "border-l-rose-500",    icon: "text-rose-500",    dot: "bg-rose-500/10"   },
  blue:    { left: "border-l-blue-500",    icon: "text-blue-500",    dot: "bg-blue-500/10"   },
};

const PRODUCT_ICONS: Record<string, React.ComponentType<{className?:string}>> = {
  TrendingUp, TrendingDown, AlertOctagon, Zap,
};

const ENGINE_ICONS: Record<string, React.ComponentType<{className?:string}>> = {
  Satellite, Truck, TrendingDown, Zap, CreditCard, Brain, Building2,
};

// ── Shared primitives ──────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, iconColor = "text-muted-foreground", title, right }: {
  icon: React.ComponentType<{className?:string}>; iconColor?: string; title: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/15">
      <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      {children}
    </div>
  );
}

// ── Section 1: Route Summary ───────────────────────────────────────────────
function RouteSummary() {
  const r = ROUTE_INFO;
  const salesPct = Math.round((r.salesTotal / r.salesTarget) * 100);
  const collPct  = Math.round((r.collectionReceived / r.collectionDue) * 100);

  return (
    <Card>
      {/* Header band */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-border bg-muted/15">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground bg-muted/60 border border-border rounded px-1.5 py-0.5">{r.id}</span>
            <h2 className="text-base font-black text-foreground">{r.name}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            <span className="text-xs text-muted-foreground">{r.rep}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs text-muted-foreground">{r.territory}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs text-muted-foreground">{r.date}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs font-semibold text-blue-600">In Progress</span>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-border">
        {[
          { label: "Planned Customers",  value: String(r.plannedCustomers),       icon: Users,       color: "text-primary"     },
          { label: "Active Customers",   value: String(r.activeCustomers),        icon: Target,      color: "text-emerald-500" },
          { label: "Total Route Sales",  value: `AED ${(r.salesTotal/1000).toFixed(0)}k`,  icon: TrendingUp,  color: "text-blue-500"    },
          { label: "Sales Target",       value: `AED ${(r.salesTarget/1000).toFixed(0)}k`, icon: Flag,        color: "text-muted-foreground" },
          { label: "Collection Due",     value: `AED ${(r.collectionDue/1000).toFixed(0)}k`,      icon: CreditCard,  color: "text-amber-500"   },
          { label: "Collection Received",value: `AED ${(r.collectionReceived/1000).toFixed(0)}k`, icon: CheckCircle2,color: "text-emerald-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="px-4 py-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className={cn("h-3.5 w-3.5", color)} />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
            </div>
            <p className="text-xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Progress bars */}
      <div className="grid sm:grid-cols-2 divide-x divide-border border-t border-border">
        {[
          { label: "Sales Progress", pct: salesPct, color: salesPct >= 90 ? "bg-emerald-500" : salesPct >= 70 ? "bg-amber-500" : "bg-rose-500" },
          { label: "Collection Progress", pct: collPct, color: collPct >= 90 ? "bg-emerald-500" : collPct >= 70 ? "bg-amber-500" : "bg-rose-500" },
        ].map(({ label, pct, color }) => (
          <div key={label} className="px-5 py-3">
            <div className="flex justify-between mb-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className="text-[10px] font-black text-foreground">{pct}%</p>
            </div>
            <div className="h-1.5 rounded-full bg-muted/40">
              <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Section 2: Route KPIs ──────────────────────────────────────────────────
function KPICard({ kpi }: { kpi: RouteKPI }) {
  const s = KPI_STATUS[kpi.status];
  const barPct = Math.min(kpi.pct, 100);
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground leading-tight">{kpi.label}</p>
        <span className={cn("text-[10px] font-black rounded-full border px-2 py-0.5 whitespace-nowrap", s.badge)}>{s.label}</span>
      </div>
      <div>
        <p className="text-xl font-black text-foreground">{kpi.value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Target: {kpi.target}</p>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <p className="text-[10px] text-muted-foreground">Progress</p>
          <p className="text-[10px] font-bold text-foreground">{kpi.pct}%</p>
        </div>
        <div className="h-1.5 rounded-full bg-muted/40">
          <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${barPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function RouteKPIsSection() {
  return (
    <Card>
      <SectionHeader icon={BarChart2} iconColor="text-blue-500" title="Route KPIs"
        right={<span className="text-xs text-muted-foreground">{ROUTE_KPIS.length} metrics</span>} />
      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ROUTE_KPIS.map(k => <KPICard key={k.id} kpi={k} />)}
      </div>
    </Card>
  );
}

// ── Section 3: Customer Distribution ──────────────────────────────────────
function CustomerDistributionSection() {
  return (
    <Card>
      <SectionHeader icon={Users} iconColor="text-emerald-500" title="Customer Distribution"
        right={<span className="text-xs text-muted-foreground">{ROUTE_INFO.plannedCustomers} total accounts</span>} />
      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CUSTOMER_SEGMENTS.map((seg) => {
          const c = SEGMENT_COLORS[seg.colorClass];
          const pct = Math.round((seg.count / seg.total) * 100);
          return (
            <div key={seg.id} className={cn("rounded-xl border p-4 space-y-3", c.border, c.bg)}>
              <div className="flex items-center justify-between">
                <p className={cn("text-xs font-bold", c.text)}>{seg.label}</p>
                <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full", c.bg, c.text)}>{seg.count}</span>
              </div>
              <p className="text-3xl font-black text-foreground">{seg.count}<span className="text-sm text-muted-foreground font-normal ml-1">/ {seg.total}</span></p>
              <div className="space-y-1">
                <div className="h-1 rounded-full bg-black/10">
                  <div className={cn("h-full rounded-full", c.bar)} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">{seg.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Section 4: Product Performance ────────────────────────────────────────
function ProductGroupCard({ group }: { group: ProductGroup }) {
  const c = PRODUCT_COLORS[group.accentClass];
  const Icon = PRODUCT_ICONS[group.iconName] ?? TrendingUp;
  return (
    <div className={cn("rounded-xl border-l-4 border border-border bg-card overflow-hidden", c.left)}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/10">
        <div className={cn("h-6 w-6 rounded-lg flex items-center justify-center", c.dot)}>
          <Icon className={cn("h-3.5 w-3.5", c.icon)} />
        </div>
        <p className="text-xs font-bold text-foreground">{group.label}</p>
        <span className="ml-auto text-[10px] text-muted-foreground">{group.items.length} SKUs</span>
      </div>
      <div className="divide-y divide-border">
        {group.items.map((item) => (
          <div key={item.sku} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/10 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">{item.name}</p>
              <p className="text-[10px] text-muted-foreground">{item.category} · {item.sku}</p>
              <p className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">{item.note}</p>
            </div>
            {item.value > 0 && (
              <div className="text-right shrink-0">
                <p className="text-xs font-black text-foreground">{item.qty}</p>
                <p className="text-[10px] text-muted-foreground">units</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductPerformanceSection() {
  return (
    <Card>
      <SectionHeader icon={Star} iconColor="text-amber-500" title="Product Performance" />
      <div className="p-5 grid sm:grid-cols-2 gap-4">
        {PRODUCT_GROUPS.map(g => <ProductGroupCard key={g.id} group={g} />)}
      </div>
    </Card>
  );
}

// ── Section 5: Route Alerts ────────────────────────────────────────────────
function AlertCard({ alert }: { alert: RouteAlert }) {
  const s = ALERT_STYLE[alert.severity];
  return (
    <div className={cn("rounded-xl border-l-4 border border-border bg-card px-4 py-3 flex items-start gap-3", s.left)}>
      <span className={cn("mt-1 h-2 w-2 rounded-full shrink-0", s.dot)} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <p className="text-xs font-bold text-foreground">{alert.title}</p>
          <span className={cn("text-[10px] font-black rounded-full border px-1.5 py-0.5", s.badge)}>{alert.severity}</span>
          {alert.customer && (
            <span className="text-[10px] text-muted-foreground bg-muted/40 border border-border rounded-full px-2 py-0.5">{alert.customer}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{alert.message}</p>
        <div className="flex items-center gap-1 mt-2">
          <ChevronRight className="h-3 w-3 text-primary" />
          <p className="text-[11px] font-semibold text-primary">{alert.action}</p>
        </div>
      </div>
    </div>
  );
}

function RouteAlertsSection() {
  const criticalCount = ROUTE_ALERTS.filter(a => a.severity === "Critical" || a.severity === "High").length;
  return (
    <Card>
      <SectionHeader icon={AlertTriangle} iconColor="text-rose-500" title="Route Alerts"
        right={
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-rose-600">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            {criticalCount} urgent
          </span>
        } />
      <div className="p-5 space-y-3">
        {ROUTE_ALERTS.map(a => <AlertCard key={a.id} alert={a} />)}
      </div>
    </Card>
  );
}

// ── Section 6: Route Timeline ──────────────────────────────────────────────
function TimelineStopRow({ stop, isLast }: { stop: TimelineStop; isLast: boolean }) {
  const s = STOP_STATUS[stop.status];
  const StatusIcon = s.icon;
  const isPulsing = stop.status === "In Progress";
  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0 w-8">
        <div className={cn("relative h-8 w-8 rounded-full border-2 flex items-center justify-center",
          stop.status === "Completed"   ? "border-emerald-500 bg-emerald-500/10" :
          stop.status === "In Progress" ? "border-blue-500 bg-blue-500/10" :
          stop.status === "Skipped"     ? "border-rose-500 bg-rose-500/10" :
          "border-border bg-muted/30")}>
          {isPulsing && <span className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />}
          <StatusIcon className={cn("h-4 w-4 relative z-10", s.color, isPulsing && "animate-spin")} />
          <span className="absolute -top-1.5 -left-1 text-[9px] font-black text-muted-foreground">{stop.order}</span>
        </div>
        {!isLast && <div className={cn("w-0.5 flex-1 mt-1", stop.status === "Completed" ? "bg-emerald-500/30" : "bg-border")} />}
      </div>

      {/* Content */}
      <div className={cn("flex-1 pb-5 min-w-0", isLast && "pb-0")}>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
          <div>
            <p className="text-xs font-bold text-foreground">{stop.customerName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">{stop.location}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{stop.plannedTime}</span>
            </div>
            {stop.actualTime && (
              <span className="text-[10px] font-semibold text-emerald-600">→ {stop.actualTime}</span>
            )}
            <span className={cn("text-[10px] font-black rounded-full border px-1.5 py-0.5",
              stop.status === "Completed" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/25" :
              stop.status === "In Progress" ? "bg-blue-500/15 text-blue-600 border-blue-500/25" :
              "bg-muted/40 text-muted-foreground border-border")}>
              {s.label}
            </span>
          </div>
        </div>
        <div className="flex items-start gap-1.5 rounded-lg bg-muted/30 border border-border px-3 py-2">
          <Flag className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">{stop.objective}</p>
        </div>
      </div>
    </div>
  );
}

function RouteTimelineSection() {
  const completed = ROUTE_TIMELINE.filter(s => s.status === "Completed").length;
  const inProgress = ROUTE_TIMELINE.filter(s => s.status === "In Progress").length;
  const planned = ROUTE_TIMELINE.filter(s => s.status === "Planned").length;

  return (
    <Card>
      <SectionHeader icon={Clock} iconColor="text-blue-500" title="Route Timeline"
        right={
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="text-muted-foreground">{completed} done</span></span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" /><span className="text-muted-foreground">{inProgress} active</span></span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /><span className="text-muted-foreground">{planned} remaining</span></span>
          </div>
        } />
      <div className="p-5">
        {ROUTE_TIMELINE.map((stop, i) => (
          <TimelineStopRow key={stop.order} stop={stop} isLast={i === ROUTE_TIMELINE.length - 1} />
        ))}
      </div>
    </Card>
  );
}

// ── Section 7: Intelligence Engines ───────────────────────────────────────
function EngineCard({ engine }: { engine: IntelligenceEngine }) {
  const Icon = ENGINE_ICONS[engine.icon] ?? RefreshCw;
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="h-9 w-9 rounded-xl bg-muted/50 border border-border flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <span className="text-[10px] font-semibold rounded-full border border-border bg-muted/40 text-muted-foreground px-2 py-0.5">Pending</span>
      </div>
      <div>
        <p className="text-xs font-bold text-foreground mb-1">{engine.name}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{engine.description}</p>
      </div>
      <div className="rounded-lg bg-muted/30 border border-border px-3 py-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Will contribute</p>
        <p className="text-[11px] font-semibold text-foreground">{engine.contributes}</p>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-muted/20 border border-dashed border-border px-3 py-2 mt-auto">
        <RefreshCw className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground">Awaiting engine connection</p>
      </div>
    </div>
  );
}

function IntelligenceEnginesSection() {
  return (
    <Card>
      <SectionHeader icon={Satellite} iconColor="text-violet-500" title="Intelligence Engines"
        right={
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            {INTELLIGENCE_ENGINES.length} engines pending
          </span>
        } />
      <div className="p-5">
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 mb-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Route 360 is designed to aggregate insights from multiple intelligence engines. When connected, each engine will automatically populate its reserved section with real-time data.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {INTELLIGENCE_ENGINES.map(e => <EngineCard key={e.id} engine={e} />)}
        </div>
      </div>
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Route360() {
  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-base font-black text-foreground">Route 360</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Operational intelligence dashboard for a single sales route</p>
      </div>

      <RouteSummary />
      <RouteKPIsSection />
      <CustomerDistributionSection />
      <ProductPerformanceSection />
      <RouteAlertsSection />
      <RouteTimelineSection />
      <IntelligenceEnginesSection />
    </div>
  );
}
