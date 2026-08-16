import { strict as assert } from "node:assert";
import test from "node:test";
import { lostOpportunityExclusionScopeKey } from "./lost-opportunity-exclusion-key.util";

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
