import type {
  CreateEmployeeInput,
  LinkEmployeeUserInput,
  UpdateEmployeeInput,
} from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Employee, EmployeeContext, EmployeeExportResult, ExportableEmployee } from "../types";

// Phase 5: Employee Management — reference/structural data only, no
// operational relationships (Route/Target/Customer linkage stays out of
// scope here, deferred to a future Relationship Intelligence Engine).
export const employeesApi = {
  list: (params?: { status?: string; orgUnitId?: string }) =>
    apiFetch<Employee[]>("/companies/me/employees", { query: params }),
  get: (id: string) => apiFetch<Employee>(`/companies/me/employees/${id}`),
  getContext: (id: string) => apiFetch<EmployeeContext>(`/companies/me/employees/${id}/context`),
  // Per-Employee Scoped Excel Export — server computes and filters every
  // sheet already (see employee-export.service.ts); this call gets back
  // ready-to-write JSON, the caller (employees/page.tsx) just builds the
  // .xlsx client-side from it, same pattern as every other Excel export in
  // this app (Visit Efficiency, Team Performance, Route Planning).
  export: (id: string, dateRange?: { fromDate?: string; toDate?: string }) =>
    apiFetch<EmployeeExportResult>(`/companies/me/employees/${id}/export`, { query: dateRange }),
  // Scoped picker list for the Files screen's "Employee Exports" section —
  // server has already filtered this to only employees the caller may
  // export (see EmployeeExportService.listExportableEmployees).
  listExportable: () => apiFetch<ExportableEmployee[]>("/companies/me/employees/exportable"),
  // One-off backfill for companies whose Employees sheet was uploaded before
  // auto-provisioning existed — re-syncs the Employee registry from the
  // currently uploaded Employees dataset without requiring a re-upload.
  resyncFromUpload: () =>
    apiFetch<{ processed: number; available: boolean }>("/companies/me/employees/resync-from-upload", { method: "POST" }),
  create: (input: CreateEmployeeInput) =>
    apiFetch<Employee>("/companies/me/employees", { method: "POST", body: input }),
  update: (id: string, input: UpdateEmployeeInput) =>
    apiFetch<Employee>(`/companies/me/employees/${id}`, { method: "PATCH", body: input }),
  archive: (id: string) => apiFetch<Employee>(`/companies/me/employees/${id}/archive`, { method: "POST" }),
  linkUser: (id: string, input: LinkEmployeeUserInput) =>
    apiFetch<Employee>(`/companies/me/employees/${id}/link-user`, { method: "POST", body: input }),
  unlinkUser: (id: string) => apiFetch<Employee>(`/companies/me/employees/${id}/unlink-user`, { method: "POST" }),
};
