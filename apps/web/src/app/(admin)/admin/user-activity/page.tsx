"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { userActivityApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function UserActivityCenterPage() {
  const [selected, setSelected] = useState<string>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState<string>();
  const tree = useQuery({ queryKey: ["user-activity", "tree"], queryFn: userActivityApi.tree });
  const overview = useQuery({ queryKey: ["user-activity", "overview", from, to], queryFn: () => userActivityApi.overview(from || undefined, to || undefined) });
  const timeline = useQuery({ queryKey: ["user-activity", "timeline", selected, from, to], queryFn: () => userActivityApi.timeline(selected!, from || undefined, to || undefined), enabled: !!selected });
  const affected = useMemo(() => (overview.data?.affected ?? []).filter((item: any) => !filter || filter === "denied" ? item.denied > 0 : filter === "alerts" ? item.alerts > 0 : item.risk !== "NORMAL"), [overview.data, filter]);
  const users = tree.data ?? [];
  const watch = overview.data?.affected ?? [];

  useEffect(() => {
    const header = document.querySelector("[data-user-activity-tree-header]");
    if (!header || header.querySelector("[data-tree-toggle]")) return;
    const button = document.createElement("button");
    button.dataset.treeToggle = "true";
    button.className = "rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary";
    let open = true;
    button.textContent = "Collapse all";
    button.onclick = () => {
      open = !open;
      document.querySelectorAll("[data-user-activity-tree] details").forEach((detail: any) => { detail.open = open; });
      button.textContent = open ? "Collapse all" : "Expand all";
    };
    header.appendChild(button);
  }, [tree.data]);

  return <div className="space-y-5" data-user-activity-tree>
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-5">
      <div><h1 className="text-2xl font-semibold">مركز نشاط المستخدمين</h1><p className="mt-1 text-sm text-muted-foreground">Operational activity by organizational scope.</p></div>
      {selected && <Button variant="outline" onClick={() => setSelected(undefined)}><ArrowLeft className="h-4 w-4" /> العودة للملخص العام</Button>}
    </header>
    <div className="glass-card flex flex-wrap gap-2 p-3"><Input className="w-auto" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><Input className="w-auto" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(520px,42%)_minmax(0,1fr)]">
      <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Group Tree</CardTitle><span data-user-activity-tree-header /></CardHeader><CardContent className="max-h-[70vh] space-y-3 overflow-auto">
        {watch.length > 0 && <button className="w-full rounded-md bg-warning/15 p-3 text-start font-medium text-warning" onClick={() => setFilter("watch")}>⚠️ يحتاج متابعة ({watch.length})</button>}
        {Object.entries(users.reduce((groups: any, user: any) => { const company = user.company?.name ?? "Platform"; const unit = user.orgUnit?.name ?? "Unassigned"; const role = user.role?.code ?? "Other"; groups[company] ??= {}; groups[company][unit] ??= {}; groups[company][unit][role] ??= []; groups[company][unit][role].push(user); return groups; }, {})).map(([company, units]: any) => <details key={company} open><summary className="cursor-pointer font-semibold">{company}</summary>{Object.entries(units).map(([unit, roles]: any) => <details key={unit} open className="ms-3"><summary className="cursor-pointer">{unit}</summary>{Object.entries(roles).map(([role, people]: any) => <details key={role} open className="ms-3"><summary className="cursor-pointer text-sm">{role} ({people.length})</summary>{people.map((user: any) => <button key={user.id} className={`ms-3 block w-[calc(100%-12px)] rounded-md p-2 text-start text-sm hover:bg-muted ${selected === user.id ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setSelected(user.id)}>{user.fullName}<span className="ms-2 text-xs opacity-70">{user.email}</span></button>)}</details>)}</details>)}</details>)}
      </CardContent></Card>
      <div className="min-w-0 space-y-4">{!selected ? <><div className="grid gap-3 sm:grid-cols-3"><Metric title="Denied" value={`${overview.data?.denied?.accounts ?? 0} accounts · ${overview.data?.denied?.total ?? 0} attempts`} icon={AlertTriangle} onClick={() => setFilter("denied")} /><Metric title="Security Alerts" value={`${overview.data?.securityAlerts?.accounts ?? 0} accounts · ${overview.data?.securityAlerts?.total ?? 0} alerts`} icon={ShieldCheck} onClick={() => setFilter("alerts")} /><Metric title="Risk" value={`W ${overview.data?.risk?.WATCH ?? 0} · S ${overview.data?.risk?.SUSPICIOUS ?? 0} · H ${overview.data?.risk?.HIGH_RISK ?? 0}`} icon={UsersRound} onClick={() => setFilter("risk")} /></div><Card><CardHeader><CardTitle>Affected Accounts</CardTitle></CardHeader><CardContent className="space-y-2">{affected.map((user: any) => <button key={user.id} className="flex w-full justify-between rounded-md border border-border p-3 text-start hover:bg-muted" onClick={() => setSelected(user.id)}><span><b>{user.name}</b><span className="block text-xs text-muted-foreground">{user.email} · {user.company} · {user.branch} · {user.role}</span></span><b>{user.count}</b></button>)}{!affected.length && <p className="text-muted-foreground">No affected accounts.</p>}</CardContent></Card></> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Total Events", timeline.data?.summary.totalEvents], ["Business", timeline.data?.summary.businessEvents], ["Denied", timeline.data?.summary.deniedEvents], ["Risk", timeline.data?.summary.riskLevel]].map(([label, value]) => <Card key={label as string}><CardContent className="p-4"><span className="text-sm text-muted-foreground">{label}</span><b className="ms-2">{value ?? "—"}</b></CardContent></Card>)}</div><Card><CardHeader><CardTitle>Timeline</CardTitle></CardHeader><CardContent className="space-y-3">{timeline.data?.items?.map((event: any) => <div key={event.id} className="border-s-2 border-primary/40 ps-3"><b>{event.type}</b><p className="text-sm text-muted-foreground">{new Date(event.timestamp).toLocaleString()} · {event.outcome}</p></div>)}</CardContent></Card></>}</div>
    </div>
  </div>;
}

function Metric({ title, value, icon: Icon, onClick }: { title: string; value: string; icon: any; onClick: () => void }) {
  return <button onClick={onClick} className="card-lift text-start"><Card><CardContent className="p-4"><Icon className="mb-2 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">{title}</p><b>{value}</b></CardContent></Card></button>;
}
