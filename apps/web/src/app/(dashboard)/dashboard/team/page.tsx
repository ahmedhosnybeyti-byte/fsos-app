"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { createUserSchema, type CreateUserInput, type UserStatus } from "@field-sales-os/schemas";
import { authApi, branchesApi, rolesApi, usersApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/shell/pagination";
import { formatDate } from "@/lib/utils";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

const STATUS_LABEL_KEY: Record<UserStatus, TranslationKey> = {
  PENDING: "team.statusPending",
  ACTIVE: "team.statusActive",
  INVITED: "team.statusInvited",
  SUSPENDED: "team.statusSuspended",
  LOCKED: "team.statusLocked",
  DISABLED: "team.statusDisabled",
  ARCHIVED: "team.statusArchived",
};

// Semantic glow per Constitution — success (active), warning (pending/
// invited), critical (suspended/locked), and a neutral/no-glow fallback
// for disabled/archived members.
const STATUS_GLOW: Record<UserStatus, "glow-success" | "glow-warning" | "glow-critical" | ""> = {
  PENDING: "glow-warning",
  ACTIVE: "glow-success",
  INVITED: "glow-warning",
  SUSPENDED: "glow-critical",
  LOCKED: "glow-critical",
  DISABLED: "",
  ARCHIVED: "",
};

export default function TeamPage() {
  // Matches the sidebar's own visibility rule for this link (dashboard
  // layout.tsx only lists it for COMPANY_ADMIN) — this is a client-side
  // convenience guard only; the real boundary is each write endpoint's own
  // @Auth("COMPANY_ADMIN") check.
  const { user, isLoading: authLoading } = useRequireAuth(["COMPANY_ADMIN"]);
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: users, isLoading } = useQuery({
    queryKey: ["users", page],
    queryFn: () => usersApi.list(page, pageSize),
    enabled: !!user,
  });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: rolesApi.list });
  // Phase 4: "Organizational Unit" on the User Profile — reuses Phase 2/3's
  // Branch structure, no new org data model needed.
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: branchesApi.list });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateUserInput>({ resolver: zodResolver(createUserSchema) });

  const createMutation = useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess: async () => {
      toast.success(t("team.toastUserInvited"));
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      reset();
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("team.toastUserCreateError")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) => (enable ? usersApi.enable(id) : usersApi.disable(id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("team.toastUserUpdateError")),
  });

  const assignBranchMutation = useMutation({
    mutationFn: ({ id, orgUnitId }: { id: string; orgUnitId: string | null }) => usersApi.update(id, { orgUnitId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("team.toastBranchUpdateError")),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => authApi.resetPassword(id),
    onSuccess: (result, id) => {
      const email = users?.items.find((u) => u.id === id)?.email ?? "";
      setTempPassword({ email, password: result.temporaryPassword });
      toast.success(t("team.toastTempPasswordCreated"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("team.toastPasswordResetError")),
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: (id: string) => authApi.revokeSessions(id),
    onSuccess: () => toast.success(t("team.toastSessionsRevoked")),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("team.toastSessionsRevokeError")),
  });

  // "حذف مستخدم" — soft delete server-side (ARCHIVED + sessions revoked,
  // vanishes from this list). Guard rails (no self-delete, no deleting
  // admins) are enforced by the backend; the confirm() here is only a
  // last-chance mis-click check.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: async () => {
      toast.success(t("team.toastUserDeleted"));
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("team.toastUserDeleteError")),
  });

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      {tempPassword && (
        <div className="glass-card rise-in space-y-2 border-primary/50 p-6">
          <h3 className="text-base font-semibold leading-none tracking-tight">
            {t("team.tempPasswordTitle", { email: tempPassword.email })}
          </h3>
          <code className="block break-all rounded-md border border-border bg-secondary/40 p-3 text-sm">
            {tempPassword.password}
          </code>
          <p className="text-xs text-muted-foreground">{t("team.tempPasswordNote")}</p>
          <Button variant="outline" size="sm" onClick={() => setTempPassword(null)}>
            {t("team.tempPasswordAck")}
          </Button>
        </div>
      )}

      <div className="rise-in flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
            <Users className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("team.title")}</h1>
            <p className="text-muted-foreground">{t("team.subtitle")}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4" /> {t("team.addUser")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("team.addUserDialogTitle")}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={handleSubmit((values) => createMutation.mutate(values))}
            >
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("team.fullNameLabel")}</Label>
                <Input id="fullName" {...register("fullName")} />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("team.emailLabel")}</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>{t("team.roleLabel")}</Label>
                <Select value={watch("roleCode")} onValueChange={(value) => setValue("roleCode", value as CreateUserInput["roleCode"])}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("team.chooseRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles?.map((role) => (
                      <SelectItem key={role.id} value={role.code}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.roleCode && <p className="text-xs text-destructive">{errors.roleCode.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("team.tempPasswordLabel")}</Label>
                <Input id="password" type="password" {...register("password")} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Spinner />}
                  {t("team.createUser")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-hero rise-in rise-d1 relative p-6">
        <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
        <h3 className="relative flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight">
          <span className="crystal-badge h-11 w-11 bg-primary/15 text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <Users className="h-5 w-5" />
          </span>
          {t("team.members")}
        </h3>
        <div className="relative mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("team.loading")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("team.nameHeader")}</TableHead>
                  <TableHead>{t("team.roleHeader")}</TableHead>
                  <TableHead>{t("team.branchHeader")}</TableHead>
                  <TableHead>{t("team.statusHeader")}</TableHead>
                  <TableHead>{t("team.joinedHeader")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.items.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium">{member.fullName}</div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </TableCell>
                    <TableCell>{member.role.name}</TableCell>
                    <TableCell>
                      <Select
                        value={member.orgUnitId ?? "none"}
                        onValueChange={(value) =>
                          assignBranchMutation.mutate({ id: member.id, orgUnitId: value === "none" ? null : value })
                        }
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder={t("team.noBranch")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("team.noBranch")}</SelectItem>
                          {branches?.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`border-transparent ${STATUS_GLOW[member.status] || "bg-secondary/60 text-muted-foreground"}`}
                      >
                        {t(STATUS_LABEL_KEY[member.status] ?? "team.statusPending")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(member.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {member.status === "ACTIVE" ? (
                            <DropdownMenuItem onClick={() => toggleMutation.mutate({ id: member.id, enable: false })}>
                              {t("team.disable")}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => toggleMutation.mutate({ id: member.id, enable: true })}>
                              {t("team.enable")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => resetPasswordMutation.mutate(member.id)}>
                            {t("team.resetPassword")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => revokeSessionsMutation.mutate(member.id)}>
                            {t("team.revokeSessions")}
                          </DropdownMenuItem>
                          {member.role.code !== "COMPANY_ADMIN" && member.role.code !== "SUPER_ADMIN" && member.id !== user.id && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (window.confirm(t("team.deleteConfirm", { email: member.email }))) {
                                  deleteMutation.mutate(member.id);
                                }
                              }}
                            >
                              {t("team.delete")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {users && <Pagination page={page} total={users.total} pageSize={users.pageSize} onChange={setPage} />}
        </div>
      </div>
    </div>
  );
}
