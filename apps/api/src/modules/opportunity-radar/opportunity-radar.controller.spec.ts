import "reflect-metadata";
import { strict as assert } from "node:assert";
import test from "node:test";
import { COMPANY_SCREEN_KEY } from "../../common/decorators/company-screen.decorator";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { OpportunityRadarController } from "./opportunity-radar.controller";

const roles = ["SALES_REP", "SUPERVISOR", "MANAGER", "COMPANY_ADMIN"];

test("Opportunity Radar is company-screen gated and available to operational roles", () => {
  assert.equal(Reflect.getMetadata(COMPANY_SCREEN_KEY, OpportunityRadarController), "opportunity-radar");
  for (const endpoint of ["list", "assignees", "update"] as const) {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, OpportunityRadarController.prototype[endpoint]), roles);
  }
});
