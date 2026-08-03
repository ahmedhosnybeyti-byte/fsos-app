"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { CreatePlatformCompanyInput } from "@field-sales-os/schemas";
import { companiesApi, plansApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatDate } from "@/lib/utils";
import { TemporaryPasswordCard } from "@/components/users/temporary-password-card";

const initialForm: CreatePlatformCompanyInput = { name: "", slug: "", initialStatus: "ACTIVE", initialPlanCode: "", adminFullName: "", adminEmail: "" };

export default function AdminCompaniesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreatePlatformCompanyInput>(initialForm);
  const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "companies", page], queryFn: () => companiesApi.list(page) });
  const { data: plans } = useQuery({ queryKey: ["plans", "all"], queryFn: plansApi.listAll });
  const createMutation = useMutation({
    mutationFn: () => companiesApi.createPlatform({ ...form, slug: form.slug.trim().toLowerCase(), adminEmail: form.adminEmail.trim().toLowerCase() }),
    onSuccess: async (result) => { setTemporaryPassword({ email: result.admin.email, password: result.temporaryPassword }); setCreateOpen(false); setForm(initialForm); await queryClient.invalidateQueries({ queryKey: ["admin", "companies"] }); toast.success("Company created"); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not create company"),
  });
  const lifecycleMutation = useMutation({
    mutationFn: ({ id, event }: { id: string; event: "SUSPEND" | "REACTIVATE" }) => companiesApi.lifecycle(id, event),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin", "companies"] }); toast.success("Company updated"); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update company"),
  });

  return <div className="relative space-y-6">
    <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
    <div className="rise-in flex items-center justify-between gap-4"><div className="flex items-center gap-4"><span className="crystal-badge hidden h-14 w-14 bg-primary/15 text-primary sm:flex"><Building2 className="h-6 w-6" /></span><div><h1 className="text-2xl font-semibold">Companies</h1><p className="text-muted-foreground">Every tenant on the platform.</p></div></div><Button onClick={() => setCreateOpen(true)}><UserPlus className="h-4 w-4" /> Create company</Button></div>
    {temporaryPassword && <TemporaryPasswordCard email={temporaryPassword.email} password={temporaryPassword.password} onDismiss={() => setTemporaryPassword(null)} />}
    <div className="glass-hero p-6"><h2 className="mb-4 font-semibold">All companies</h2>{isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : <><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Slug</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead /></TableRow></TableHeader><TableBody>{data?.items.map((company) => <TableRow key={company.id}><TableCell className="font-medium"><Link href={`/admin/companies/${company.id}`} className="hover:underline">{company.name}</Link></TableCell><TableCell>{company.slug}</TableCell><TableCell><Badge variant="outline">{company.status}</Badge></TableCell><TableCell>{formatDate(company.createdAt)}</TableCell><TableCell>{company.status === "ACTIVE" ? <Button disabled={lifecycleMutation.isPending} size="sm" variant="outline" onClick={() => lifecycleMutation.mutate({ id: company.id, event: "SUSPEND" })}>Suspend</Button> : company.status === "SUSPENDED" ? <Button disabled={lifecycleMutation.isPending} size="sm" variant="outline" onClick={() => lifecycleMutation.mutate({ id: company.id, event: "REACTIVATE" })}>Reactivate</Button> : null}</TableCell></TableRow>)}</TableBody></Table><Pagination page={page} total={data?.total ?? 0} pageSize={data?.pageSize ?? 20} onChange={setPage} /></>}</div>
    <Dialog open={createOpen} onOpenChange={(open) => { if (!createMutation.isPending) setCreateOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Create company</DialogTitle></DialogHeader><div className="space-y-3"><Label>Company name<Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Label><Label>Slug<Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Label><Label>Initial plan<Select value={form.initialPlanCode} onValueChange={(value) => setForm({ ...form, initialPlanCode: value })}><SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger><SelectContent>{plans?.map((plan) => <SelectItem key={plan.id} value={plan.code}>{plan.name}</SelectItem>)}</SelectContent></Select></Label><Label>Initial status<Select value={form.initialStatus} onValueChange={(value) => setForm({ ...form, initialStatus: value as CreatePlatformCompanyInput["initialStatus"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="SUSPENDED">Suspended</SelectItem></SelectContent></Select></Label><Label>First Company Admin name<Input value={form.adminFullName} onChange={(e) => setForm({ ...form, adminFullName: e.target.value })} /></Label><Label>First Company Admin email<Input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} /></Label></div><DialogFooter><Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "Creating…" : "Create company"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}