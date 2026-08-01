import type { RoleCode } from "@field-sales-os/schemas";

export function getPostLoginPath(roleCode: RoleCode): "/admin" | "/dashboard" {
  return roleCode === "SUPER_ADMIN" ? "/admin" : "/dashboard";
}