/** Separate operational duties from company administration. Permissions still
 * apply independently; this policy never grants a capability. */
export const specialistRoleCodes = ["WAREHOUSE_KEEPER", "ACCOUNTANT", "PROCUREMENT"] as const;
export function isSpecialistRole(role: string): boolean {
  return (specialistRoleCodes as readonly string[]).includes(role);
}
const adminReadPermissions = ["sfa.access", "wms.read", "procurement.read", "accounting.read", "accounting.treasury.read"];
const sensitive = (p: string) => /^(wms\.|accounting\.|procurement\.)/.test(p) || p === "sales.price-exceptions.accounting";
export function hasOperationalPermissions(role: string, permissions: readonly string[] | undefined, required: readonly string[]): boolean {
  if (role === "COMPANY_ADMIN" && permissions?.includes("sfa.access") && permissions.includes("erp.admin.read") && required.every(p => adminReadPermissions.includes(p))) return true;
  return required.every(p => permissions?.includes(p));
}
export function permitsOperationalRole(role: string, required: readonly string[], request?: { method?: string; path?: string }): boolean {
  if (role === "COMPANY_ADMIN") {
    if (!required.some(sensitive)) return true;
    const path = (request?.path ?? "").split("?")[0]!.replace(/^\/api\/v1(?=\/)/, "");
    return request?.method === "GET" && required.every(p => adminReadPermissions.includes(p)) && (
      path === "/sfa/wms/warehouses" || /^\/sfa\/wms\/warehouses\/[^/]+\/(summary|products|batches)$/.test(path)
      || /^\/sfa\/procurement\/warehouses\/[^/]+\/(summary|requests(?:\/[^/]+)?)$/.test(path)
      || path === "/sfa/accounting/treasury");
  }
  if (!isSpecialistRole(role)) return true;
  return required.every(p => p === "sfa.access"
    || (role === "WAREHOUSE_KEEPER" && p.startsWith("wms."))
    || (role === "ACCOUNTANT" && (p.startsWith("accounting.") || p === "sales.price-exceptions.accounting"))
    || (role === "PROCUREMENT" && (p.startsWith("procurement.") || p === "wms.read" || p === "wms.receiving.create")));
}
