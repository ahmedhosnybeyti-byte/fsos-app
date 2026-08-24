import { strict as assert } from "node:assert";
import test from "node:test";
import type { VisitCopilot360LostOpportunity } from "@/lib/types";
import {
  daily360CategoryKey,
  groupDaily360LostOpportunities,
  toggleDaily360OpenCategory,
  toggleDaily360OpenCustomer,
} from "./daily-360-opportunity-groups";

function opportunity(input: Partial<VisitCopilot360LostOpportunity> & Pick<VisitCopilot360LostOpportunity, "customerCode" | "customerName" | "productCode" | "productName">): VisitCopilot360LostOpportunity {
  return {
    customerCode: input.customerCode,
    customerName: input.customerName,
    productCode: input.productCode,
    productName: input.productName,
    category: input.category ?? null,
    declineValue: input.declineValue ?? 1,
    valueBefore: input.valueBefore ?? 1,
    valueAfter: input.valueAfter ?? 0,
    lastVisitDate: input.lastVisitDate ?? "2026-07-14",
    stoppedProducts: input.stoppedProducts ?? [{ productName: input.productName, quantity: 1, unit: "unit", value: 1 }],
    diagnosis: input.diagnosis ?? `Diagnosis for ${input.productCode}`,
    visitDecision: input.visitDecision ?? `Action for ${input.productCode}`,
    likelyReason: input.likelyReason ?? null,
    visitGoal: input.visitGoal ?? `Goal for ${input.productCode}`,
    extraProductCount: input.extraProductCount ?? 0,
    baselineNetQuantity: input.baselineNetQuantity ?? 3,
    recentNetQuantity: input.recentNetQuantity ?? 0,
    suggestedQuantity: input.suggestedQuantity ?? 1,
  };
}

test("groups multiple products and categories under one customer", () => {
  const groups = groupDaily360LostOpportunities([
    opportunity({ customerCode: "C1", customerName: "Same Customer", productCode: "P1", productName: "Milk", category: "Dairy", declineValue: 5, suggestedQuantity: 2 }),
    opportunity({ customerCode: "C1", customerName: "Same Customer", productCode: "P2", productName: "Juice", category: "Beverages", declineValue: 3, suggestedQuantity: 1 }),
    opportunity({ customerCode: "C1", customerName: "Same Customer", productCode: "P3", productName: "Yogurt", category: "Dairy", declineValue: 4, suggestedQuantity: 4 }),
  ], "Uncategorized");

  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.customerName, "Same Customer");
  assert.equal(groups[0]!.opportunityCount, 3);
  assert.equal(groups[0]!.productCount, 3);
  assert.equal(groups[0]!.totalSuggestedQuantity, 7);
  assert.equal(groups[0]!.totalDeclineQuantity, 12);
  assert.deepEqual(groups[0]!.categories.map((category) => category.category), ["Beverages", "Dairy"]);
  assert.deepEqual(groups[0]!.categories[1]!.products.map((product) => product.productCode), ["P1", "P3"]);
  assert.equal(groups[0]!.categories[1]!.products[0]!.opportunity.declineValue, 5);
});

test("keeps same-named customers separate and preserves first report priority", () => {
  const groups = groupDaily360LostOpportunities([
    opportunity({ customerCode: "C2", customerName: "Same Name", productCode: "P2", productName: "Second", category: "A", declineValue: 1 }),
    opportunity({ customerCode: "C1", customerName: "Same Name", productCode: "P1", productName: "First", category: "A", declineValue: 99 }),
  ], "Uncategorized");

  assert.deepEqual(groups.map((group) => group.customerCode), ["C2", "C1"]);
});

test("deduplicates customer-product pairs, uses Uncategorized, and retains opportunity details", () => {
  const first = opportunity({ customerCode: "C1", customerName: "Customer", productCode: "P1", productName: "Milk", category: null, diagnosis: "Keep me", suggestedQuantity: 2 });
  const duplicate = opportunity({ customerCode: "C1", customerName: "Customer", productCode: "P1", productName: "Milk duplicate", category: "Ignored", suggestedQuantity: 9 });
  const groups = groupDaily360LostOpportunities([first, duplicate], "Uncategorized");
  const product = groups[0]!.categories[0]!.products[0]!;

  assert.equal(groups[0]!.opportunityCount, 1);
  assert.equal(groups[0]!.categories[0]!.category, "Uncategorized");
  assert.equal(product.opportunity.diagnosis, "Keep me");
  assert.equal(product.opportunity.stoppedProducts[0]!.productName, "Milk");
  assert.equal(product.opportunity.category, null);
});


test("customer accordions are independently toggleable and categories start closed", () => {
  let openCustomers = new Set(["C1"]);
  openCustomers = toggleDaily360OpenCustomer(openCustomers, "C2");
  assert.equal(openCustomers.has("C1"), true);
  assert.equal(openCustomers.has("C2"), true);
  openCustomers = toggleDaily360OpenCustomer(openCustomers, "C2");
  assert.equal(openCustomers.has("C2"), false);

  const dairyForFirstCustomer = daily360CategoryKey("C1", "Dairy");
  const dairyForSecondCustomer = daily360CategoryKey("C2", "Dairy");
  let openCategories = new Set<string>();
  assert.equal(openCategories.size, 0);
  openCategories = toggleDaily360OpenCategory(openCategories, dairyForFirstCustomer);
  assert.equal(openCategories.has(dairyForFirstCustomer), true);
  assert.equal(openCategories.has(dairyForSecondCustomer), false);
  openCategories = toggleDaily360OpenCategory(openCategories, dairyForFirstCustomer);
  assert.equal(openCategories.size, 0);
});
