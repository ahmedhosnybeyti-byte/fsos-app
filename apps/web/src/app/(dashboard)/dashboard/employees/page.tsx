"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, IdCard } from "lucide-react";
import { toast } from "sonner";
import { createEmployeeSchema, updateEmployeeSchema, EMPLOYMENT_STATUSES, type CreateEmployeeInput, type UpdateEmployeeInput } from "@field-sales-os/schemas";
import { branchesApi, employeesApi, usersApi } from "@/lib/api";
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
import { formatDate } from "@/lib/utils";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { Employee } from "@/lib/types";

const STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  DRAFT: "employees.statusDraft",
  ACTIVE: "employees.statusActive",
  ON_LEAVE: "employees.statusOnLeave",
  SUSPENDED: "employees.statusSuspended",
  INACTIVE: "employees.statusInactive",
  ARCHIVED: "employees.statusArchived",
};

// Semantic glow per Constitution — success (active), warning (draft/on
// leave), critical (suspended), and a neutral/no-glow fallback for
// inactive/archived employees. Mirrors the Team screen's status mapping.
const STATUS_GLOW: Record<string, "glow-success" | "glow-warning" | "glow-critical" | ""> = {
  DRAFT: "glow-warning",
  ACTIVE: "glow-success",
  ON_LEAVE: "glow-warning",
  SUSPENDED: "glow-critical",
  INACTIVE: "",
  ARCHIVED: "",
};

export default function EmployeesPage() {
  // Matches the sidebar's own visibility rule for this link (dashboard
  // layout.tsx only lists it for COMPANY_ADMIN) — this is a client-side
  // convenience guard only; the real boundary is each write endpoint's
  // own @Auth("COMPANY_ADMIN") check.
  const { user, isLoading: authLoading } = useRequireAuth(["COMPANY_ADMIN"]);
  const { t } = useTranslation();

  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const { data: employees, isLoading } = useQuery({ queryKey: ["employees"], queryFn: () => employeesApi.list(), enabled: !!user });
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: branchesApi.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: () => usersApi.list(1, 100) });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateEmployeeInput>({ resolver: zodResolver(createEmployeeSchema) });

  const createMutation = useMutation({
    mutationFn: employeesApi.create,
    onSuccess: async () => {
      toast.success(t("employees.toastEmployeeCreated"));
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      reset();
      setOpen(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("employees.toastEmployeeCreateError")),
  });

  // Edit dialog — the backend's PATCH endpoint and updateEmployeeSchema
  // already support all of these fields (used partially by the inline org
  // unit/manager Selects below); this is just the missing UI for the rest
  // (name/job title/contact info/hire date/status), no backend change.
  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    setValue: setEditValue,
    watch: watchEdit,
    formState: { errors: editErrors },
  } = useForm<UpdateEmployeeInput>({ resolver: zodResolver(updateEmployeeSchema) });

  function openEdit(employee: Employee) {
    setEditingEmployee(employee);
    resetEdit({
      fullName: employee.fullName,
      jobTitle: employee.jobTitle,
      contactEmail: employee.contactEmail,
      contactPhone: employee.contactPhone,
      hireDate: employee.hireDate ? employee.hireDate.slice(0, 10) : null,
      status: employee.status,
    });
  }

  const editMutation = useMutation({
    mutationFn: (values: UpdateEmployeeInput) => employeesApi.update(editingEmployee!.id, values),
    onSuccess: async () => {
      toast.success(t("employees.toastEmployeeUpdated"));
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditingEmployee(null);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("employees.toastEmployeeUpdateError")),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => employeesApi.archive(id),
    onSuccess: async () => {
      toast.success(t("employees.toastEmployeeArchived"));
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("employees.toastEmployeeArchiveError")),
  });

  const assignOrgUnitMutation = useMutation({
    mutationFn: ({ id, orgUnitId }: { id: string; orgUnitId: string | null }) => employeesApi.update(id, { orgUnitId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("employees.toastBranchUpdateError")),
  });

  const assignManagerMutation = useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) => employeesApi.update(id, { managerId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("employees.toastManagerUpdateError")),
  });

  const linkUserMutation = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => employeesApi.linkUser(id, { userId }),
    onSuccess: async () => {
      toast.success(t("employees.toastUserLinked"));
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("employees.toastLinkError")),
  });

  const unlinkUserMutation = useMutation({
    mutationFn: (id: string) => employeesApi.unlinkUser(id),
    onSuccess: async () => {
      toast.success(t("employees.toastUnlinked"));
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("employees.toastUnlinkError")),
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

      <div className="rise-in flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
            <IdCard className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("employees.title")}</h1>
            <p className="text-muted-foreground">{t("employees.subtitle")}</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <IdCard className="h-4 w-4" /> {t("employees.addEmployee")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("employees.addEmployeeDialogTitle")}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleSubmit((values) => createMutation.mutate(values))}>
              <div className="space-y-2">
                <Label htmlFor="employeeCode">{t("employees.employeeCodeLabel")}</Label>
                <Input id="employeeCode" {...register("employeeCode")} />
                {errors.employeeCode && <p className="text-xs text-destructive">{errors.employeeCode.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("employees.fullNameLabel")}</Label>
                <Input id="fullName" {...register("fullName")} />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="jobTitle">{t("employees.jobTitleLabel")}</Label>
                <Input id="jobTitle" {...register("jobTitle")} />
              </div>
              <div className="space-y-2">
                <Label>{t("employees.branchLabel")}</Label>
                <Select value={watch("orgUnitId") ?? "none"} onValueChange={(v) => setValue("orgUnitId", v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("employees.noBranch")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("employees.noBranch")}</SelectItem>
                    {branches?.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("employees.managerLabel")}</Label>
                <Select value={watch("managerId") ?? "none"} onValueChange={(v) => setValue("managerId", v === "none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("employees.noManagerDialog")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("employees.noManagerDialog")}</SelectItem>
                    {employees?.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactEmail">{t("employees.contactEmailLabel")}</Label>
                <Input id="contactEmail" type="email" {...register("contactEmail")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">{t("employees.contactPhoneLabel")}</Label>
                <Input id="contactPhone" {...register("contactPhone")} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Spinner />}
                  {t("employees.addEmployeeSubmit")}
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
            <IdCard className="h-5 w-5" />
          </span>
          {t("employees.recordTitle")}
        </h3>
        <p className="relative mt-1 text-sm text-muted-foreground">{t("employees.recordDescription")}</p>
        <div className="relative mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("employees.loading")}</p>
          ) : !employees || employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("employees.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("employees.codeHeader")}</TableHead>
                  <TableHead>{t("employees.nameHeader")}</TableHead>
                  <TableHead>{t("employees.jobTitleHeader")}</TableHead>
                  <TableHead>{t("employees.branchHeader")}</TableHead>
                  <TableHead>{t("employees.managerHeader")}</TableHead>
                  <TableHead>{t("employees.linkedAccountHeader")}</TableHead>
                  <TableHead>{t("employees.statusHeader")}</TableHead>
                  <TableHead>{t("employees.hireDateHeader")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="text-muted-foreground">{employee.employeeCode}</TableCell>
                    <TableCell className="font-medium">{employee.fullName}</TableCell>
                    <TableCell>{employee.jobTitle ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={employee.orgUnitId ?? "none"}
                        onValueChange={(value) =>
                          assignOrgUnitMutation.mutate({ id: employee.id, orgUnitId: value === "none" ? null : value })
                        }
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue placeholder={t("employees.noBranch")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("employees.noBranch")}</SelectItem>
                          {branches?.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={employee.managerId ?? "none"}
                        onValueChange={(value) =>
                          assignManagerMutation.mutate({ id: employee.id, managerId: value === "none" ? null : value })
                        }
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue placeholder={t("employees.noManagerRow")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("employees.noManagerRow")}</SelectItem>
                          {employees
                            .filter((candidate) => candidate.id !== employee.id)
                            .map((candidate) => (
                              <SelectItem key={candidate.id} value={candidate.id}>
                                {candidate.fullName}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {employee.userId
                        ? users?.items.find((u) => u.id === employee.userId)?.email ?? t("employees.linked")
                        : t("employees.notLinked")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`border-transparent ${STATUS_GLOW[employee.status] || "bg-secondary/60 text-muted-foreground"}`}
                      >
                        {t(STATUS_LABEL_KEY[employee.status] ?? "employees.statusDraft")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {employee.hireDate ? formatDate(employee.hireDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(employee)}>{t("employees.editData")}</DropdownMenuItem>
                          {employee.userId ? (
                            <DropdownMenuItem onClick={() => unlinkUserMutation.mutate(employee.id)}>
                              {t("employees.unlinkAccount")}
                            </DropdownMenuItem>
                          ) : (
                            users?.items
                              .filter((u) => u.email)
                              .slice(0, 20)
                              .map((u) => (
                                <DropdownMenuItem
                                  key={u.id}
                                  onClick={() => linkUserMutation.mutate({ id: employee.id, userId: u.id })}
                                >
                                  {t("employees.linkAccount", { email: u.email })}
                                </DropdownMenuItem>
                              ))
                          )}
                          {employee.status !== "ARCHIVED" && (
                            <DropdownMenuItem onClick={() => archiveMutation.mutate(employee.id)}>
                              {t("employees.archive")}
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
        </div>
      </div>

      <Dialog open={!!editingEmployee} onOpenChange={(v) => !v && setEditingEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("employees.editDialogTitle", { name: editingEmployee?.fullName ?? "" })}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleEditSubmit((values) => editMutation.mutate(values))}>
            <div className="space-y-2">
              <Label htmlFor="editFullName">{t("employees.fullNameLabel")}</Label>
              <Input id="editFullName" {...registerEdit("fullName")} />
              {editErrors.fullName && <p className="text-xs text-destructive">{editErrors.fullName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="editJobTitle">{t("employees.jobTitleLabel")}</Label>
              <Input id="editJobTitle" {...registerEdit("jobTitle")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editContactEmail">{t("employees.contactEmailLabel")}</Label>
              <Input id="editContactEmail" type="email" {...registerEdit("contactEmail")} />
              {editErrors.contactEmail && <p className="text-xs text-destructive">{editErrors.contactEmail.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="editContactPhone">{t("employees.contactPhoneLabel")}</Label>
              <Input id="editContactPhone" {...registerEdit("contactPhone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editHireDate">{t("employees.hireDateLabel")}</Label>
              <Input id="editHireDate" type="date" {...registerEdit("hireDate")} />
            </div>
            <div className="space-y-2">
              <Label>{t("employees.statusLabel")}</Label>
              <Select value={watchEdit("status")} onValueChange={(v) => setEditValue("status", v as UpdateEmployeeInput["status"])}>
                <SelectTrigger>
                  <SelectValue placeholder={t("employees.statusLabel")} />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(STATUS_LABEL_KEY[status] ?? "employees.statusDraft")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending && <Spinner />}
                {t("employees.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
