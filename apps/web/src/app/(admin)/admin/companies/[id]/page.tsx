"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CompanyStatus } from "@field-sales-os/schemas";
import { companiesApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";
import { canSubmitCompanyDetails, getCompanyDetailsViewState } from "@/lib/admin-company-details-state";

export default function AdminCompanyDetailsPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin", "company", params.id], queryFn: () => companiesApi.details(params.id), enabled: Boolean(params.id) });
  const [form, setForm] = useState<{ name: string; slug: string; status: CompanyStatus }>({ name: "", slug: "", status: "ACTIVE" });
  useEffect(() => { if (data) setForm({ name: data.name, slug: data.slug, status: data.status }); }, [data]);
  const updateMutation = useMutation({
    mutationFn: () => companiesApi.update(params.id, { name: form.name, slug: form.slug.trim().toLowerCase(), status: form.status }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["admin", "company", params.id] }); await queryClient.invalidateQueries({ queryKey: ["admin", "companies"] }); },
  });
  const viewState = getCompanyDetailsViewState({ isLoading, isError, hasData: Boolean(data) });
  if (viewState === "loading") return <div className="flex min-h-[50vh] items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  if (viewState === "error" || !data) return <p className="text-destructive">Could not load company details.</p>;
  return <div className="space-y-6"><div><Link href="/admin/companies" className="text-sm text-primary hover:underline">← Companies</Link><h1 className="mt-2 text-2xl font-semibold">{data.name}</h1><p className="text-muted-foreground">Created {formatDate(data.createdAt)} · Updated {formatDate(data.updatedAt)}</p></div><section className="glass-card space-y-3 p-4"><h2 className="font-semibold">Edit company</h2><Label>Name<Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Label><Label>Slug<Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Label><Label>Status<Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as CompanyStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="SUSPENDED">Suspended</SelectItem><SelectItem value="DRAFT">Draft</SelectItem><SelectItem value="CONFIGURING">Configuring</SelectItem><SelectItem value="ARCHIVED">Archived</SelectItem></SelectContent></Select></Label>{updateMutation.isError && <p className="text-sm text-destructive">{updateMutation.error instanceof ApiError ? updateMutation.error.message : "Could not update company."}</p>}<Button disabled={!canSubmitCompanyDetails(updateMutation.isPending)} onClick={() => { if (canSubmitCompanyDetails(updateMutation.isPending)) updateMutation.mutate(); }}>{updateMutation.isPending ? "Saving…" : "Save changes"}</Button></section><div className="grid gap-4 md:grid-cols-3"><section className="glass-card p-4"><h2 className="font-semibold">Subscription</h2>{data.subscriptions[0] ? <><p>{data.subscriptions[0].plan.name}</p><p>{data.subscriptions[0].status}</p></> : <p>No subscription</p>}<Button asChild variant="link"><Link href="/admin/subscriptions">Open subscriptions</Link></Button></section><section className="glass-card p-4"><h2 className="font-semibold">Payments</h2><p>{data.payments.length} payment records</p><Button asChild variant="link"><Link href="/admin/payments">Open payments</Link></Button></section><section className="glass-card p-4"><h2 className="font-semibold">Users</h2><p>{data.users.length} users</p><Button asChild variant="link"><Link href={`/admin/users?companyId=${data.id}`}>Open company users</Link></Button></section></div><section className="glass-card p-4"><h2 className="mb-3 font-semibold">Company users</h2>{data.users.map((user) => <div key={user.id} className="border-b py-2 last:border-0"><p>{user.fullName} <span className="text-muted-foreground">{user.email}</span></p><p className="text-xs text-muted-foreground">{user.role.name} · {user.status}</p></div>)}</section></div>;
}