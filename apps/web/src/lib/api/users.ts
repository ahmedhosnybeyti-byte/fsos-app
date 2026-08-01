import type { CreateUserInput, RoleCode, UpdateUserInput, UserStatus } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Paginated, User } from "../types";

export type UserListFilters = { search?: string; roleCode?: Exclude<RoleCode, "SUPER_ADMIN">; status?: UserStatus };

export const usersApi = {
  list: (page: number, pageSize = 20, companyId?: string, filters: UserListFilters = {}) =>
    apiFetch<Paginated<User>>("/users", { query: { page, pageSize, companyId, ...filters } }),
  create: (input: CreateUserInput, companyId?: string) =>
    apiFetch<User>("/users", { method: "POST", body: input, query: { companyId } }),
  update: (id: string, input: UpdateUserInput, companyId?: string) =>
    apiFetch<User>(`/users/${id}`, { method: "PATCH", body: input, query: { companyId } }),
  disable: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}/disable`, { method: "POST", query: { companyId } }),
  enable: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}/enable`, { method: "POST", query: { companyId } }),
  remove: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}`, { method: "DELETE", query: { companyId } }),
};