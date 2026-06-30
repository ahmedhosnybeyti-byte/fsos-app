import {
  Truck, Package, BarChart2, TrendingDown, Zap, Building2,
  Satellite, Calendar, Crosshair, RefreshCw, ChevronDown,
  ChevronUp, Star, Target, Flag, AlertTriangle, CheckCircle2,
  CircleDot, Info, Layers,
} from "lucide-react";
import { useState } from "react";
import {
  MISSION_SNAPSHOT, VEHICLE_STATUS, RECOMMENDED_ITEMS,
  PRODUCT_FOCUS, INTELLIGENCE_ENGINES,
  type RecommendedItem, type LoadPriority, type IntelligenceEngine,
} from "@/data/loading-intelligence-mock";
import { cn } from "@/lib/utils";

// ── Design tokens ──────────────────────────────────────────────────────────
const PRIORITY_BADGE: Record<LoadPriority, string> = {
  Critical: "bg-rose-500/15 text-rose-700 border-rose-500/25",
  High:     "bg-amber-500/15 text-amber-700 border-amber-500/25",
  Medium:   "bg-blue-500/15 text-blue-600 border-blue-500/25",
  Low:      "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",
};
const PRIORITY_LEFT: Record<LoadPriority, string> = {
  Critical: "border-l-rose-500",
  High:     "border-l-amber-500",
  Medium:   "border-l-blue-500",
  Low:      "border-l-emerald-500",
};
const PRIORITY_DOT: Record<LoadPriority, string> = {
  Critical: "bg-rose-500",
  High:     "bg-amber-500",
  Medium:   "bg-blue-500",
  Low:      "bg-emerald-500",
};
const PRIORITY_ICON_COLOR: Record<LoadPriority, string> = {
  Critical: "text-rose-500",
  High:     "text-amber-500",
  Medium:   "text-blue-500",
  Low:      "text-emerald-500",
};
const PRIORITY_ORDER: LoadPriority[] = ["Critical", "High", "Medium", "Low"];

const ENGINE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart2, TrendingDown, Zap, Building2, Satellite, Crosshair, Calendar,
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

function PriorityBadge({ level }: { level: LoadPriority }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black", PRIORITY_BADGE[level])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[level])} />
      {level}
    </span>
  );
}

function PlaceholderPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
      <RefreshCw className="h-2.5 w-2.5" /> {label}
    </span>
  );
}

// ── Section 1: Mission Snapshot ────────────────────────────────────────────
function MissionSnapshot() {
  const m = MISSION_SNAPSHOT;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/15">
        <div>
          <p className="text-sm font-bold text-foreground">Loading Intelligence</p>
          <p className="text-xs text-muted-foreground">{m.date}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold text-amber-600">Awaiting Engines</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border">
        {[
          { label: "Planned Visits",    value: String(m.plannedVisits),              icon: Target,   color: "text-primary"     },
          { label: "Planned Customers", value: String(m.plannedCustomers.length),    icon: Star,     color: "text-blue-500"    },
          { label: "Sales Target",      value: `AED ${(m.salesTarget/1000).toFixed(0)}k`,     icon: TrendingDown, color: "text-emerald-500" },
          { label: "Collection Target", value: `AED ${(m.collectionTarget/1000).toFixed(0)}k`, icon: Flag,     color: "text-amber-500"   },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="px-4 py-4">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Icon className={cn("h-3.5 w-3.5", color)} />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            </div>
            <p className="text-2xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Customer list */}
      <div className="px-5 py-3 border-t border-border bg-muted/10">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Today's Customers</p>
        <div className="flex flex-wrap gap-2">
          {m.plannedCustomers.map((c, i) => (
            <span key={c} className="flex items-center gap-1.5 rounded-full bg-muted/60 border border-border px-2.5 py-1 text-xs text-foreground">
              <span className="h-4 w-4 rounded-full bg-primary/15 text-primary text-[9px] font-black flex items-center justify-center">{i + 1}</span>
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Section 2: Vehicle Status ──────────────────────────────────────────────
function VehicleStatusSection() {
  const v = VEHICLE_STATUS;
  const isEmpty = v.currentItems.length === 0;

  return (
    <SectionWrapper icon={Truck} iconColor="text-blue-500" title="Vehicle Status" sub={v.plate}>
      <div className="grid sm:grid-cols-3 gap-4">
        {/* Vehicle info */}
        <div className="sm:col-span-1 space-y-3">
          {[
            { label: "Vehicle ID",    value: v.id    },
            { label: "Plate",         value: v.plate },
            { label: "Type",          value: v.type  },
            { label: "Max Capacity",  value: `${v.capacityKg.toLocaleString()} kg / ${v.capacityM3} m³` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xs font-semibold text-foreground text-right">{value}</p>
            </div>
          ))}
        </div>

        {/* Capacity blocks */}
        <div className="sm:col-span-2 grid grid-cols-3 gap-3">
          {[
            { label: "Vehicle Capacity", value: `${v.capacityKg.toLocaleString()} kg`, sub: `${v.capacityM3} m³ volume`, color: "text-foreground", bg: "bg-muted/30 border-border" },
            { label: "Current Load",     value: isEmpty ? "Empty" : `${v.currentLoadKg} kg`, sub: isEmpty ? "Not yet loaded" : `${v.currentLoadM3} m³`, color: isEmpty ? "text-muted-foreground" : "text-foreground", bg: "bg-muted/30 border-border" },
            { label: "Remaining",        value: "—", sub: "Pending plan", color: "text-muted-foreground", bg: "bg-muted/20 border-dashed border-border" },
          ].map(({ label, value, sub, color, bg }) => (
            <div key={label} className={cn("rounded-xl border px-3 py-3 flex flex-col gap-1", bg)}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className={cn("text-lg font-black", color)}>{value}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Current items */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Current Loaded Items</p>
        {isEmpty ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5">
            <Package className="h-5 w-5 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Vehicle is empty</p>
              <p className="text-xs text-muted-foreground">Load the vehicle using the recommended loading plan below.</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Items loaded would appear here.</p>
        )}
      </div>
    </SectionWrapper>
  );
}

// ── Section 3: Recommended Loading Table ───────────────────────────────────
function RecommendedLoadingTable() {
  const [sortPriority, setSortPriority] = useState(true);
  const items = sortPriority
    ? [...RECOMMENDED_ITEMS].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority))
    : RECOMMENDED_ITEMS;

  return (
    <SectionWrapper icon={Layers} iconColor="text-violet-500" title="Recommended Loading"
      headerRight={
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{RECOMMENDED_ITEMS.length} SKUs</span>
          <button onClick={() => setSortPriority(s => !s)}
            className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
            Sort: {sortPriority ? "Priority" : "Default"}
          </button>
        </div>
      }>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-border bg-muted/20 text-left">
              {["SKU", "Product Name", "Category", "Van Stock", "Load Qty", "Priority", "Reason"].map(h => (
                <th key={h} className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sku} className="border-b border-border last:border-0 hover:bg-muted/15 transition-colors">
                <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{item.sku}</td>
                <td className="px-3 py-3">
                  <p className="text-xs font-semibold text-foreground">{item.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.engineSources.map(s => <PlaceholderPill key={s} label={s} />)}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{item.category}</td>
                <td className="px-3 py-3 text-center">
                  <span className="inline-block rounded-md bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {item.currentVanQty} {item.unit}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="inline-block rounded-md bg-primary/10 text-primary font-black text-xs px-2 py-0.5">
                    {item.recommendedQty} {item.unit}
                  </span>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <PriorityBadge level={item.priority} />
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground max-w-[200px] leading-relaxed">{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionWrapper>
  );
}

// ── Section 4: Loading Priority groups ────────────────────────────────────
function PriorityGroup({ level, items }: { level: LoadPriority; items: RecommendedItem[] }) {
  const [open, setOpen] = useState(level === "Critical" || level === "High");
  if (items.length === 0) return null;

  return (
    <div className={cn("rounded-xl border-l-4 border border-border bg-card overflow-hidden", PRIORITY_LEFT[level])}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left">
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", PRIORITY_DOT[level])} />
        <p className="text-sm font-bold text-foreground flex-1">{level} Priority</p>
        <span className={cn("text-[10px] font-black rounded-full border px-2 py-0.5", PRIORITY_BADGE[level])}>{items.length} SKUs</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {items.map((item) => (
            <div key={item.sku} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/15 transition-colors">
              <Package className={cn("h-4 w-4 shrink-0", PRIORITY_ICON_COLOR[level])} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">{item.category} · {item.sku}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-foreground">{item.recommendedQty}</p>
                <p className="text-[10px] text-muted-foreground">{item.unit}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingPrioritySection() {
  const grouped = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = RECOMMENDED_ITEMS.filter(i => i.priority === p);
    return acc;
  }, {} as Record<LoadPriority, RecommendedItem[]>);

  return (
    <div className="space-y-3">
      <SectionTitle icon={AlertTriangle} iconColor="text-amber-500" title="Loading Priority"
        sub={`${RECOMMENDED_ITEMS.length} total SKUs`} />
      {PRIORITY_ORDER.map(level => (
        <PriorityGroup key={level} level={level} items={grouped[level]} />
      ))}
    </div>
  );
}

// ── Section 5: Product Focus ───────────────────────────────────────────────
function ProductFocusSection() {
  return (
    <SectionWrapper icon={Target} iconColor="text-primary" title="Product Focus"
      headerRight={<span className="text-xs text-muted-foreground">{PRODUCT_FOCUS.length} priority products</span>}>
      <div className="grid sm:grid-cols-3 gap-3">
        {PRODUCT_FOCUS.map((p) => (
          <div key={p.sku} className={cn("rounded-xl border-l-4 border border-border bg-card p-4", PRIORITY_LEFT[p.priority])}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                p.priority === "Critical" ? "bg-rose-500/10" : p.priority === "High" ? "bg-amber-500/10" : "bg-blue-500/10"
              )}>
                <Star className={cn("h-4 w-4", PRIORITY_ICON_COLOR[p.priority])} />
              </div>
              <PriorityBadge level={p.priority} />
            </div>
            <p className="text-sm font-bold text-foreground mb-0.5">{p.name}</p>
            <p className="text-[10px] text-muted-foreground mb-2">{p.category} · {p.sku}</p>
            <p className="text-xs text-foreground/80 leading-relaxed">{p.context}</p>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}

// ── Section 6: Intelligence Engine Placeholders ────────────────────────────
function EngineCard({ engine }: { engine: IntelligenceEngine }) {
  const Icon = ENGINE_ICON_MAP[engine.icon] ?? RefreshCw;
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
      <div className="flex items-center gap-2 rounded-lg bg-muted/20 border border-dashed border-border px-3 py-2">
        <RefreshCw className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground">Awaiting engine connection</p>
      </div>
    </div>
  );
}

function IntelligenceEnginesSection() {
  return (
    <SectionWrapper icon={CircleDot} iconColor="text-violet-500" title="Intelligence Engines"
      headerRight={
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-600">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          {INTELLIGENCE_ENGINES.length} engines pending
        </span>
      }>
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 mb-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          The loading recommendations above are placeholder data. When the engines below are connected, they will automatically generate, rank, and explain each loading recommendation in real time.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {INTELLIGENCE_ENGINES.map((e) => <EngineCard key={e.id} engine={e} />)}
      </div>
    </SectionWrapper>
  );
}

// ── Shared section wrapper ─────────────────────────────────────────────────
function SectionWrapper({ icon: Icon, iconColor = "text-muted-foreground", title, headerRight, children }: {
  icon: React.ComponentType<{ className?: string }>; iconColor?: string;
  title: string; headerRight?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/15">
        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {headerRight && <div className="ml-auto">{headerRight}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function LoadingIntelligence() {
  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-base font-black text-foreground">Loading Intelligence</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Prepare your vehicle for today's mission</p>
      </div>

      <MissionSnapshot />
      <VehicleStatusSection />
      <RecommendedLoadingTable />
      <LoadingPrioritySection />
      <ProductFocusSection />
      <IntelligenceEnginesSection />
    </div>
  );
}
