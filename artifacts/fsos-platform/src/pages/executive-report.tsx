import { Download, Calendar, TrendingUp, TrendingDown, Users, Target, DollarSign, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TERRITORIES, PRODUCTS, REPS } from "@/data/mock";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const REVENUE = [980, 1120, 1050, 1280, 1190, 1392];
const TARGET  = [1000, 1000, 1100, 1200, 1200, 1300];

export default function ExecutiveReport() {
  return (
    <div className="space-y-6">
      <PageHeader title="Executive Report" description="Territory performance summary — June 2026">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>June 2026</span>
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Download className="h-3.5 w-3.5" /> Export PDF
        </button>
      </PageHeader>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue MTD" value="AED 1.39M" trend={7.1} sub="vs. last month" icon={DollarSign} iconBg="bg-emerald-500/10" iconColor="text-emerald-600" />
        <StatCard label="vs. Target" value="107%" trend={7.0} sub="AED 1.3M target" icon={Target} iconBg="bg-violet-500/10" iconColor="text-violet-600" />
        <StatCard label="Active Reps" value="5 / 5" sub="all territories" icon={Users} iconBg="bg-blue-500/10" iconColor="text-blue-600" />
        <StatCard label="Outlets Covered" value="232 / 310" trend={-3.4} sub="74.8% coverage" icon={MapPin} iconBg="bg-amber-500/10" iconColor="text-amber-600" />
      </div>

      {/* Revenue vs Target Chart (mock bars) */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-foreground">Revenue vs Target — 2026</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary inline-block" />Revenue</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/30 inline-block" />Target</span>
          </div>
        </div>
        <div className="flex items-end gap-3 h-36">
          {MONTHS.map((m, i) => {
            const maxVal = Math.max(...REVENUE, ...TARGET);
            const revH = (REVENUE[i] / maxVal) * 100;
            const tarH = (TARGET[i] / maxVal) * 100;
            const overTarget = REVENUE[i] >= TARGET[i];
            return (
              <div key={m} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-0.5 h-28">
                  <div
                    className={["flex-1 rounded-t-sm transition-all", overTarget ? "bg-emerald-500" : "bg-primary"].join(" ")}
                    style={{ height: `${revH}%` }}
                  />
                  <div className="flex-1 rounded-t-sm bg-muted-foreground/20" style={{ height: `${tarH}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{m}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Territory breakdown */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Territory Performance</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Territory", "Reps", "Customers", "Revenue MTD", "Target", "Attainment", "Trend"].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {TERRITORIES.map((t) => (
                <tr key={t.region} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{t.region}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.repCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.customers}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">AED {(t.revenueMtd / 1000).toFixed(0)}k</td>
                  <td className="px-4 py-3 text-muted-foreground">AED {(t.target / 1000).toFixed(0)}k</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={["h-full rounded-full", t.attainment >= 100 ? "bg-emerald-500" : t.attainment >= 80 ? "bg-primary" : "bg-amber-500"].join(" ")}
                          style={{ width: `${Math.min(t.attainment, 100)}%` }}
                        />
                      </div>
                      <span className={["text-xs font-semibold", t.attainment >= 100 ? "text-emerald-600" : t.attainment >= 80 ? "text-foreground" : "text-amber-600"].join(" ")}>
                        {t.attainment}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {t.attainment >= 100
                      ? <TrendingUp className="h-4 w-4 text-emerald-500" />
                      : t.attainment >= 85
                      ? <TrendingUp className="h-4 w-4 text-primary" />
                      : <TrendingDown className="h-4 w-4 text-amber-500" />
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rep performance + Top SKUs side by side */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Rep performance */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Sales Rep Performance</p>
          </div>
          <div className="divide-y divide-border">
            {REPS.map((rep, i) => (
              <div key={rep.id} className="flex items-center gap-3 px-4 py-3">
                <span className={["h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                  i === 0 ? "bg-amber-500/20 text-amber-600" : i === 1 ? "bg-slate-400/20 text-slate-500" : i === 2 ? "bg-orange-500/20 text-orange-600" : "bg-muted text-muted-foreground"
                ].join(" ")}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{rep.name}</p>
                  <p className="text-xs text-muted-foreground">{rep.region} · {rep.visits}/{rep.target} visits</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground">AED {(rep.revenue / 1000).toFixed(0)}k</p>
                  <p className="text-xs text-muted-foreground">{rep.orders} orders</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top SKUs */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Top SKUs — Revenue MTD</p>
          </div>
          <div className="divide-y divide-border">
            {PRODUCTS.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs text-muted-foreground font-mono w-4 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden max-w-[80px]">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p.coverage}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{p.coverage}% cov.</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground">AED {p.sales.toLocaleString()}</p>
                  <p className={["text-xs font-medium", p.growth >= 0 ? "text-emerald-600" : "text-red-500"].join(" ")}>
                    {p.growth >= 0 ? "+" : ""}{p.growth}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
