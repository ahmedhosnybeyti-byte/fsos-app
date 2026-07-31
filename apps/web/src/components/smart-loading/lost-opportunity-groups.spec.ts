import { strict as assert } from "node:assert";
import test from "node:test";
import { formatQuantity, formatQuantityInput } from "../../lib/utils";
import { groupLostOpportunities, lostOpportunityId } from "./lost-opportunity-groups";

const opportunity = (customerCode: string, customerName: string, productCode: string, productName: string, category: string, suggestedQuantity: number) => ({ customerCode, customerName, productCode, productName, category, baselineNetQuantity: suggestedQuantity * 3, recentNetQuantity: 0, suggestedQuantity });
const opportunities = [opportunity("C1", "Zain", "P1", "Juice", "Drinks", 4), opportunity("C2", "Ali", "P1", "Juice", "Drinks", 3), opportunity("C3", "Badr", "P2", "Water", "Drinks", 2), opportunity("C4", "Adam", "P3", "Chips", "Snacks", 10)];

test("groups, searches, and sorts categories, products, and customers by current quantity", () => {
  const groups = groupLostOpportunities(opportunities, {}, "", "Uncategorized");
  assert.deepEqual(groups.map((group) => group.category), ["Snacks", "Drinks"]);
  assert.deepEqual(groups[1]!.products.map((product) => product.productCode), ["P1", "P2"]);
  assert.deepEqual(groups[1]!.products[0]!.customers.map((customer) => customer.customerCode), ["C1", "C2"]);
  const searchResult = groupLostOpportunities(opportunities, {}, "Ali", "Uncategorized");
  assert.equal(searchResult[0]!.products[0]!.productCode, "P1");
  assert.equal(searchResult[0]!.products[0]!.totalQuantity, 7);
  assert.equal(searchResult[0]!.products[0]!.customers.length, 2);
});

test("individual drafts rerank immediately without duplicating a product", () => {
  const groups = groupLostOpportunities(opportunities, { [lostOpportunityId("C2", "P1")]: 10 }, "", "Uncategorized");
  assert.equal(groups[0]!.category, "Drinks");
  assert.equal(groups[0]!.products[0]!.productCode, "P1");
  assert.equal(groups[0]!.products[0]!.customers[0]!.customerCode, "C2");
  assert.equal(groups.reduce((sum, category) => sum + category.totalQuantity, 0), 26);
  assert.equal(groups[0]!.products.filter((product) => product.productCode === "P1").length, 1);
});

test("ties use stable alphabetic ordering and quantity formatting has one decimal", () => {
  const tied = [opportunity("C1", "Bader", "P1", "Zeta", "Beta", 1), opportunity("C2", "Ahmed", "P2", "Alpha", "Alpha", 1)];
  assert.deepEqual(groupLostOpportunities(tied, {}, "", "Uncategorized").map((group) => group.category), ["Alpha", "Beta"]);
  assert.equal(formatQuantity(32, "en"), "32.0");
  assert.equal(formatQuantityInput(125.4), "125.4");
  assert.equal(formatQuantityInput(32), "32.0");
});


test("a zero draft contributes zero to product and category totals", () => {
  const groups = groupLostOpportunities(
    [opportunity("C1", "Customer", "P1", "Juice", "Drinks", 4)],
    { [lostOpportunityId("C1", "P1")]: 0 },
    "",
    "Uncategorized",
  );
  assert.equal(groups[0]!.products[0]!.totalQuantity, 0);
  assert.equal(groups[0]!.totalQuantity, 0);
});
