import { strict as assert } from "node:assert";
import test from "node:test";
import { sortDaily360Customers } from "./daily-360-customer-order";

test("sorts Daily 360 customers by items, suggested quantity, then name without mutating the source", () => {
  const customers = [
    { id: "quantity-low", customerName: "Badr", itemsCount: 3, suggestedQuantity: 4 },
    { id: "name-zain", customerName: "Zain", itemsCount: 2, suggestedQuantity: 1 },
    { id: "items-high", customerName: "Customer", itemsCount: 5, suggestedQuantity: 1 },
    { id: "quantity-high", customerName: "Adam", itemsCount: 3, suggestedQuantity: 8 },
    { id: "name-adam", customerName: "Adam", itemsCount: 2, suggestedQuantity: 1 },
  ];
  const originalOrder = customers.map((customer) => customer.id);

  const sorted = sortDaily360Customers(customers, (customer) => customer);

  assert.deepEqual(sorted.map((customer) => customer.id), ["items-high", "quantity-high", "quantity-low", "name-adam", "name-zain"]);
  assert.deepEqual(customers.map((customer) => customer.id), originalOrder);
  assert.notEqual(sorted, customers);
});
