import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  ArrowLeft, MapPin, Phone, Calendar, ShoppingCart, CreditCard,
  AlertTriangle, TrendingUp, Zap, ShieldCheck, Repeat2,
  CheckCircle2, XCircle, Circle, ChevronRight, Send, Bot,
  Star, Package, TrendingDown, Clock, Lightbulb, BadgeCheck,
} from "lucide-react";
import { getCustomerDetail, type CustomerDetailData, type VisitRecord } from "@/data/customer-detail-mock";
import { cn } from "@/lib/utils";

// ── Decision card config ──────────────────────────────────────────────────────
const DECISION_STYLES = {
  opportunity: { icon: TrendingUp,  bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon_color: "text-emerald-600", badge: "bg-emerald-500/15 text-emerald-700 border-emerald-500/25" },
  alert:       { icon: AlertTriangle,bg: "bg-red-500/10",    border: "border-red-500/20",    icon_color: "text-red-600",     badge: "bg-red-500/15 text-red-700 border-red-500/25"         },
  action:      { icon: Zap,          bg: "bg-violet-500/10", border: "border-violet-500/20", icon_color: "text-violet-600",  badge: "bg-violet-500/15 text-violet-700 border-violet-500/25" },
  collection:  { icon: CreditCard,   bg: "bg-amber-500/10",  border: "border-amber-500/20",  icon_color: "text-amber-600",   badge: "bg-amber-500/15 text-amber-700 border-amber-500/25"   },
  risk:        { icon: ShieldCheck,  bg: "bg-blue-500/10",   border: "border-blue-500/20",   icon_color: "text-blue-600",    badge: "bg-blue-500/15 text-blue-700 border-blue-500/25"      },
};

const PRIORITY_COLOR = {
  Critical: "bg-red-500/15 text-red-700 border border-red-500/25",
  High:     "bg-amber-500/15 text-amber-700 border border-amber-500/25",
  Medium:   "bg-blue-500/15 text-blue-600 border border-blue-500/25",
  Low:      "bg-emerald-500/15 text-emerald-700 border border-emerald-500/25",
};

const ACTION_STYLES = {
  collect: { color: "bg-amber-500/10 text-amber-600 border-amber-500/20",  num: "bg-amber-500 text-white" },
  offer:   { color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", num: "bg-emerald-500 text-white" },
  avoid:   { color: "bg-red-500/10 text-red-600 border-red-500/20",        num: "bg-red-500 text-white" },
  request: { color: "bg-violet-500/10 text-violet-600 border-violet-500/20",num: "bg-violet-500 text-white" },
  check:   { color: "bg-blue-500/10 text-blue-600 border-blue-500/20",     num: "bg-blue-500 text-white" },
};

const VISIT_STATUS_ICON = {
  Completed:  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />,
  Missed:     <XCircle      className="h-4 w-4 text-red-500 shrink-0" />,
  Cancelled:  <Circle       className="h-4 w-4 text-muted-foreground shrink-0" />,
};

// ── Sub-components ────────────────────────────────────────────────────────────
function ClassificationBadge({ cls }: { cls: "A" | "B" | "C" }) {
  const styles = { A: "bg-amber-500/20 text-amber-700 border-amber-500/30", B: "bg-blue-500/15 text-blue-700 border-blue-500/25", C: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold", styles[cls])}>
      <Star className="h-3 w-3" /> Class {cls}
    </span>
  );
}

function SectionCard({ title, icon: Icon, children, className }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

function VisitItem({ visit, isLast }: { visit: VisitRecord; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        {VISIT_STATUS_ICON[visit.status]}
        {!isLast && <div className={cn("w-px flex-1 min-h-[24px]", visit.status === "Completed" ? "bg-emerald-500/25" : "bg-border")} />}
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{visit.date}</span>
            <span className="text-[10px] text-muted-foreground">{visit.time}</span>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              visit.type === "Order" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
              visit.type === "Collection" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
              visit.type === "Promotional" ? "bg-violet-500/10 text-violet-600 border-violet-500/20" :
              "bg-muted text-muted-foreground border-border"
            )}>{visit.type}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {visit.orderValue && <span className="text-xs font-bold text-emerald-600">AED {visit.orderValue.toLocaleString()}</span>}
            {visit.duration && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />{visit.duration}</span>}
            <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
            </button>
          </div>
        </div>
        {expanded && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs text-muted-foreground leading-relaxed">{visit.outcome}</p>
            {visit.note && (
              <div className="flex items-start gap-1.5 rounded-md bg-amber-500/5 border border-amber-500/15 px-2.5 py-1.5">
                <Lightbulb className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">{visit.note}</p>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Rep: {visit.rep}</p>
          </div>
        )}
        {!expanded && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{visit.outcome}</p>}
      </div>
    </div>
  );
}

function AiCopilot({ qa }: { qa: CustomerDetailData["copilotQa"] }) {
  const [active, setActive] = useState(0);
  const [input, setInput] = useState("");
  const current = qa[active];

  return (
    <div className="flex flex-col h-full">
      {/* Quick questions */}
      <div className="p-3 border-b border-border space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Questions</p>
        {qa.map((q, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors border",
              i === active
                ? "bg-primary/10 text-primary border-primary/20"
                : "text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-2">
              <span>{q.question}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Answer */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex gap-2 mb-3">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1">AI Assistant</p>
            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              {current.answer.split("\n").map((line, i) => {
                const bold = line.replace(/\*\*(.*?)\*\*/g, (_, t) => `<strong>${t}</strong>`);
                return line.trim() === ""
                  ? <div key={i} className="h-2" />
                  : <p key={i} className="text-xs text-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: bold }} />;
              })}
            </div>
            <div className="flex gap-1 mt-1.5">
              {current.tags.map((t) => (
                <span key={t} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Custom input */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about this customer…"
            className="flex-1 text-xs bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button className="h-6 w-6 rounded-md bg-primary flex items-center justify-center shrink-0 hover:bg-primary/90 transition-colors">
            <Send className="h-3 w-3 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const customer = getCustomerDetail(Number(id));

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <p className="text-muted-foreground text-sm">Customer not found.</p>
        <Link href="/customers" className="text-primary text-sm underline">← Back to Customer 360</Link>
      </div>
    );
  }

  const creditUsed = customer.creditLimit > 0 ? Math.round((customer.outstandingBalance / customer.creditLimit) * 100) : 0;
  const mtdAttain  = Math.round((customer.mtdRevenue / customer.targetMtd) * 100);

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Customer 360
      </Link>

      {/* ── Customer Profile Header ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            {/* Identity */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-primary">{customer.name[0]}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-foreground">{customer.name}</h1>
                  <ClassificationBadge cls={customer.classification} />
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">{customer.code}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-xs text-muted-foreground">{customer.type}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-xs text-muted-foreground">{customer.territory}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{customer.address}</span>
                  <span className="text-primary font-medium shrink-0">· {customer.distance}</span>
                </div>
              </div>
            </div>

            {/* Buyer + quick actions */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground">Buyer</p>
                <p className="text-sm font-semibold text-foreground">{customer.buyerName}</p>
                <p className="text-xs text-muted-foreground">{customer.buyerPhone}</p>
              </div>
              <div className="flex gap-2">
                <button className="h-9 w-9 rounded-lg border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Call buyer">
                  <Phone className="h-4 w-4" />
                </button>
                <button className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
                  Start Visit
                </button>
              </div>
            </div>
          </div>

          {/* Key metrics row */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Visit</p>
              <p className="text-sm font-semibold text-foreground">{customer.lastVisit}</p>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Order</p>
              <p className="text-sm font-semibold text-foreground">AED {customer.lastOrder.amount.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">{customer.lastOrder.date} · {customer.lastOrder.skus} SKUs</p>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">MTD Revenue</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-sm font-semibold text-foreground">AED {(customer.mtdRevenue / 1000).toFixed(0)}k</p>
                <span className={cn("text-[10px] font-medium", mtdAttain >= 100 ? "text-emerald-600" : "text-amber-600")}>
                  {mtdAttain}% of target
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full", mtdAttain >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${Math.min(mtdAttain, 100)}%` }} />
              </div>
            </div>
            <div className={cn("rounded-lg px-3 py-2.5", customer.outstandingBalance > 0 ? "bg-amber-500/10" : "bg-muted/40")}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Outstanding</p>
              <p className={cn("text-sm font-bold", customer.outstandingBalance > 0 ? "text-amber-600" : "text-emerald-600")}>
                {customer.outstandingBalance > 0 ? `AED ${customer.outstandingBalance.toLocaleString()}` : "Clear"}
              </p>
              {customer.outstandingBalance > 0 && (
                <div className="mt-1 h-1 rounded-full bg-amber-500/20 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${creditUsed}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── FSOS Decision Summary ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          FSOS Decision Summary
        </p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {customer.decisions.map((d) => {
            const style = DECISION_STYLES[d.type];
            const Icon  = style.icon;
            return (
              <div
                key={d.id}
                className={cn("flex-shrink-0 w-[220px] rounded-xl border p-4 flex flex-col gap-3", style.bg, style.border)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", style.bg)}>
                    <Icon className={cn("h-4 w-4", style.icon_color)} />
                  </div>
                  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", PRIORITY_COLOR[d.priority])}>
                    {d.priority}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">{d.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-3">{d.explanation}</p>
                </div>
                <button className={cn("text-[11px] font-semibold text-left flex items-center gap-1 transition-opacity hover:opacity-70", style.icon_color)}>
                  {d.actionLabel} <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main content + AI Copilot ── */}
      <div className="grid xl:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="xl:col-span-2 space-y-5">

          {/* Recommended Actions */}
          <SectionCard title="Recommended Visit Actions" icon={BadgeCheck}>
            <div className="p-4 space-y-2">
              {customer.actions.map((a) => {
                const style = ACTION_STYLES[a.type];
                return (
                  <div key={a.id} className={cn("flex items-start gap-3 rounded-lg border p-3", style.color)}>
                    <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5", style.num)}>
                      {a.id}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{a.text}</p>
                      {a.sub && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{a.sub}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Product Intelligence */}
          <SectionCard title="Product Intelligence" icon={Package}>
            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {/* Frequently Purchased */}
              <div>
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Repeat2 className="h-3.5 w-3.5 text-emerald-500" /> Frequently Purchased
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {customer.frequentlyPurchased.map((p) => (
                    <div key={p.sku} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-7 w-7 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <ShoppingCart className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lost Products */}
              <div>
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Lost / Missing Products
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {customer.lostProducts.map((p) => (
                    <div key={p.sku} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-7 w-7 rounded-md bg-red-500/10 flex items-center justify-center shrink-0">
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                          {p.badge && <span className={cn("shrink-0 text-[9px] font-bold border px-1.5 py-0.5 rounded-full", p.badgeColor)}>{p.badge}</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{p.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border border-t border-border">
              {/* Cross-sell */}
              <div>
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-violet-500" /> Cross-Sell Opportunities
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {customer.crossSell.map((p) => (
                    <div key={p.sku} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-7 w-7 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                        <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fast Moving */}
              <div>
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" /> Fast Moving SKUs
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {customer.fastMoving.map((p) => (
                    <div key={p.sku} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Package className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                          {p.badge && <span className={cn("shrink-0 text-[9px] font-bold border px-1.5 py-0.5 rounded-full", p.badgeColor)}>{p.badge}</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground">{p.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Visit History */}
          <SectionCard title="Visit History" icon={Calendar}>
            <div className="divide-y divide-border">
              {customer.visits.map((v, i) => (
                <VisitItem key={v.id} visit={v} isLast={i === customer.visits.length - 1} />
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Right column — AI Copilot sticky */}
        <div className="xl:col-span-1">
          <div className="sticky top-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-primary/5">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-none">AI Copilot</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Contextual field intelligence</p>
                </div>
                <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <AiCopilot qa={customer.copilotQa} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
