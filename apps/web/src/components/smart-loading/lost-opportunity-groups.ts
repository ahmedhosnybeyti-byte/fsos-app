import type { SmartLoadingLostOpportunity } from "../../lib/types";

export type OpportunityQuantityDrafts = Record<string, number>;

export type LostOpportunityCustomer = SmartLoadingLostOpportunity & {
  id: string;
  currentQuantity: number;
};

export type LostOpportunityProductGroup = {
  productCode: string;
  productName: string;
  totalQuantity: number;
  customers: LostOpportunityCustomer[];
};

export type LostOpportunityCategoryGroup = {
  category: string;
  totalQuantity: number;
  products: LostOpportunityProductGroup[];
};

export function lostOpportunityId(customerCode: string, productCode: string): string {
  return customerCode + "\u0000" + productCode;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function compareByQuantityThenLabel<T extends { totalQuantity?: number; currentQuantity?: number }>(
  left: T,
  right: T,
  leftLabel: string,
  rightLabel: string,
): number {
  const leftQuantity = left.totalQuantity ?? left.currentQuantity ?? 0;
  const rightQuantity = right.totalQuantity ?? right.currentQuantity ?? 0;
  return rightQuantity - leftQuantity || leftLabel.localeCompare(rightLabel, "ar");
}

function matchesProduct(product: LostOpportunityProductGroup, query: string): boolean {
  const searchable = [
    product.productName,
    product.productCode,
    ...product.customers.flatMap((customer) => [customer.customerName, customer.customerCode]),
  ].join(" ");
  return normalized(searchable).includes(query);
}

/**
 * The engine emits one row per customer/product pair. Draft-derived grouping
 * keeps totals and ordering live, while search only filters whole products so
 * adding from search still uses every customer opportunity for that product.
 */
export function groupLostOpportunities(
  opportunities: readonly SmartLoadingLostOpportunity[],
  quantityDrafts: OpportunityQuantityDrafts,
  query: string,
  uncategorized: string,
): LostOpportunityCategoryGroup[] {
  const categories = new Map<string, Map<string, LostOpportunityCustomer[]>>();

  for (const opportunity of opportunities) {
    const category = opportunity.category?.trim() || uncategorized;
    const id = lostOpportunityId(opportunity.customerCode, opportunity.productCode);
    const currentQuantity = Math.max(0, quantityDrafts[id] ?? opportunity.suggestedQuantity);
    const products = categories.get(category) ?? new Map<string, LostOpportunityCustomer[]>();
    const customers = products.get(opportunity.productCode) ?? [];
    customers.push({ ...opportunity, id, currentQuantity });
    products.set(opportunity.productCode, customers);
    categories.set(category, products);
  }

  const grouped = Array.from(categories, ([category, products]) => {
    const groupedProducts = Array.from(products, ([productCode, customers]) => {
      const totalQuantity = customers.reduce((sum, customer) => sum + customer.currentQuantity, 0);
      return {
        productCode,
        productName: customers[0]!.productName,
        totalQuantity,
        customers: customers.sort((a, b) => compareByQuantityThenLabel(a, b, a.customerName, b.customerName)),
      };
    }).sort((a, b) => compareByQuantityThenLabel(a, b, a.productName, b.productName));

    return {
      category,
      totalQuantity: groupedProducts.reduce((sum, product) => sum + product.totalQuantity, 0),
      products: groupedProducts,
    };
  }).sort((a, b) => compareByQuantityThenLabel(a, b, a.category, b.category));

  const queryValue = normalized(query);
  if (!queryValue) return grouped;

  return grouped.flatMap((category) => {
    if (normalized(category.category).includes(queryValue)) return [category];
    const products = category.products.filter((product) => matchesProduct(product, queryValue));
    return products.length > 0 ? [{ ...category, products }] : [];
  });
}
