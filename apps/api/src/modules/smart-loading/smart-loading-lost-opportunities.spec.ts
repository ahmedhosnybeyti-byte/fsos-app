import { strict as assert } from "node:assert";
import test from "node:test";
import { needsLostOpportunityLoading } from "./smart-loading.service";

test("keeps Sales Rep lost opportunities only when suggested quantity exceeds route-product van stock", () => {
  assert.equal(needsLostOpportunityLoading(10, 3), true);
  assert.equal(needsLostOpportunityLoading(10, 10), false);
  assert.equal(needsLostOpportunityLoading(10, 20), false);
  assert.equal(needsLostOpportunityLoading(10, 0), true);
});
