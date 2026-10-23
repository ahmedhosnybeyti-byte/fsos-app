/** Separate operational duties from company administration. Permissions still
 * apply independently; this policy never grants a capability. */
export const specialistRoleCodes = ["WAREHOUSE_KEEPER", "ACCOUNTANT", "PROCUREMENT"] as const;
export function isSpecialistRole(role: string): boolean {
  return (specialistRoleCodes as readonly string[]).includes(role);
}
export function permitsOperationalRole(role: string, required: readonly string[]): boolean {
  const sensitive = (p: string) => /^(wms\.|accounting\.|procurement\.)/.test(p) || p === "sales.price-exceptions.accounting";
  if (role === "COMPANY_ADMIN") return !required.some(sensitive);
  if (!isSpecialistRole(role)) return true;
  return required.every(p => p === "sfa.access"
    || (role === "WAREHOUSE_KEEPER" && p.startsWith("wms."))
    || (role === "ACCOUNTANT" && (p.startsWith("accounting.") || p === "sales.price-exceptions.accounting"))
    || (role === "PROCUREMENT" && (p.startsWith("procurement.") || p === "wms.read" || p === "wms.receiving.create")));
}
