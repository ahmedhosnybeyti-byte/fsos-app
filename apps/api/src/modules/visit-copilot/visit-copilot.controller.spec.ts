import { strict as assert } from "node:assert";
import test from "node:test";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { VisitCopilotController } from "./visit-copilot.controller";

const operationalEndpoints = [
  "dailyBrief", "plan", "briefing", "chat", "daily360Summary",
  "listLostOpportunityExclusions", "createLostOpportunityExclusion", "revokeLostOpportunityExclusion",
  "discovery", "googleSearch", "discoverySearch", "discoveryLimit", "updateProspectStatus",
  "routeOpportunities", "prospectBriefing",
] as const;

test("Visit Copilot permits all operational roles on its existing endpoints", () => {
  for (const endpoint of operationalEndpoints) {
    assert.deepEqual(
      Reflect.getMetadata(ROLES_KEY, VisitCopilotController.prototype[endpoint]),
      ["SALES_REP", "SUPERVISOR", "MANAGER", "COMPANY_ADMIN"],
      endpoint,
    );
  }
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, VisitCopilotController.prototype.salesReps), ["SUPERVISOR", "MANAGER", "COMPANY_ADMIN"]);
});
