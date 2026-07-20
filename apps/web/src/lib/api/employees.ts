import type {
  CreateEmployeeInput,
  LinkEmployeeUserInput,
  UpdateEmployeeInput,
} from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Employee, EmployeeContext } from "../types";

// Phase 5: Employee Management — reference/structural data only, no
// operational relationships (Route/Target/Customer linkage stays out of
// scope here, deferred to a future Relationship Intelligence Engine).
export const employeesApi = {
  list: (params?: { status?: string; orgUnitId?: string }) =>
    apiFetch<Employee[]>("/companies/me/employees", { query: params }),
  get: (id: string) => apiFetch<Employee>(`/companies/me/employees/${id}`),
  getContext: (id: string) => apiFetch<EmployeeContext>(`/companies/me/employees/${id}/context`),
  create: (input: CreateEmployeeInput) =>
    apiFetch<Employee>("/companies/me/employees", { method: "POST", body: input }),
  update: (id: string, input: UpdateEmployeeInput) =>
    apiFetch<Employee>(`/companies/me/employees/${id}`, { method: "PATCH", body: input }),
  archive: (id: string) => apiFetch<Employee>(`/companies/me/employees/${id}/archive`, { method: "POST" }),
  linkUser: (id: string, input: LinkEmployeeUserInput) =>
    apiFetch<Employee>(`/companies/me/employees/${id}/link-user`, { method: "POST", body: input }),
  unlinkUser: (id: string) => apiFetch<Employee>(`/companies/me/employees/${id}/unlink-user`, { method: "POST" }),
};
