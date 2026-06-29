import { DollarSign, MapPin, ShoppingCart, Target, Activity, Package, Users } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { BadgeStatus } from "@/components/badge-status";
import { VISITS, PRODUCTS, REPS } from "@/data/mock";

export default function Dashboard() {
  const today = new Date().toLocaleDateString("en-AE", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={today}>
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
          Territory: Dubai South
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          On Route
        </span>
      </PageHeader>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Revenue Today" value="AED 12,600" trend={14.2} sub="vs. yesterday" icon={DollarSign} iconBg="bg-emerald-500/10" iconColor="text-emerald-600" />
        <StatCard label="Visits Completed" value="2 / 6" trend={0} sub="today's plan" icon={MapPin} iconBg="bg-blue-500/10" iconColor="text-blue-600" />
        <StatCard label="Orders Placed" value="5" trend={25} sub="vs. yesterday" icon={ShoppingCart} iconBg="bg-violet-500/10" iconColor="text-violet-600" />
        <StatCard label="MTD Coverage" value="68%" trend={-4.1} sub="vs. last month" icon={Target} iconBg="bg-amber-500/10" iconColor="text-amber-600" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Customers" value="142" sub="in territory" icon={Users} iconBg="bg-cyan-500/10" iconColor="text-cyan-600" />
        <StatCard label="Avg Order Value" value="AED 4,420" trend={6.8} sub="this month" icon={ShoppingCart} iconBg="bg-indigo-500/10" iconColor="text-indigo-600" />
        <StatCard label="SKUs Sold" value="38" sub="of 52 range" icon={Package} iconBg="bg-rose-500/10" iconColor="text-rose-600" />
        <StatCard label="Strike Rate" value="83%" trend={3.2} sub="orders / visits" icon={Activity} iconBg="bg-teal-500/10" iconColor="text-teal-600" />
      </div>

      {/* Middle row */}
      <div className="grid lg:grid-cols-5 gap-4">
        {/* Today's Visits */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Today's Visit Plan</p>
            <span className="text-xs text-muted-foreground">6 stops</span>
          </div>
          <div className="divide-y divide-border">
            {VISITS.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                <div className="text-xs text-muted-foreground font-mono w-12 shrink-0">{v.time}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{v.customer}</p>
                  <p className="text-xs text-muted-foreground truncate">{v.address}</p>
                </div>
                <div className="text-right shrink-0">
                  {v.value > 0 && <p className="text-xs font-semibold text-foreground">AED {v.value.toLocaleString()}</p>}
                  <BadgeStatus status={v.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Leaderboard */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Team Leaderboard</p>
            <span className="text-xs text-muted-foreground">This month</span>
          </div>
          <div className="divide-y divide-border">
            {REPS.map((rep, i) => (
              <div key={rep.id} className="flex items-center gap-3 px-4 py-3">
                <span className={[
                  "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                  i === 0 ? "bg-amber-500/20 text-amber-600" :
                  i === 1 ? "bg-slate-400/20 text-slate-500" :
                  i === 2 ? "bg-orange-500/20 text-orange-600" :
                  "bg-muted text-muted-foreground"
                ].join(" ")}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{rep.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${rep.coverage}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{rep.coverage}%</span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-foreground shrink-0">AED {(rep.revenue / 1000).toFixed(0)}k</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top SKUs */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Top Performing SKUs</p>
          <span className="text-xs text-muted-foreground">Month to date</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Product</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Category</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5">Revenue</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5">Units</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5">Growth</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5">Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PRODUCTS.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div>
                      <p className="font-medium text-foreground text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{p.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-foreground">AED {p.sales.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{p.units.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={p.growth >= 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                      {p.growth >= 0 ? "+" : ""}{p.growth}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${p.coverage}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8">{p.coverage}%</span>
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
