import { apiFetch } from "../api-client";
import type { Role } from "../types";

export interface RolePermissions extends Role {
  permissions: string[];
}

export const rolesApi = {
  list: () => apiFetch<Role[]>("/roles"),
  permissionsMatrix: () => apiFetch<RolePermissions[]>("/roles/permissions-matrix"),
};
