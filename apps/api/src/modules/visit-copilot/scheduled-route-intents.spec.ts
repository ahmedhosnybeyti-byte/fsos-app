import { strict as assert } from "node:assert";
import test from "node:test";
import { scheduledRouteIntentWhere } from "./scheduled-route-intents";

test("Scheduled route stops are restricted to the selected date, tenant and assignee", () => {
  const first = scheduledRouteIntentWhere("company-1", "rep-1", "2026-10-16");
  const second = scheduledRouteIntentWhere("company-1", "rep-1", "2026-10-17");

  assert.equal(first.companyId, "company-1");
  assert.equal(first.assignedToUserId, "rep-1");
  assert.equal((first.scheduledFor as Date).toISOString(), "2026-10-16T00:00:00.000Z");
  assert.equal((second.scheduledFor as Date).toISOString(), "2026-10-17T00:00:00.000Z");
  assert.notDeepEqual(first.scheduledFor, second.scheduledFor);
  assert.deepEqual(first.OR, [
    { prospectId: { not: null } },
    { companyOpportunity: { is: { companyId: "company-1", assignedToUserId: "rep-1" } } },
  ]);
});
