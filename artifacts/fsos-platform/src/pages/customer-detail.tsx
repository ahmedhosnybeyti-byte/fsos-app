import { useState } from "react";
import { Link } from "wouter";
import { useParams } from "wouter";
import {
  ArrowLeft, MapPin, Phone, Star, TrendingUp, TrendingDown,
  ShoppingCart, Package, CreditCard, Clock, CheckCircle2,
  XCircle, Circle, ChevronDown, ChevronUp, AlertTriangle,
  Zap, Repeat2, BarChart2, FileText, Play, Bot,
  Minus, Building2,
} from "lucide-react";
import { getCustomerDetail, type CustomerDetailData, type VisitRecord } from "@/data/customer-detail-mock";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────
const RISK_STYLE: Record<string, string> = {
  Critical: "bg-rose-500/15 text-rose-700 border-rose-500/25",
  High:     "bg-red-500/15 text-red-700 border-red-500/25",
  Medium:   "bg-amber-500/15 text-amber-700 border-amber-500/25",
  Low:      "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",
};

const CLS_STYLE: Record<string, string> = {
  A: "bg-amber-500/20 text-amber-700 border-amber-500/30",
  B: "bg-blue-500/15 text-blue-600 border-blue-500/25",
  C: "bg-muted text-muted-foreground border-border",
};

const RECO_STYLE = {
  increase: { bg: "bg-violet-500/8 border-violet-500/20", icon: TrendingUp,  ic: "text-violet-600", badge: "bg-violet-500/15 text-violet-700 border-violet-500/25", num: "bg-violet-500" },
  recover:  { bg: "bg-red-500/8 border-red-500/20",       icon: Package,     ic: "text-red-600",    badge: "bg-red-500/15 text-red-700 border-red-500/25",           num: "bg-red-500"    },
  offer:    { bg: "bg-emerald-500/8 border-emerald-500/20",icon: Zap,         ic: "text-emerald-600",badge: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",num: "bg-emerald-500"},
  collect:  { bg: "bg-amber-500/8 border-amber-500/20",   icon: CreditCard,  ic: "text-amber-600",  badge: "bg-amber-500/15 text-amber-700 border-amber-500/25",     num: "bg-amber-500"  },
};

const PRIORITY_CHIP: Record<string, string> = {
  Critical: "bg-rose-500/15 text-rose-700 border-rose-500/25",
  High:     "bg-amber-500/15 text-amber-700 border-amber-500/25",
  Medium:   "bg-blue-500/15 text-blue-600 border-blue-500/25",
  Low:      "bg-emerald-500/15 text-emerald-700 border-emerald-500/25",
};

const LOST_BADGE: Record<string, string> = {
  "OOS":        "bg-red-500/10 text-red-700 border-red-500/25",
  "Not Listed": "bg-amber-500/10 text-amber-700 border-amber-500/25",
  "Delisted":   "bg-rose-500/10 text-rose-700 border-rose-500/25",
  "Competitor": "bg-orange-500/10 text-orange-700 border-orange-500/25",
};

// ── Small primitives ───────────────────────────────────────────────────────
function Chip({ label, className }: { label: string; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", className)}>{label}</span>;
}

function Trend({ value }: { value: number }) {
  if (value === 0) return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
  return value > 0
    ? <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600"><TrendingUp className="h-3 w-3" />+{value}%</span>
    : <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500"><TrendingDown className="h-3 w-3" />{value}%</span>;
}

function SectionHeader({ icon: Icon, title, sub }: { icon: React.ComponentType<{ className?: string }>; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/20">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {sub && <span className="ml-auto text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── 1. Customer Header ─────────────────────────────────────────────────────
function CustomerHeader({ c }: { c: CustomerDetailData }) {
  const mtdPct = Math.round((c.mtdRevenue / c.targetMtd) * 100);
  const creditPct = c.creditLimit > 0 ? Math.round((c.outstandingBalance / c.creditLimit) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Top row */}
      <div className="p-5 flex flex-col sm:flex-row gap-4">
        {/* Avatar + Identity */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-foreground">{c.name}</h1>
              <Chip label={`Class ${c.classification}`} className={cn("gap-0.5", CLS_STYLE[c.classification])}>
                <Star className="h-2.5 w-2.5 mr-0.5" />
              </Chip>
              <Chip label={c.riskLevel === "Low" ? "Low Risk" : `${c.riskLevel} Risk`} className={RISK_STYLE[c.riskLevel]} />
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{c.code} · {c.type}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{c.address}</span>
            </div>
          </div>
        </div>

        {/* Buyer + CTA */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Buyer</p>
            <p className="text-sm font-semibold text-foreground">{c.buyerName}</p>
            <p className="text-xs text-muted-foreground">{c.buyerPhone}</p>
          </div>
          <button className="h-9 w-9 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Phone className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Metadata strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border border-t border-border">
        {[
          { label: "Territory",    value: c.territory },
          { label: "Route",        value: c.route },
          { label: "Last Visit",   value: c.lastVisit },
          { label: "Last Invoice", value: `${c.lastInvoice.ref} · ${c.lastInvoice.date}` },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-xs font-semibold text-foreground mt-0.5 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Outstanding balance bar */}
      {c.outstandingBalance > 0 && (
        <div className="flex items-center gap-4 px-5 py-3 border-t border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-amber-700">Outstanding Balance — 18 days overdue</p>
              <p className="text-sm font-black text-amber-700">AED {c.outstandingBalance.toLocaleString()}</p>
            </div>
            <div className="h-1.5 rounded-full bg-amber-500/20 overflow-hidden">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${creditPct}%` }} />
            </div>
            <p className="text-[10px] text-amber-600 mt-0.5">{creditPct}% of AED {c.creditLimit.toLocaleString()} credit limit used</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 2. Action Bar ──────────────────────────────────────────────────────────
function ActionBar() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/20">
        <Play className="h-4 w-4" /> Start Visit
      </button>
      <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-accent transition-colors">
        <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Generate Order
      </button>
      <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-accent transition-colors">
        <Bot className="h-4 w-4 text-muted-foreground" /> AI Analysis
      </button>
      <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-accent transition-colors">
        <FileText className="h-4 w-4 text-muted-foreground" /> Full History
      </button>
    </div>
  );
}

// ── 3. Performance Cards ───────────────────────────────────────────────────
function PerformanceCards({ c }: { c: CustomerDetailData }) {
  const mtdPct  = Math.round((c.mtdRevenue / c.targetMtd) * 100);
  const momChange = c.salesLastMonth > 0 ? Math.round(((c.mtdRevenue - c.salesLastMonth) / c.salesLastMonth) * 100) : 0;

  const cards = [
    {
      label: "Sales MTD",
      value: `AED ${(c.mtdRevenue / 1000).toFixed(0)}k`,
      sub: `${mtdPct}% of AED ${(c.targetMtd / 1000).toFixed(0)}k target`,
      bar: mtdPct,
      barColor: mtdPct >= 100 ? "bg-emerald-500" : "bg-primary",
      trend: null,
    },
    {
      label: "vs. Last Month",
      value: `${momChange > 0 ? "+" : ""}${momChange}%`,
      sub: `AED ${(c.salesLastMonth / 1000).toFixed(0)}k last month`,
      bar: null, trend: momChange,
      valueColor: momChange > 0 ? "text-emerald-600" : momChange < 0 ? "text-red-500" : "text-foreground",
    },
    {
      label: "Orders MTD",
      value: String(c.ordersCount),
      sub: "visit orders this month",
      bar: null, trend: null,
    },
    {
      label: "Average Order",
      value: `AED ${(c.avgOrder / 1000).toFixed(1)}k`,
      sub: "per visit",
      bar: null, trend: null,
    },
    {
      label: "Collection %",
      value: `${c.collectionPct}%`,
      sub: c.outstandingBalance > 0 ? `AED ${c.outstandingBalance.toLocaleString()} pending` : "Fully collected",
      bar: c.collectionPct,
      barColor: c.collectionPct >= 95 ? "bg-emerald-500" : c.collectionPct >= 80 ? "bg-amber-500" : "bg-red-500",
      trend: null,
    },
    {
      label: "Last Payment",
      value: `AED ${(c.lastPayment.amount / 1000).toFixed(0)}k`,
      sub: c.lastPayment.date,
      bar: null, trend: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{card.label}</p>
          <p className={cn("text-lg font-black", card.valueColor ?? "text-foreground")}>{card.value}</p>
          {card.trend !== null && (
            <div className="mt-0.5"><Trend value={card.trend!} /></div>
          )}
          {card.bar !== null && (
            <div className="mt-2 mb-1 h-1 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full", card.barColor)} style={{ width: `${Math.min(card.bar!, 100)}%` }} />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── 4. Product Intelligence ────────────────────────────────────────────────
type ProductTab = "top" | "lost" | "crosssell";

function ProductIntelligence({ c }: { c: CustomerDetailData }) {
  const [tab, setTab] = useState<ProductTab>("top");

  const tabs: { id: ProductTab; label: string; count: number }[] = [
    { id: "top",      label: "Top Selling Products", count: c.topProducts.length   },
    { id: "lost",     label: "Lost Sales",           count: c.lostProducts.length  },
    { id: "crosssell",label: "Cross-Sell Opp.",      count: c.crossSell.length     },
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <SectionHeader icon={BarChart2} title="Product Intelligence" />

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors",
              tab === t.id
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              tab === t.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            )}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Tab: Top Selling */}
      {tab === "top" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-left">
                <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8">#</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Units Sold</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Revenue MTD</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Trend</th>
              </tr>
            </thead>
            <tbody>
              {c.topProducts.map((p) => (
                <tr key={p.sku} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                      p.rank === 1 ? "bg-amber-500/20 text-amber-700" :
                      p.rank === 2 ? "bg-slate-400/20 text-slate-600" :
                      p.rank === 3 ? "bg-orange-500/20 text-orange-700" : "bg-muted text-muted-foreground"
                    )}>{p.rank}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{p.sku}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.category}</td>
                  <td className="px-4 py-3 text-right text-xs text-foreground font-semibold">{p.unitsSold} {p.unit}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-foreground">AED {p.revenue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right"><Trend value={p.trend} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Lost Sales */}
      {tab === "lost" && (
        <div className="divide-y divide-border">
          {c.lostProducts.map((p) => (
            <div key={p.sku} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                <TrendingDown className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <Chip label={p.reason} className={LOST_BADGE[p.reason]} />
                  {p.daysMissing && <Chip label={`${p.daysMissing} days`} className="bg-muted text-muted-foreground border-border" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.category} · {p.detail}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-red-600">−AED {p.estLoss.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">est. loss</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-5 py-3 bg-muted/20">
            <p className="text-xs text-muted-foreground font-semibold">Total estimated monthly loss</p>
            <p className="text-sm font-black text-red-600">−AED {c.lostProducts.reduce((s, p) => s + p.estLoss, 0).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Tab: Cross-Sell */}
      {tab === "crosssell" && (
        <div className="divide-y divide-border">
          {c.crossSell.map((p) => (
            <div key={p.sku} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <Chip label={`${p.category}`} className="bg-muted text-muted-foreground border-border" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.detail}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-muted-foreground">Basket affinity</span>
                  <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${p.affinity}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-violet-600">{p.affinity}%</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-violet-600">AED {p.opportunity.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">opportunity</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-5 py-3 bg-muted/20">
            <p className="text-xs text-muted-foreground font-semibold">Total cross-sell opportunity</p>
            <p className="text-sm font-black text-violet-600">AED {c.crossSell.reduce((s, p) => s + p.opportunity, 0).toLocaleString()}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5. AI Recommendations ──────────────────────────────────────────────────
function AIRecommendations({ c }: { c: CustomerDetailData }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <SectionHeader icon={Bot} title="AI Recommendations" sub={`${c.aiRecommendations.length} active`} />
      <div className="p-4 grid sm:grid-cols-2 gap-3">
        {c.aiRecommendations.map((r) => {
          const style = RECO_STYLE[r.type];
          const Icon  = style.icon;
          return (
            <div key={r.id} className={cn("rounded-xl border p-4 flex flex-col gap-3", style.bg)}>
              <div className="flex items-start justify-between gap-2">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", style.bg)}>
                  <Icon className={cn("h-4 w-4", style.ic)} />
                </div>
                <Chip label={r.priority} className={PRIORITY_CHIP[r.priority]} />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.subtitle}</p>
                <p className="text-xs text-foreground/80 mt-2 leading-relaxed">{r.detail}</p>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <p className={cn("text-xs font-bold", style.ic)}>{r.impact}</p>
                <button className={cn("text-[11px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-70", style.ic)}>
                  {r.actionLabel} <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 6. Visit Timeline ──────────────────────────────────────────────────────
const STATUS_ICON = {
  Completed: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />,
  Missed:    <XCircle      className="h-4 w-4 text-red-500 shrink-0" />,
  Cancelled: <Circle       className="h-4 w-4 text-muted-foreground shrink-0" />,
};

const TYPE_CHIP: Record<string, string> = {
  Order:       "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Collection:  "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Promotional: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  Survey:      "bg-teal-500/10 text-teal-600 border-teal-500/20",
  Standard:    "bg-muted text-muted-foreground border-border",
};

function VisitItem({ v, isLast }: { v: VisitRecord; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-3 px-5 py-3.5">
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        {STATUS_ICON[v.status]}
        {!isLast && <div className="w-px flex-1 min-h-[20px] bg-border" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-foreground">{v.date}</span>
            <span className="text-[10px] text-muted-foreground">{v.time}</span>
            <Chip label={v.type} className={cn("text-[10px]", TYPE_CHIP[v.type])} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {v.orderValue && <span className="text-xs font-black text-emerald-600">AED {v.orderValue.toLocaleString()}</span>}
            {v.duration && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />{v.duration}</span>}
            <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground transition-colors">
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{v.outcome}</p>
        {open && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs text-muted-foreground leading-relaxed">{v.outcome}</p>
            {v.note && (
              <div className="flex items-start gap-1.5 rounded-md bg-amber-500/5 border border-amber-500/15 px-2.5 py-1.5">
                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">{v.note}</p>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Rep: {v.rep}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function VisitTimeline({ c }: { c: CustomerDetailData }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <SectionHeader icon={Clock} title="Visit Timeline" sub={`${c.visits.length} visits recorded`} />
      <div className="divide-y divide-border">
        {c.visits.map((v, i) => <VisitItem key={v.id} v={v} isLast={i === c.visits.length - 1} />)}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const c = getCustomerDetail(Number(id));

  if (!c) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <p className="text-muted-foreground text-sm">Customer not found.</p>
        <Link href="/customers" className="text-primary text-sm underline">← Back to Customer 360</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Customer 360
      </Link>

      <CustomerHeader c={c} />
      <ActionBar />
      <PerformanceCards c={c} />
      <ProductIntelligence c={c} />
      <AIRecommendations c={c} />
      <VisitTimeline c={c} />
    </div>
  );
}
