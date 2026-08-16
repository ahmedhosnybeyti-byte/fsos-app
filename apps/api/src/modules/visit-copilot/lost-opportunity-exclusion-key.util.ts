import type { LostOpportunityExclusionScope } from "@field-sales-os/schemas";

/**
 * Builds the database-unique key for an exclusion scope.
 *
 * PostgreSQL TEXT values cannot contain NUL (\u0000), so serialize the
 * participating values rather than joining them with a NUL delimiter.
 * JSON arrays retain an unambiguous boundary even when a code contains a
 * delimiter-like character itself.
 */
export function lostOpportunityExclusionScopeKey(
  scopeType: LostOpportunityExclusionScope,
  values: { customerCode: string | null; productCode: string; salespersonId: string | null; teamScopeId: string | null },
): string {
  if (scopeType === "CUSTOMER_PRODUCT") return JSON.stringify([values.customerCode, values.productCode]);
  if (scopeType === "SALESPERSON_PRODUCT") return JSON.stringify([values.salespersonId, values.productCode]);
  if (scopeType === "TEAM_PRODUCT") return JSON.stringify([values.teamScopeId, values.productCode]);
  return values.productCode;
}

export function lostOpportunityExclusionAppliesToOpportunity(
  exclusion: { scopeType: LostOpportunityExclusionScope; customerCode: string | null; productCode: string; salespersonId: string | null; teamScopeId: string | null },
  opportunity: { customerCode: string; productCode: string },
  userId: string,
  teamScopeId: string | null,
): boolean {
  if (exclusion.productCode !== opportunity.productCode) return false;
  return exclusion.scopeType === "COMPANY_PRODUCT"
    || (exclusion.scopeType === "CUSTOMER_PRODUCT" && exclusion.customerCode === opportunity.customerCode)
    || (exclusion.scopeType === "SALESPERSON_PRODUCT" && exclusion.salespersonId === userId)
    || (exclusion.scopeType === "TEAM_PRODUCT" && teamScopeId !== null && exclusion.teamScopeId === teamScopeId);
}
