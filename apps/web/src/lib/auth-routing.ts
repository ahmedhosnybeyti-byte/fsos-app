import type { RoleCode } from "@field-sales-os/schemas";

export function getPostLoginPath(roleCode: RoleCode, mustChangePassword = false): "/account" | "/admin" | "/dashboard" | "/sfa/warehouse" | "/sfa/accounting" | "/sfa/procurement" {
  if (mustChangePassword) return "/account";
  if (roleCode === "WAREHOUSE_KEEPER" || roleCode === "WAREHOUSE_MANAGER") return "/sfa/warehouse";
  if (roleCode === "ACCOUNTANT") return "/sfa/accounting";
  if (roleCode === "PROCUREMENT") return "/sfa/procurement";
  return roleCode === "SUPER_ADMIN" ? "/admin" : "/dashboard";
}
