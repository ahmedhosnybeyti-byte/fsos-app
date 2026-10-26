/** Separate operational duties from company administration. Permissions still
 * apply independently; this policy never grants a capability. */
export const specialistRoleCodes = ["WAREHOUSE_KEEPER", "WAREHOUSE_MANAGER", "ACCOUNTANT", "PROCUREMENT"] as const;
/** Approval and registry duties only. Never grant the generic MANAGER role. */
export const warehouseManagerPermissions = [
  "sfa.access", "wms.read", "wms.warehouses.manage", "wms.access.manage",
  "wms.receiving.review", "wms.receiving.approve", "wms.picking.review", "wms.dispatch.approve",
  "wms.supplier-return.review", "wms.supplier-return.post", "wms.rep-return.review", "wms.rep-return.post",
  "wms.count.approve", "wms.quarantine.release", "wms.quarantine.writeoff",
] as const;
export const warehouseRoleNames = {
  WAREHOUSE_MANAGER: { ar: "مدير المستودع", en: "Warehouse Manager" },
  WAREHOUSE_KEEPER: { ar: "أمين المستودع", en: "Warehouse Keeper" },
} as const;
const managerAllows = (permission: string) => (warehouseManagerPermissions as readonly string[]).includes(permission);
export function isSpecialistRole(role: string): boolean {
  return (specialistRoleCodes as readonly string[]).includes(role);
}
const adminReadPermissions = ["sfa.access", "wms.read", "procurement.read", "accounting.read", "accounting.treasury.read"];
const sensitive = (p: string) => /^(wms\.|accounting\.|procurement\.)/.test(p) || p === "sales.price-exceptions.accounting";
export function hasOperationalPermissions(role: string, permissions: readonly string[] | undefined, required: readonly string[]): boolean {
  if (role === "WAREHOUSE_MANAGER" && !required.every(managerAllows)) return false;
  if (role === "COMPANY_ADMIN" && permissions?.includes("sfa.access") && permissions.includes("erp.admin.read") && required.every(p => adminReadPermissions.includes(p))) return true;
  return required.every(p => permissions?.includes(p));
}
export function permitsOperationalRole(role: string, required: readonly string[], request?: { method?: string; path?: string }): boolean {
  if (role === "WAREHOUSE_MANAGER") return required.every(managerAllows);
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
