import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, Play, ShoppingCart, Bot, FileText,
  Zap, CreditCard, TrendingDown, TrendingUp, MapPin,
  Users, Target, Lightbulb, AlertTriangle, CheckCircle2,
  XCircle, Circle, Clock, ChevronDown, ChevronUp,
  ChevronRight, Star, Building2, Phone, Navigation,
  Package, Repeat2, MessageSquare, ReceiptText,
} from "lucide-react";
import { getCustomerDetail, type CustomerDetailData } from "@/data/customer-detail-mock";
import { cn } from "@/lib/utils";

// ── Shared primitives ──────────────────────────────────────────────────────
const PRIORITY_BORDER = { Critical: "border-l-rose-500",  High: "border-l-amber-500", Medium: "border-l-blue-500",   Low: "border-l-emerald-500" };
const PRIORITY_BG    = { Critical: "bg-rose-500/6",       High: "bg-amber-500/6",     Medium: "bg-blue-500/6",       Low: "bg-emerald-500/6"    };
const PRIORITY_BADGE = { Critical: "bg-rose-500/15 text-rose-700 border-rose-500/25", High: "bg-amber-500/15 text-amber-700 border-amber-500/25", Medium: "bg-blue-500/15 text-blue-600 border-blue-500/25", Low: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25" };
const PRIORITY_ICON  = { Critical: "text-rose-500", High: "text-amber-500", Medium: "text-blue-500", Low: "text-emerald-500" };

function PriorityBadge({ level }: { level: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", PRIORITY_BADGE[level as keyof typeof PRIORITY_BADGE])}>{level}</span>;
}

function SectionCard({ title, icon: Icon, iconColor = "text-muted-foreground", children, headerRight, noPad = false }: {
  title: string; icon: React.ComponentType<{ className?: string }>; iconColor?: string;
  children: React.ReactNode; headerRight?: React.ReactNode; noPad?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/15">
        <Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {headerRight && <div className="ml-auto">{headerRight}</div>}
      </div>
      <div className={noPad ? "" : "p-5"}>{children}</div>
    </div>
  );
}

function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  const color = value >= 85 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className={cn("flex-1 h-1.5 rounded-full bg-muted overflow-hidden", className)}>
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("text-[10px] font-bold w-7 text-right", value >= 85 ? "text-emerald-600" : value >= 70 ? "text-amber-600" : "text-red-500")}>{value}%</span>
    </div>
  );
}

// ── 1. Identity strip ──────────────────────────────────────────────────────
function IdentityStrip({ c }: { c: CustomerDetailData }) {
  const CLS: Record<string, string> = { A: "bg-amber-500/20 text-amber-700 border-amber-500/30", B: "bg-blue-500/15 text-blue-600 border-blue-500/25", C: "bg-muted text-muted-foreground border-border" };
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Building2 className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base font-black text-foreground truncate">{c.info.name}</h1>
          <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-black", CLS[c.info.classification])}>
            <Star className="h-2.5 w-2.5" /> Class {c.info.classification}
          </span>
          <span className="text-xs font-mono text-muted-foreground">{c.info.code}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{c.info.type} · {c.info.territory} · {c.info.lastVisit}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-md shadow-primary/20">
          <Play className="h-3.5 w-3.5" /> Start Visit
        </button>
        <button className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <ShoppingCart className="h-4 w-4" />
        </button>
        <button className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
          <Bot className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Section 1: TODAY'S DECISION ────────────────────────────────────────────
function TodayDecision({ c }: { c: CustomerDetailData }) {
  const d = c.todayDecision;
  return (
    <div className={cn("rounded-xl border-l-4 border border-border overflow-hidden", PRIORITY_BORDER[d.priority], PRIORITY_BG[d.priority])}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("h-8 w-8 rounded-lg bg-card/80 flex items-center justify-center shrink-0")}>
              <Zap className={cn("h-4 w-4", PRIORITY_ICON[d.priority])} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Today's Decision</p>
              <p className="text-sm text-muted-foreground">Most critical action for this visit</p>
            </div>
          </div>
          <PriorityBadge level={d.priority} />
        </div>

        <p className="text-xl font-black text-foreground leading-snug mb-3">{d.title}</p>
        <p className="text-sm text-foreground/80 leading-relaxed mb-2">{d.detail}</p>

        <div className="flex items-start gap-2 rounded-lg bg-background/60 border border-border px-3 py-2.5 mb-4">
          <Lightbulb className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">{d.context}</p>
        </div>

        <div className="flex items-center gap-2">
          <button className={cn("px-4 py-2 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90",
            d.priority === "Critical" ? "bg-rose-500" : d.priority === "High" ? "bg-amber-500" : "bg-blue-500"
          )}>{d.primaryAction}</button>
          {d.secondaryAction && (
            <button className="px-4 py-2 rounded-lg border border-border bg-background text-sm font-semibold text-foreground hover:bg-accent transition-colors">
              {d.secondaryAction}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section 2: Sales Opportunity ───────────────────────────────────────────
function SalesOpportunity({ c }: { c: CustomerDetailData }) {
  const s = c.salesOpportunity;
  return (
    <SectionCard title="Sales Opportunity" icon={ShoppingCart} iconColor="text-emerald-500"
      headerRight={
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Expected Order</p>
            <p className="text-sm font-black text-foreground">AED {(s.expectedMin/1000).toFixed(0)}k–{(s.expectedMax/1000).toFixed(0)}k</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Probability</p>
            <p className="text-sm font-black text-emerald-600">{s.probability}%</p>
          </div>
        </div>
      }>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
              <th className="pb-2 px-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Rec. Qty</th>
              <th className="pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reason</th>
              <th className="pb-2 pl-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {s.products.map((p) => (
              <tr key={p.sku} className="hover:bg-muted/20 transition-colors">
                <td className="py-2.5 pr-4">
                  <p className="font-semibold text-foreground text-xs">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{p.sku}</p>
                </td>
                <td className="py-2.5 px-4 text-center">
                  <span className="inline-block bg-primary/10 text-primary font-black text-xs px-2 py-0.5 rounded-md">{p.recQty} {p.unit}</span>
                </td>
                <td className="py-2.5 pr-4 text-xs text-muted-foreground leading-relaxed max-w-xs">{p.reason}</td>
                <td className="py-2.5 pl-4 w-28"><ConfidenceBar value={p.confidence} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ── Section 3: Collection ──────────────────────────────────────────────────
function CollectionSection({ c }: { c: CustomerDetailData }) {
  const col = c.collection;
  const creditPct = col.creditLimit > 0 ? Math.round((col.outstanding / col.creditLimit) * 100) : 0;
  const clear = col.outstanding === 0;

  return (
    <SectionCard title="Collection" icon={CreditCard} iconColor={clear ? "text-emerald-500" : "text-amber-500"}>
      {clear ? (
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-700">Account Fully Settled</p>
            <p className="text-xs text-muted-foreground">Last payment: AED {col.lastPayment.amount.toLocaleString()} on {col.lastPayment.date}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Outstanding",       value: `AED ${col.outstanding.toLocaleString()}`,    color: "text-amber-600 font-black" },
              { label: "Days Past Due",     value: `${col.daysPastDue} days`,                    color: "text-red-600 font-bold" },
              { label: "Last Payment",      value: `AED ${col.lastPayment.amount.toLocaleString()}`, color: "text-foreground font-semibold" },
              { label: "Collection Priority",value: col.collectionPriority,                       color: col.collectionPriority === "Before Order" ? "text-red-600 font-bold" : "text-muted-foreground font-semibold" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-muted/40 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                <p className={cn("text-sm", color)}>{value}</p>
              </div>
            ))}
          </div>

          {/* Credit bar */}
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Credit limit usage</span>
              <span className="font-bold text-amber-600">{creditPct}% of AED {col.creditLimit.toLocaleString()}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${creditPct}%` }} />
            </div>
          </div>

          {/* Suggested phrase */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Suggested Collection Phrase</p>
            </div>
            <p className="text-sm text-foreground italic leading-relaxed">"{col.suggestedPhrase}"</p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Section 4: Lost Sales ──────────────────────────────────────────────────
const LOST_BADGE_STYLE: Record<string, string> = {
  "OOS":        "bg-red-500/10 text-red-700 border-red-500/25",
  "Not Listed": "bg-amber-500/10 text-amber-700 border-amber-500/25",
  "Delisted":   "bg-rose-500/10 text-rose-700 border-rose-500/25",
  "Competitor": "bg-orange-500/10 text-orange-700 border-orange-500/25",
};

function LostSalesSection({ c }: { c: CustomerDetailData }) {
  const total = c.lostSales.reduce((s, p) => s + p.estimatedLoss, 0);
  return (
    <SectionCard title="Lost Sales" icon={TrendingDown} iconColor="text-red-500"
      headerRight={<span className="text-sm font-black text-red-600">−AED {total.toLocaleString()}/mo est.</span>}
      noPad>
      <div className="divide-y divide-border">
        {c.lostSales.map((p) => (
          <div key={p.sku} className="px-5 py-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <TrendingDown className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-bold text-foreground">{p.name}</p>
                  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", LOST_BADGE_STYLE[p.reason])}>{p.reason}</span>
                  <span className="text-[10px] text-muted-foreground">{p.category} · {p.stoppedDate}</span>
                </div>
                <div className="flex items-start gap-1.5 mt-1.5 rounded-md bg-blue-500/5 border border-blue-500/15 px-3 py-2">
                  <Target className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 leading-relaxed">{p.recoveryRec}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-red-600">−AED {p.estimatedLoss.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">per month</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Section 5: Cross Sell ──────────────────────────────────────────────────
function CrossSellSection({ c }: { c: CustomerDetailData }) {
  const total = c.crossSell.reduce((s, p) => s + p.expectedValue, 0);
  return (
    <SectionCard title="Cross-Sell Opportunities" icon={Zap} iconColor="text-violet-500"
      headerRight={<span className="text-sm font-black text-violet-600">AED {total.toLocaleString()} potential</span>}
      noPad>
      <div className="divide-y divide-border">
        {c.crossSell.map((p) => (
          <div key={p.sku} className="px-5 py-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="h-4 w-4 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-bold text-foreground">{p.name}</p>
                  {p.neverPurchased && <span className="text-[10px] font-bold bg-violet-500/10 text-violet-700 border border-violet-500/25 rounded-full px-2 py-0.5">Never Purchased</span>}
                  <span className="text-[10px] text-muted-foreground">{p.category}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{p.reasonForRec}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Basket affinity</span>
                  <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${p.affinity}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-violet-600">{p.affinity}%</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-violet-600">AED {p.expectedValue.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">expected value</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Section 6: Geo Intelligence ────────────────────────────────────────────
function GeoIntelligence({ c }: { c: CustomerDetailData }) {
  const geo = c.geoIntelligence;
  return (
    <SectionCard title="Geo Intelligence" icon={MapPin} iconColor="text-blue-500">
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        {/* Nearby customers */}
        <div className="sm:col-span-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Users className="h-3 w-3" /> Nearby Successful Customers
          </p>
          <div className="space-y-2">
            {geo.nearbyCustomers.map((n) => (
              <div key={n.name} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{n.name}</p>
                  <p className="text-[10px] text-muted-foreground">{n.distance} · AED {(n.avgOrder/1000).toFixed(1)}k avg</p>
                </div>
                <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded",
                  n.classification === "A" ? "bg-amber-500/20 text-amber-700" : "bg-blue-500/15 text-blue-700"
                )}>{n.classification}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Best selling nearby */}
        <div className="sm:col-span-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Package className="h-3 w-3" /> Best Selling in This Area
          </p>
          <div className="space-y-2">
            {geo.bestSellingNearby.map((p, i) => (
              <div key={p.name} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.category} · {p.avgSales}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Area recommendation */}
        <div className="sm:col-span-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3" /> Area Recommendation
          </p>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-3 h-[calc(100%-28px)]">
            <p className="text-xs text-foreground leading-relaxed">{geo.areaRecommendation}</p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Section 7: Visit Strategy ──────────────────────────────────────────────
function VisitStrategy({ c }: { c: CustomerDetailData }) {
  const s = c.visitStrategy;
  const [showObjections, setShowObjections] = useState(false);

  return (
    <SectionCard title="Visit Strategy" icon={Target} iconColor="text-primary">
      <div className="space-y-5">
        {/* Greeting */}
        <div className="flex gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-black text-primary">1</div>
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Greeting</p>
            <p className="text-sm text-foreground leading-relaxed">{s.greeting}</p>
          </div>
        </div>

        {/* What to sell */}
        <div className="flex gap-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 text-xs font-black text-emerald-600">2</div>
          <div className="flex-1">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">What to Sell</p>
            <div className="space-y-2">
              {s.whatToSell.map((step) => (
                <div key={step.step} className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-bold text-foreground mb-1">{step.step}. {step.product}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.approach}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* What to ask */}
        <div className="flex gap-3">
          <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 text-xs font-black text-blue-600">3</div>
          <div className="flex-1">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">What to Ask</p>
            <ul className="space-y-1.5">
              {s.questionsToAsk.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="text-blue-500 mt-0.5 shrink-0">→</span>
                  <span className="leading-relaxed">{q}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Objections */}
        <div className="flex gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 text-xs font-black text-amber-600">4</div>
          <div className="flex-1">
            <button onClick={() => setShowObjections(o => !o)} className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 hover:text-foreground transition-colors">
              Objections to Expect ({s.objectionsToExpect.length})
              {showObjections ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showObjections && (
              <div className="space-y-2">
                {s.objectionsToExpect.map((o, i) => (
                  <div key={i} className="rounded-lg border border-amber-500/20 overflow-hidden">
                    <div className="flex items-start gap-2 bg-amber-500/8 px-3 py-2 border-b border-amber-500/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold text-amber-700">"{o.objection}"</p>
                    </div>
                    <div className="flex items-start gap-2 px-3 py-2">
                      <ChevronRight className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground leading-relaxed">{o.counter}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Closing advice */}
        <div className="flex gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-black text-primary">5</div>
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Closing Advice</p>
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
              <p className="text-sm text-foreground leading-relaxed">{s.closingAdvice}</p>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Section 8: History ─────────────────────────────────────────────────────
type HistoryTab = "visits" | "invoices" | "payments" | "returns";

const VISIT_STATUS_ICON = {
  Completed: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />,
  Missed:    <XCircle      className="h-4 w-4 text-red-500 shrink-0" />,
  Cancelled: <Circle       className="h-4 w-4 text-muted-foreground shrink-0" />,
};
const VISIT_TYPE_CHIP: Record<string, string> = {
  Order: "bg-blue-500/10 text-blue-600 border-blue-500/20", Collection: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Promotional: "bg-violet-500/10 text-violet-600 border-violet-500/20", Standard: "bg-muted text-muted-foreground border-border", Survey: "bg-teal-500/10 text-teal-600 border-teal-500/20",
};
const INV_STATUS: Record<string, string> = { Paid: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25", Outstanding: "bg-amber-500/10 text-amber-700 border-amber-500/25", Overdue: "bg-red-500/10 text-red-700 border-red-500/25" };

function HistorySection({ c }: { c: CustomerDetailData }) {
  const [tab, setTab] = useState<HistoryTab>("visits");
  const [openVisit, setOpenVisit] = useState<number | null>(null);

  const TABS: { id: HistoryTab; label: string; count: number }[] = [
    { id: "visits",   label: "Visits",   count: c.history.visits.length   },
    { id: "invoices", label: "Invoices", count: c.history.invoices.length  },
    { id: "payments", label: "Payments", count: c.history.payments.length  },
    { id: "returns",  label: "Returns",  count: c.history.returns.length   },
  ];

  return (
    <SectionCard title="History" icon={Clock} noPad>
      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors",
              tab === t.id ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}>
            {t.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", tab === t.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Visits */}
      {tab === "visits" && (
        <div className="divide-y divide-border">
          {c.history.visits.map((v) => (
            <div key={v.id} className="px-5 py-3 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-3">
                {VISIT_STATUS_ICON[v.status]}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-foreground">{v.date}</span>
                    <span className="text-[10px] text-muted-foreground">{v.time}</span>
                    <span className={cn("text-[10px] border rounded-full px-2 py-0.5 font-semibold", VISIT_TYPE_CHIP[v.type])}>{v.type}</span>
                    {v.orderValue && <span className="text-xs font-black text-emerald-600">AED {v.orderValue.toLocaleString()}</span>}
                    {v.duration && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />{v.duration}</span>}
                  </div>
                  {openVisit !== v.id && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{v.outcome}</p>}
                  {openVisit === v.id && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground leading-relaxed">{v.outcome}</p>
                      {v.note && <div className="flex gap-1.5 bg-amber-500/5 border border-amber-500/15 rounded-md px-2.5 py-1.5">
                        <Lightbulb className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">{v.note}</p>
                      </div>}
                      <p className="text-[10px] text-muted-foreground">Rep: {v.rep}</p>
                    </div>
                  )}
                </div>
                <button onClick={() => setOpenVisit(openVisit === v.id ? null : v.id)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  {openVisit === v.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invoices */}
      {tab === "invoices" && (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/20">
            {["Reference", "Date", "Amount", "Status"].map(h => <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {c.history.invoices.map((inv) => (
              <tr key={inv.ref} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 text-xs font-mono font-semibold text-foreground">{inv.ref}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{inv.date}</td>
                <td className="px-5 py-3 text-sm font-bold text-foreground">AED {inv.amount.toLocaleString()}</td>
                <td className="px-5 py-3"><span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", INV_STATUS[inv.status])}>{inv.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Payments */}
      {tab === "payments" && (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/20">
            {["Date", "Amount", "Method", "Reference"].map(h => <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {c.history.payments.map((p, i) => (
              <tr key={i} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 text-xs font-semibold text-foreground">{p.date}</td>
                <td className="px-5 py-3 text-sm font-black text-emerald-600">AED {p.amount.toLocaleString()}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{p.method}</td>
                <td className="px-5 py-3 text-xs font-mono text-muted-foreground">{p.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Returns */}
      {tab === "returns" && (
        c.history.returns.length === 0
          ? <div className="px-5 py-8 text-center text-sm text-muted-foreground">No returns recorded for this account.</div>
          : <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/20">
                {["Date", "Product", "Qty", "Reason", "Amount"].map(h => <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {c.history.returns.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 text-xs text-foreground">{r.date}</td>
                    <td className="px-5 py-3"><p className="text-xs font-semibold text-foreground">{r.product}</p><p className="text-[10px] font-mono text-muted-foreground">{r.sku}</p></td>
                    <td className="px-5 py-3 text-xs text-foreground">{r.qty} units</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{r.reason}</td>
                    <td className="px-5 py-3 text-sm font-bold text-red-600">−AED {r.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
      )}
    </SectionCard>
  );
}

// ── Section 9: Customer Info (bottom, collapsible) ─────────────────────────
function CustomerInfoSection({ c }: { c: CustomerDetailData }) {
  const [open, setOpen] = useState(false);
  const info = c.info;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/20 transition-colors border-b border-border">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Customer Information</p>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{info.code}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Full Name",         value: info.name },
              { label: "Customer Code",     value: info.code },
              { label: "Classification",    value: `Class ${info.classification} · ${info.type}` },
              { label: "Territory",         value: info.territory },
              { label: "Route",             value: info.route },
              { label: "Address",           value: info.address },
              { label: "Buyer",             value: `${info.buyerName} · ${info.buyerPhone}` },
              { label: "Last Visit",        value: info.lastVisit },
              { label: "Last Invoice",      value: `${info.lastInvoice.ref} · AED ${info.lastInvoice.amount.toLocaleString()}` },
              { label: "MTD Revenue",       value: `AED ${(info.mtdRevenue/1000).toFixed(0)}k of AED ${(info.targetMtd/1000).toFixed(0)}k` },
              { label: "Credit Limit",      value: `AED ${info.creditLimit.toLocaleString()}` },
              { label: "Status",            value: info.status },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-xs font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Phone className="h-3.5 w-3.5" /> Call Buyer
            </button>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <MapPin className="h-3.5 w-3.5" /> Open in Maps
            </button>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ReceiptText className="h-3.5 w-3.5" /> Full Account Statement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
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
    <div className="space-y-4 max-w-4xl">
      {/* Back */}
      <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Customer 360
      </Link>

      {/* Identity strip */}
      <IdentityStrip c={c} />

      {/* Decision sections — priority order */}
      <TodayDecision    c={c} />
      <SalesOpportunity c={c} />
      <CollectionSection c={c} />
      <LostSalesSection  c={c} />
      <CrossSellSection  c={c} />
      <GeoIntelligence   c={c} />
      <VisitStrategy     c={c} />
      <HistorySection    c={c} />

      {/* Customer info — last */}
      <CustomerInfoSection c={c} />
    </div>
  );
}
