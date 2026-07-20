import type { CreateUserInput, UpdateUserInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Paginated, User } from "../types";

export const usersApi = {
  list: (page: number, pageSize = 20, companyId?: string) =>
    apiFetch<Paginated<User>>("/users", { query: { page, pageSize, companyId } }),
  // companyId is only required for SUPER_ADMIN callers (the admin console);
  // COMPANY_ADMIN callers omit it and the backend scopes to their own company.
  create: (input: CreateUserInput, companyId?: string) =>
    apiFetch<User>("/users", { method: "POST", body: input, query: { companyId } }),
  update: (id: string, input: UpdateUserInput, companyId?: string) =>
    apiFetch<User>(`/users/${id}`, { method: "PATCH", body: input, query: { companyId } }),
  disable: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}/disable`, { method: "POST", query: { companyId } }),
  enable: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}/enable`, { method: "POST", query: { companyId } }),
  // Soft delete — ARCHIVED + sessions revoked + hidden from the list. No
  // self-delete / no deleting admins (enforced server-side).
  remove: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}`, { method: "DELETE", query: { companyId } }),
};
