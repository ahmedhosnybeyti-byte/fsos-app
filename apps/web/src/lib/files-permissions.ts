import type { RoleCode } from "@field-sales-os/schemas";

// SUPER_ADMIN retains the existing explicit target-company upload path. Only
// a Company's own administrator can expose replace/delete controls.
export function canUploadSourceFiles(roleCode: RoleCode | undefined): boolean {
  return roleCode === "COMPANY_ADMIN" || roleCode === "SUPER_ADMIN";
}

export function canManageCompanySourceFiles(roleCode: RoleCode | undefined): boolean {
  return roleCode === "COMPANY_ADMIN";
}
