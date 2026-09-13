import { strict as assert } from "node:assert";
import test from "node:test";
import { RieRequestBudgetExceededError, RieRequestPlannerService } from "./rie-request-planner.service";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("request planner caps per-action fan-out and reuses request-only acquisitions", async () => {
  const planner = new RieRequestPlannerService();
  let active = 0;
  let maximumActive = 0;
  let hierarchyAcquisitions = 0;
  let versionAcquisitions = 0;

  await planner.runPlan({ name: "test", maxConcurrentOperations: 2, maxOperations: 4 }, async () => {
    const hierarchy = () => planner.resolveHierarchy("company", "SUPERVISOR", "user@example.com", async () => {
      hierarchyAcquisitions += 1;
      await delay(1);
      return new Set(["route-a"]);
    });
    const [firstRoutes, secondRoutes] = await Promise.all([hierarchy(), hierarchy()]);
    assert.equal(firstRoutes, secondRoutes);

    const versions = (entities: readonly string[]) => planner.resolveActiveVersionCounts("company", entities, async (missing) => {
      versionAcquisitions += 1;
      await delay(1);
      return new Map(missing.map((entity) => [entity, 1]));
    });
    const [allVersions, customerVersions] = await Promise.all([versions(["Customers", "Invoices"]), versions(["Customers"])]);
    assert.equal(allVersions.get("Customers"), 1);
    assert.equal(customerVersions.get("Customers"), 1);

    await Promise.all(Array.from({ length: 4 }, () => planner.execute("query", async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(2);
      active -= 1;
    })));
  });

  assert.equal(hierarchyAcquisitions, 1);
  assert.equal(versionAcquisitions, 1);
  assert.equal(maximumActive, 2);
});

test("request planner rejects work above the declared action budget before it starts", async () => {
  const planner = new RieRequestPlannerService();
  let executions = 0;
  await planner.runPlan({ name: "budget", maxConcurrentOperations: 1, maxOperations: 1 }, async () => {
    await planner.execute("first", async () => { executions += 1; });
    await assert.rejects(() => planner.execute("second", async () => { executions += 1; }), RieRequestBudgetExceededError);
  });
  assert.equal(executions, 1);
});
