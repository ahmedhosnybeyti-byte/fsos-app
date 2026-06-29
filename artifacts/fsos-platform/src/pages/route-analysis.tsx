import { MapPin, Clock, TrendingUp, Navigation, AlertTriangle, CheckCircle2, Map } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ROUTES } from "@/data/mock";

const COVERAGE_ZONES = [
  { zone: "Sheikh Zayed Corridor", outlets: 24, covered: 21, pct: 87.5 },
  { zone: "Deira & Bur Dubai", outlets: 31, covered: 31, pct: 100 },
  { zone: "JBR & Marina", outlets: 18, covered: 10, pct: 55.6 },
  { zone: "Downtown & DIFC", outlets: 14, covered: 14, pct: 100 },
  { zone: "Al Quoz & Nad Al Sheba", outlets: 22, covered: 12, pct: 54.5 },
];

export default function RouteAnalysis() {
  const totalStops = ROUTES.reduce((s, r) => s + r.stops, 0);
  const totalCompleted = ROUTES.reduce((s, r) => s + r.completed, 0);
  const avgEfficiency = Math.round(ROUTES.reduce((s, r) => s + r.efficiency, 0) / ROUTES.length);

  return (
    <div className="space-y-6">
      <PageHeader title="Route Analysis" description="Optimize your territory coverage and route efficiency">
        <button className="px-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground hover:bg-accent transition-colors">
          Reorder Routes
        </button>
        <button className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          + Plan New Route
        </button>
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Routes" value={String(ROUTES.length)} sub="active this week" icon={Navigation} />
        <StatCard label="Stops Completed" value={`${totalCompleted} / ${totalStops}`} sub="today" icon={CheckCircle2} iconBg="bg-emerald-500/10" iconColor="text-emerald-600" />
        <StatCard label="Avg Efficiency" value={`${avgEfficiency}%`} trend={4.2} sub="vs. last week" icon={TrendingUp} iconBg="bg-violet-500/10" iconColor="text-violet-600" />
        <StatCard label="Coverage Gaps" value="3" sub="zones below 60%" icon={AlertTriangle} iconBg="bg-amber-500/10" iconColor="text-amber-600" />
      </div>

      {/* Map placeholder + Route list */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Map */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Territory Map</p>
            </div>
            <div className="flex items-center gap-2">
              {["All Routes", "Gaps Only", "Heatmap"].map((v, i) => (
                <button key={v} className={["text-xs px-2.5 py-1 rounded-md transition-colors", i === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"].join(" ")}>{v}</button>
              ))}
            </div>
          </div>
          {/* Map placeholder */}
          <div className="relative h-[340px] bg-muted/30 flex items-center justify-center">
            {/* Grid pattern */}
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)", backgroundSize: "40px 40px" }}
            />
            {/* Mock route pins */}
            {[
              { x: "30%", y: "35%", label: "D-1", color: "bg-emerald-500" },
              { x: "55%", y: "25%", label: "D-2", color: "bg-emerald-500" },
              { x: "20%", y: "60%", label: "D-3", color: "bg-amber-500" },
              { x: "65%", y: "55%", label: "D-4", color: "bg-emerald-500" },
              { x: "45%", y: "70%", label: "D-5", color: "bg-amber-500" },
            ].map((pin) => (
              <div key={pin.label} className="absolute flex flex-col items-center" style={{ left: pin.x, top: pin.y }}>
                <div className={`h-7 w-7 rounded-full ${pin.color} shadow-lg flex items-center justify-center text-white text-[10px] font-bold border-2 border-white`}>
                  {pin.label}
                </div>
                <div className={`w-0.5 h-3 ${pin.color} opacity-60`} />
              </div>
            ))}
            <div className="relative z-10 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">Interactive map coming soon</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">Connect mapping integration to enable</p>
            </div>
          </div>
        </div>

        {/* Route list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Active Routes</p>
          </div>
          <div className="divide-y divide-border">
            {ROUTES.map((r) => (
              <div key={r.id} className="px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors group">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate pr-2">
                    {r.name.split("–")[0].trim()}
                  </p>
                  <span className={["text-[10px] font-bold shrink-0", r.efficiency >= 90 ? "text-emerald-600" : r.efficiency >= 75 ? "text-primary" : "text-amber-600"].join(" ")}>
                    {r.efficiency}%
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">{r.name.split("–")[1]?.trim() ?? ""}</p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.stops} stops</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.avgTime}</span>
                  <span>{r.distance}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={["h-full rounded-full", r.efficiency >= 90 ? "bg-emerald-500" : r.efficiency >= 75 ? "bg-primary" : "bg-amber-500"].join(" ")}
                      style={{ width: `${r.coverage}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{r.completed}/{r.stops}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Coverage by Zone */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Coverage by Zone</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Zone", "Total Outlets", "Covered", "Coverage %", "Status", "Progress"].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COVERAGE_ZONES.map((z) => (
                <tr key={z.zone} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{z.zone}</td>
                  <td className="px-4 py-3 text-muted-foreground">{z.outlets}</td>
                  <td className="px-4 py-3 text-muted-foreground">{z.covered}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{z.pct.toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    <span className={["inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      z.pct === 100 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                      z.pct >= 70 ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                      "bg-amber-500/10 text-amber-600 border-amber-500/20"
                    ].join(" ")}>
                      {z.pct === 100 ? "✓ Full" : z.pct >= 70 ? "Good" : "⚠ Gap"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={["h-full rounded-full", z.pct === 100 ? "bg-emerald-500" : z.pct >= 70 ? "bg-primary" : "bg-amber-500"].join(" ")}
                          style={{ width: `${z.pct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
