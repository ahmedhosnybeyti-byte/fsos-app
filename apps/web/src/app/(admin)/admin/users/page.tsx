"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import type { CreateUserInput, UserStatus } from "@field-sales-os/schemas";
import { authApi, companiesApi, rolesApi, usersApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shell/pagination";
import { formatDate } from "@/lib/utils";
import type { User } from "@/lib/types";
import { canStartUserMutation, getAdminUsersViewState, getPageAfterUserFilterChange } from "@/lib/admin-users-state";

const COMPANY_ROLE_CODES = ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"] as const;
const USER_STATUSES: UserStatus[] = ["ACTIVE", "PENDING", "INVITED", "SUSPENDED", "LOCKED", "DISABLED"];

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string>();
  const [companySearch, setCompanySearch] = useState("");
  const [search, setSearch] = useState("");
  const [roleCode, setRoleCode] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState<CreateUserInput>({ fullName: "", email: "", password: "", roleCode: "SALES_REP" });

  const { data: companies } = useQuery({ queryKey: ["admin", "companies", "picker", companySearch], queryFn: () => companiesApi.list(1, 100, companySearch || undefined) });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: rolesApi.list });
  const { data: users, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "users", companyId, page, search, roleCode, status],
    queryFn: () => usersApi.list(page, 20, companyId, { search: search || undefined, roleCode: roleCode === "all" ? undefined : roleCode as CreateUserInput["roleCode"], status: status === "all" ? undefined : status as UserStatus }),
    enabled: Boolean(companyId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "users", companyId] });
  const createMutation = useMutation({
    mutationFn: () => usersApi.create({ ...form, email: form.email.trim().toLowerCase() }, companyId),
    onSuccess: async () => { toast.success("User created. They must change the temporary password on first sign-in."); setCreateOpen(false); setForm({ fullName: "", email: "", password: "", roleCode: "SALES_REP" }); await invalidate(); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not create user"),
  });
  const updateMutation = useMutation({
    mutationFn: () => { if (!editing) throw new Error("No user selected"); return usersApi.update(editing.id, { fullName: editing.fullName, roleCode: editing.role.code as CreateUserInput["roleCode"], status: editing.status }, companyId); },
    onSuccess: async () => { setEditing(null); await invalidate(); toast.success("User updated"); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update user"),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => enabled ? usersApi.enable(id, companyId) : usersApi.disable(id, companyId),
    onSuccess: invalidate,
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update user"),
  });
  const resetMutation = useMutation({
    mutationFn: (id: string) => authApi.resetPassword(id),
    onSuccess: (result, id) => { const email = users?.items.find((item) => item.id === id)?.email ?? ""; setTemporaryPassword({ email, password: result.temporaryPassword }); toast.success("Temporary password generated"); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not reset password"),
  });

  function chooseCompany(id: string) { setCompanyId(id); setPage(getPageAfterUserFilterChange()); }
  const hasFilters = Boolean(search.trim()) || roleCode !== "all" || status !== "all";
  const viewState = getAdminUsersViewState({ companyId, isLoading, isError, total: users?.total, hasFilters });
  const companyRoles = roles?.filter((role) => COMPANY_ROLE_CODES.includes(role.code as typeof COMPANY_ROLE_CODES[number]));

  return <div className="relative space-y-6">
    <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
    <div className="rise-in flex items-center justify-between gap-4"><div className="flex items-center gap-4"><span className="crystal-badge hidden h-14 w-14 bg-primary/15 text-primary sm:flex"><Users className="h-6 w-6" /></span><div><h1 className="text-2xl font-semibold">Users</h1><p className="text-muted-foreground">Manage users inside the selected company.</p></div></div><Button disabled={!companyId || createMutation.isPending} onClick={() => setCreateOpen(true)}><UserPlus className="h-4 w-4" /> Create user</Button></div>
    <div className="glass-card grid gap-3 p-4 md:grid-cols-4"><Input placeholder="Search companies..." value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} /><Select value={companyId} onValueChange={chooseCompany}><SelectTrigger><SelectValue placeholder="Select a company" /></SelectTrigger><SelectContent>{companies?.items.map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}</SelectContent></Select>{companyId && <><Input placeholder="Search name or email..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(getPageAfterUserFilterChange()); }} /><div className="flex gap-2"><Select value={roleCode} onValueChange={(value) => { setRoleCode(value); setPage(getPageAfterUserFilterChange()); }}><SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{companyRoles?.map((role) => <SelectItem key={role.id} value={role.code}>{role.name}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={(value) => { setStatus(value); setPage(getPageAfterUserFilterChange()); }}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{USER_STATUSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div></>}</div>
    {temporaryPassword && <div className="glass-card space-y-2 border-primary/50 p-4"><p className="font-medium">Temporary password for {temporaryPassword.email}</p><code className="block break-all rounded bg-secondary p-2">{temporaryPassword.password}</code><p className="text-sm text-muted-foreground">Copy it now. It is shown once only; the user must change it at first sign-in.</p><div className="flex gap-2"><Button size="sm" onClick={() => navigator.clipboard.writeText(temporaryPassword.password).then(() => toast.success("Copied"))}>Copy</Button><Button size="sm" variant="outline" onClick={() => setTemporaryPassword(null)}>Dismiss</Button></div></div>}
    <div className="glass-hero p-6"><h2 className="mb-4 font-semibold">Members</h2>{viewState === "select-company" ? <p className="text-sm text-muted-foreground">Choose a company to manage its users.</p> : viewState === "loading" ? <p className="text-sm text-muted-foreground">Loading users…</p> : viewState === "error" ? <div className="space-y-3"><p className="text-sm text-destructive">{error instanceof ApiError ? error.message : "Could not load users. Please try again."}</p><Button variant="outline" onClick={() => refetch()}>Retry</Button></div> : viewState === "empty" ? <p className="text-sm text-muted-foreground">This company has no users yet.</p> : viewState === "no-results" ? <p className="text-sm text-muted-foreground">No users match the current search or filters.</p> : <><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead /></TableRow></TableHeader><TableBody>{users?.items.map((member) => <TableRow key={member.id}><TableCell><div className="font-medium">{member.fullName}</div><div className="text-xs text-muted-foreground">{member.email}</div></TableCell><TableCell>{member.role.name}</TableCell><TableCell><Badge variant="outline">{member.status}</Badge></TableCell><TableCell>{formatDate(member.createdAt)}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!canStartUserMutation(updateMutation.isPending)} onClick={() => setEditing(member)}>Edit</DropdownMenuItem><DropdownMenuItem disabled={!canStartUserMutation(resetMutation.isPending)} onClick={() => { if (canStartUserMutation(resetMutation.isPending)) resetMutation.mutate(member.id); }}>{resetMutation.isPending ? "Resetting…" : "Reset password"}</DropdownMenuItem><DropdownMenuItem disabled={!canStartUserMutation(toggleMutation.isPending)} onClick={() => { if (canStartUserMutation(toggleMutation.isPending)) toggleMutation.mutate({ id: member.id, enabled: member.status !== "ACTIVE" }); }}>{toggleMutation.isPending ? "Updating…" : member.status === "ACTIVE" ? "Disable" : "Enable"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table>{users && <Pagination page={users.page} pageSize={users.pageSize} total={users.total} onChange={setPage} />}</>}</div>
    <Dialog open={createOpen} onOpenChange={(open) => { if (!createMutation.isPending) setCreateOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Create company user</DialogTitle></DialogHeader><div className="space-y-3"><Label>Name<Input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></Label><Label>Email<Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Label><Label>Temporary password<Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Label><Label>Role<Select value={form.roleCode} onValueChange={(value) => setForm({ ...form, roleCode: value as CreateUserInput["roleCode"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{companyRoles?.map((role) => <SelectItem key={role.id} value={role.code}>{role.name}</SelectItem>)}</SelectContent></Select></Label></div><DialogFooter><Button disabled={createMutation.isPending} onClick={() => { if (canStartUserMutation(createMutation.isPending)) createMutation.mutate(); }}>{createMutation.isPending ? "Creating…" : "Create"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !updateMutation.isPending) setEditing(null); }}><DialogContent>{editing && <><DialogHeader><DialogTitle>Edit user</DialogTitle></DialogHeader><div className="space-y-3"><Label>Name<Input value={editing.fullName} onChange={(event) => setEditing({ ...editing, fullName: event.target.value })} /></Label><Label>Role<Select value={editing.role.code} onValueChange={(value) => setEditing({ ...editing, role: { ...editing.role, code: value as User["role"]["code"] } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{companyRoles?.map((role) => <SelectItem key={role.id} value={role.code}>{role.name}</SelectItem>)}</SelectContent></Select></Label><Label>Status<Select value={editing.status} onValueChange={(value) => setEditing({ ...editing, status: value as UserStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{USER_STATUSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Label></div><DialogFooter><Button disabled={updateMutation.isPending} onClick={() => { if (canStartUserMutation(updateMutation.isPending)) updateMutation.mutate(); }}>{updateMutation.isPending ? "Saving…" : "Save changes"}</Button></DialogFooter></>}</DialogContent></Dialog>
  </div>;
}