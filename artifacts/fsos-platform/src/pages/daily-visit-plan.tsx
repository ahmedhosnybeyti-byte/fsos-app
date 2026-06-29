import { CalendarDays, MapPin, Clock, ShoppingCart, CheckCircle2, Circle, Loader2, XCircle, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BadgeStatus } from "@/components/badge-status";
import { VISITS } from "@/data/mock";

const STATUS_ICON: Record<string, React.ReactNode> = {
  Completed:    <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
  "In Progress":<Loader2 className="h-5 w-5 text-blue-500 animate-spin" />,
  Planned:      <Circle className="h-5 w-5 text-muted-foreground/40" />,
  Missed:       <XCircle className="h-5 w-5 text-red-500" />,
};

const DATES = ["Mon 27", "Tue 28", "Wed 29", "Thu 30", "Fri 1"];

export default function DailyVisitPlan() {
  const completed = VISITS.filter((v) => v.status === "Completed").length;
  const inProgress = VISITS.filter((v) => v.status === "In Progress").length;
  const planned = VISITS.filter((v) => v.status === "Planned").length;
  const totalValue = VISITS.reduce((s, v) => s + v.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Daily Visit Plan" description="Your scheduled customer visits for today">
        <button className="px-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground hover:bg-accent transition-colors">
          Export Route
        </button>
        <button className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          + Add Visit
        </button>
      </PageHeader>

      {/* Week Picker */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {DATES.map((d, i) => (
          <button
            key={d}
            className={[
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              i === 2
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background",
            ].join(" ")}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Completed", value: completed, color: "text-emerald-600 bg-emerald-500/10" },
          { label: "In Progress", value: inProgress, color: "text-blue-600 bg-blue-500/10" },
          { label: "Remaining", value: planned, color: "text-muted-foreground bg-muted" },
          { label: "Revenue Captured", value: `AED ${totalValue.toLocaleString()}`, color: "text-violet-600 bg-violet-500/10" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl px-4 py-3 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-0.5 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Visit Timeline */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              Wednesday, June 29 — {VISITS.length} Stops
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Rep: James Al-Farsi</span>
        </div>

        <div className="divide-y divide-border">
          {VISITS.map((v, idx) => (
            <div
              key={v.id}
              className={[
                "flex items-center gap-4 px-4 py-4 group cursor-pointer transition-colors",
                v.status === "In Progress" ? "bg-blue-500/5" : "hover:bg-muted/30",
              ].join(" ")}
            >
              {/* Timeline dot */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                {STATUS_ICON[v.status] ?? <Circle className="h-5 w-5 text-muted-foreground" />}
                {idx < VISITS.length - 1 && (
                  <div className={[
                    "w-px flex-1 min-h-[20px]",
                    v.status === "Completed" ? "bg-emerald-500/30" : "bg-border",
                  ].join(" ")} />
                )}
              </div>

              {/* Time */}
              <div className="w-12 shrink-0">
                <p className="text-sm font-mono font-semibold text-foreground">{v.time}</p>
              </div>

              {/* Customer info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {v.customer}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {v.address}
                  </span>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{v.type}</span>
                </div>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-6 shrink-0">
                {v.duration !== "–" && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {v.duration}
                    </p>
                  </div>
                )}
                {v.orders > 0 && (
                  <div className="text-right">
                    <p className="text-xs font-medium text-foreground flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3 text-muted-foreground" /> {v.orders} orders
                    </p>
                    <p className="text-xs text-emerald-600 font-semibold">AED {v.value.toLocaleString()}</p>
                  </div>
                )}
                <BadgeStatus status={v.status} />
              </div>

              <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
            </div>
          ))}
        </div>
      </div>

      {/* Route efficiency */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Route Efficiency</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: "Planned Distance", value: "62 km" },
            { label: "Est. Drive Time", value: "3h 20min" },
            { label: "Efficiency Score", value: "87%" },
          ].map((m) => (
            <div key={m.label} className="rounded-lg bg-muted/40 p-3">
              <p className="text-lg font-bold text-foreground">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
