import type { RoleCode } from "@field-sales-os/schemas";

export function getPostLoginPath(roleCode: RoleCode, mustChangePassword = false): "/account" | "/admin" | "/dashboard" {
  if (mustChangePassword) return "/account";
  return roleCode === "SUPER_ADMIN" ? "/admin" : "/dashboard";
}