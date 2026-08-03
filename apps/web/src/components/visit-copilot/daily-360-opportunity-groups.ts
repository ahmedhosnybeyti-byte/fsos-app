import type { VisitCopilot360LostOpportunity } from "@/lib/types";
import { sortDaily360Customers } from "@/lib/daily-360-customer-order";

export type Daily360ProductGroup = {
  productCode: string;
  productName: string;
  opportunity: VisitCopilot360LostOpportunity;
};

export type Daily360CategoryGroup = {
  category: string;
  products: Daily360ProductGroup[];
};

export type Daily360CustomerGroup = {
  customerCode: string;
  customerName: string;
  opportunityCount: number;
  productCount: number;
  totalSuggestedQuantity: number;
  totalDeclineQuantity: number;
  categories: Daily360CategoryGroup[];
};

/** Keeps the customer accordion exclusive without coupling it to customer names. */
export function toggleDaily360OpenCustomer(
  currentCustomerCode: string | null,
  customerCode: string,
): string | null {
  return currentCustomerCode === customerCode ? null : customerCode;
}

/** Category state is scoped to its customer, so equal category labels never collide. */
export function daily360CategoryKey(customerCode: string, category: string): string {
  return `${customerCode}\u0000${category}`;
}

export function toggleDaily360OpenCategory(
  currentCategoryKeys: ReadonlySet<string>,
  categoryKey: string,
): Set<string> {
  const next = new Set(currentCategoryKeys);
  if (next.has(categoryKey)) next.delete(categoryKey);
  else next.add(categoryKey);
  return next;
}

const compareByDeclineThenName = (a: Daily360ProductGroup, b: Daily360ProductGroup) =>
  b.opportunity.declineValue - a.opportunity.declineValue
  || a.productName.localeCompare(b.productName, "ar")
  || a.productCode.localeCompare(b.productCode);

/**
 * Preserves the report's existing priority by retaining the first occurrence
 * of each customer, while rendering each customer/product opportunity once.
 */
export function groupDaily360LostOpportunities(
  opportunities: readonly VisitCopilot360LostOpportunity[],
  uncategorized: string,
): Daily360CustomerGroup[] {
  const customers = new Map<string, {
    customerCode: string;
    customerName: string;
    opportunities: VisitCopilot360LostOpportunity[];
  }>();
  const seenOpportunityIds = new Set<string>();

  for (const opportunity of opportunities) {
    const opportunityId = `${opportunity.customerCode}\u0000${opportunity.productCode}`;
    if (seenOpportunityIds.has(opportunityId)) continue;
    seenOpportunityIds.add(opportunityId);

    const customer = customers.get(opportunity.customerCode) ?? {
      customerCode: opportunity.customerCode,
      customerName: opportunity.customerName,
      opportunities: [],
    };
    customer.opportunities.push(opportunity);
    customers.set(opportunity.customerCode, customer);
  }

  const groups = [...customers.values()].map((customer) => {
    const categories = new Map<string, Daily360ProductGroup[]>();
    for (const opportunity of customer.opportunities) {
      const category = opportunity.category?.trim() || uncategorized;
      const products = categories.get(category) ?? [];
      products.push({
        productCode: opportunity.productCode,
        productName: opportunity.productName,
        opportunity,
      });
      categories.set(category, products);
    }

    const groupedCategories = [...categories.entries()]
      .map(([category, products]) => ({
        category,
        products: products.sort(compareByDeclineThenName),
      }))
      .sort((a, b) => a.category.localeCompare(b.category, "ar"));

    return {
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      opportunityCount: customer.opportunities.length,
      productCount: customer.opportunities.length,
      totalSuggestedQuantity: customer.opportunities.reduce((sum, opportunity) => sum + opportunity.suggestedQuantity, 0),
      totalDeclineQuantity: customer.opportunities.reduce((sum, opportunity) => sum + opportunity.declineValue, 0),
      categories: groupedCategories,
    };
  });

  return sortDaily360Customers(groups, (customer) => ({
    customerName: customer.customerName,
    itemsCount: customer.productCount,
    suggestedQuantity: customer.totalSuggestedQuantity,
  }));
}

export type Daily360ExclusionAction = "CUSTOMER_PRODUCT" | "SALESPERSON_PRODUCT" | "TEAM_PRODUCT" | "COMPANY_PRODUCT";

export function daily360AllowedExclusionActions(roleCode: string | undefined): Daily360ExclusionAction[] {
  if (roleCode === "SALES_REP") return ["CUSTOMER_PRODUCT", "SALESPERSON_PRODUCT"];
  if (roleCode === "SUPERVISOR") return ["CUSTOMER_PRODUCT", "SALESPERSON_PRODUCT", "TEAM_PRODUCT"];
  if (roleCode === "MANAGER" || roleCode === "COMPANY_ADMIN") return ["COMPANY_PRODUCT"];
  return [];
}
