import { strict as assert } from "node:assert";
import test from "node:test";
import { selectRoutePriorityProducts } from "./smart-loading-priority";

const item = (productCode: string, category: string | null, customers: number, quantity: number, productName = productCode) => ({ productCode, productName, category, routeCustomerCount: customers, totalQuantity: quantity, currentVehicleStock: null });

test("keeps the top five route products within each category without mutating inputs", () => {
  const source = ["F", "E", "D", "C", "B", "A"].map((name, index) => item(name, "Dairy", 10 - index, 1));
  const snapshot = [...source];
  const result = selectRoutePriorityProducts(source);
  assert.deepEqual(result.map((row) => row.productCode), ["F", "E", "D", "C", "B"]);
  assert.deepEqual(source, snapshot);
});

test("ranks route products by customer count, then quantity, then name", () => {
  const result = selectRoutePriorityProducts([
    item("P3", "Snacks", 2, 4, "Zeta"),
    item("P2", "Snacks", 2, 4, "Alpha"),
    item("P1", "Snacks", 2, 5, "Beta"),
    item("P4", "Dairy", 1, 1),
  ]);
  assert.deepEqual(result.filter((row) => row.category === "Snacks").map((row) => row.productCode), ["P1", "P2", "P3"]);
  assert.equal(result.filter((row) => row.category === "Dairy").length, 1);
});