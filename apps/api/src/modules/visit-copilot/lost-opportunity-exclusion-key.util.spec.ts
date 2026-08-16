import { strict as assert } from "node:assert";
import test from "node:test";
import { lostOpportunityExclusionAppliesToOpportunity, lostOpportunityExclusionScopeKey } from "./lost-opportunity-exclusion-key.util";

test("creates PostgreSQL-safe, unambiguous keys for persisted customer exclusions", () => {
  const first = lostOpportunityExclusionScopeKey("CUSTOMER_PRODUCT", {
    customerCode: "customer|a",
    productCode: "product|b",
    salespersonId: null,
    teamScopeId: null,
  });
  const second = lostOpportunityExclusionScopeKey("CUSTOMER_PRODUCT", {
    customerCode: "customer",
    productCode: "a|product|b",
    salespersonId: null,
    teamScopeId: null,
  });

  assert.equal(first.includes("\u0000"), false);
  assert.notEqual(first, second);
  assert.deepEqual(JSON.parse(first), ["customer|a", "product|b"]);
});

test("customer-product exclusion hides only that product, not the whole customer", () => {
  const exclusion = { scopeType: "CUSTOMER_PRODUCT" as const, customerCode: "C-1", productCode: "P-1", salespersonId: null, teamScopeId: null };

  assert.equal(lostOpportunityExclusionAppliesToOpportunity(exclusion, { customerCode: "C-1", productCode: "P-1" }, "user-1", null), true);
  assert.equal(lostOpportunityExclusionAppliesToOpportunity(exclusion, { customerCode: "C-1", productCode: "P-2" }, "user-1", null), false);
  assert.equal(lostOpportunityExclusionAppliesToOpportunity(exclusion, { customerCode: "C-2", productCode: "P-1" }, "user-1", null), false);
});
