import { Link } from "wouter";
import { Search, Filter, Building2, MapPin, Calendar, TrendingUp, TrendingDown, ChevronRight, Star } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BadgeStatus } from "@/components/badge-status";
import { StatCard } from "@/components/stat-card";
import { CUSTOMERS } from "@/data/mock";

const FILTERS = ["All", "Hypermarket", "Supermarket", "Co-op", "Premium Super"];

export default function Customer360() {
  const active       = CUSTOMERS.filter((c) => c.status === "Active").length;
  const atRisk       = CUSTOMERS.filter((c) => c.status === "At Risk").length;
  const totalRevenue = CUSTOMERS.reduce((s, c) => s + c.revenueMtd, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Customer 360" description="Manage and monitor your full customer portfolio">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground hover:bg-accent transition-colors">
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>
        <Link
          href="/new-customer"
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          + Add Customer
        </Link>
      </PageHeader>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Customers" value={String(CUSTOMERS.length)} sub="in territory" icon={Building2} />
        <StatCard label="Active" value={String(active)} trend={5.0} sub="vs. last month" icon={TrendingUp} iconBg="bg-emerald-500/10" iconColor="text-emerald-600" />
        <StatCard label="At Risk" value={String(atRisk)} trend={-12.0} sub="needs attention" icon={TrendingDown} iconBg="bg-amber-500/10" iconColor="text-amber-600" />
        <StatCard label="MTD Revenue" value={`AED ${(totalRevenue / 1000).toFixed(0)}k`} trend={9.3} sub="month to date" icon={TrendingUp} iconBg="bg-violet-500/10" iconColor="text-violet-600" />
      </div>

      {/* Search & Filter chips */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search customers…"
            className="w-full rounded-md border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {FILTERS.map((f, i) => (
            <button
              key={f}
              className={[
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                i === 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground",
              ].join(" ")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {CUSTOMERS.map((c) => (
          <Link
            key={c.id}
            href={`/customers/${c.id}`}
            className="rounded-xl border border-border bg-card p-4 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group block"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {c.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-muted-foreground">{c.type}</p>
                    {c.id <= 2 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-700 border-amber-500/30">
                        <Star className="h-2.5 w-2.5" /> A
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <BadgeStatus status={c.status} />
            </div>

            {/* Details */}
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span>{c.region}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span>Last visit: <span className="text-foreground font-medium">{c.lastVisit}</span></span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3 shrink-0" />
                <span>Visit frequency: <span className="text-foreground font-medium">{c.visitFreq}</span></span>
              </div>
            </div>

            {/* Revenue + CTA */}
            <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center justify-between group-hover:bg-muted/60 transition-colors">
              <div>
                <p className="text-[10px] text-muted-foreground">MTD Revenue</p>
                <p className="text-sm font-bold text-foreground">AED {c.revenueMtd.toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-1 text-primary text-xs font-medium">
                <span className="hidden sm:inline">View 360</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Risk indicator */}
            {c.risk !== "Low" && (
              <div className={[
                "mt-2 rounded-md px-3 py-1.5 text-xs font-medium",
                c.risk === "High"
                  ? "bg-red-500/10 text-red-600"
                  : "bg-amber-500/10 text-amber-600",
              ].join(" ")}>
                {c.risk === "High" ? "⚠ High risk – schedule visit urgently" : "⚡ Medium risk – schedule visit soon"}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
