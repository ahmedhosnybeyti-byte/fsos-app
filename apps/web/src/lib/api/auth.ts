import type { ChangePasswordInput, ResetPasswordResult } from "@field-sales-os/schemas";
import type { LoginInput, RegisterInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { User } from "../types";

export const authApi = {
  register: (input: RegisterInput) => apiFetch<{ user: User }>("/auth/register", { method: "POST", body: input }),
  login: (input: LoginInput) => apiFetch<{ user: User }>("/auth/login", { method: "POST", body: input }),
  logout: () => apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<User>("/auth/me"),
  // Phase 4: Identity Platform password/session actions.
  changePassword: (input: ChangePasswordInput) =>
    apiFetch<{ success: boolean }>("/auth/change-password", { method: "POST", body: input }),
  resetPassword: (userId: string) =>
    apiFetch<ResetPasswordResult>(`/auth/users/${userId}/reset-password`, { method: "POST" }),
  revokeSessions: (userId: string) =>
    apiFetch<{ success: boolean }>(`/auth/users/${userId}/revoke-sessions`, { method: "POST" }),
};
