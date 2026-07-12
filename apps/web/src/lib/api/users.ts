import type { CreateUserInput, UpdateUserInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Paginated, User } from "../types";

export const usersApi = {
  list: (page: number, pageSize = 20, companyId?: string) =>
    apiFetch<Paginated<User>>("/users", { query: { page, pageSize, companyId } }),
  create: (input: CreateUserInput) => apiFetch<User>("/users", { method: "POST", body: input }),
  update: (id: string, input: UpdateUserInput) => apiFetch<User>(`/users/${id}`, { method: "PATCH", body: input }),
  disable: (id: string) => apiFetch<User>(`/users/${id}/disable`, { method: "POST" }),
  enable: (id: string) => apiFetch<User>(`/users/${id}/enable`, { method: "POST" }),
};
