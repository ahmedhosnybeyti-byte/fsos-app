import type { CreateUserInput, RoleCode, RouteAssignmentEndReason, UpdateUserInput, UserStatus } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Paginated, User } from "../types";

export type UserRouteAssignment = { id: string; routeId: string; startedAt: string; endedAt: string | null; endReason: RouteAssignmentEndReason | null };
export type UserRouteAssignmentDetails = { current: UserRouteAssignment | null; history: UserRouteAssignment[]; routes: Array<{ id: string; name: string | null }> };

export type UserListFilters = { search?: string; roleCode?: Exclude<RoleCode, "SUPER_ADMIN">; status?: UserStatus };

export const usersApi = {
  list: (page: number, pageSize = 20, companyId?: string, filters: UserListFilters = {}) =>
    apiFetch<Paginated<User>>("/users", { query: { page, pageSize, companyId, ...filters } }),
  create: (input: CreateUserInput, companyId?: string) =>
    apiFetch<User>("/users", { method: "POST", body: input, query: { companyId } }),
  updateEmail: (id: string, email: string) => apiFetch<User>(`/users/${id}/email`, { method: "PATCH", body: { email } }),
  update: (id: string, input: UpdateUserInput, companyId?: string) =>
    apiFetch<User>(`/users/${id}`, { method: "PATCH", body: input, query: { companyId } }),
  disable: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}/disable`, { method: "POST", query: { companyId } }),
  enable: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}/enable`, { method: "POST", query: { companyId } }),
  remove: (id: string, companyId?: string) => apiFetch<User>(`/users/${id}`, { method: "DELETE", query: { companyId } }),
  routeAssignment: (id: string, companyId?: string) => apiFetch<UserRouteAssignmentDetails>(`/users/${id}/route-assignment`, { query: { companyId } }),
  assignRoute: (id: string, routeId: string, companyId?: string) => apiFetch<UserRouteAssignment>(`/users/${id}/route-assignment`, { method: "POST", body: { routeId }, query: { companyId } }),
  unassignRoute: (id: string, companyId?: string) => apiFetch<UserRouteAssignment | null>(`/users/${id}/route-assignment`, { method: "DELETE", body: { reason: "UNASSIGNED" }, query: { companyId } }),
};