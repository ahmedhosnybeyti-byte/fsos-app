import { strict as assert } from "node:assert";
import test from "node:test";
import { TeamPerformanceService } from "./team-performance.service";

test("Team Performance runs its existing aggregates within the bounded RIE plan", async () => {
  const plans: Array<{ name: string; maxConcurrentOperations: number; maxOperations: number }> = [];
  const queries: Array<Record<string, unknown>> = [];
  let activeVersionLookups = 0;
  const rieFacade = {
    runPlannedRequest: async <T>(options: { name: string; maxConcurrentOperations: number; maxOperations: number }, execute: () => Promise<T>) => {
      plans.push(options);
      return execute();
    },
    getActiveVersionCounts: async () => {
      activeVersionLookups += 1;
      return new Map([
        ["Routes", 1], ["Invoices", 1], ["Invoice Items", 1], ["Collections", 1], ["Returns", 1], ["Targets", 1], ["Employees", 1],
      ]);
    },
    queryCanonicalRecords: async (query: Record<string, unknown>) => { queries.push(query); return { records: [] }; },
  };
  const service = new TeamPerformanceService(rieFacade as never);
  const user = { companyId: "company", roleCode: "MANAGER", email: "manager@example.com" } as never;

  const result = await service.query(user, { dateFrom: "2026-01-01", dateTo: "2026-01-31" } as never);

  assert.equal(activeVersionLookups, 1);
  assert.deepEqual(plans, [{ name: "team_performance.query", maxConcurrentOperations: 3, maxOperations: 24 }]);
  assert.deepEqual(result.categoriesAvailable, { sales: true, collection: true, returns: true });
  assert.equal(queries[0]?.preferHashedScopedSemiJoin, true);
  assert.equal(queries[1]?.preferHashedScopedSemiJoin, undefined);
  assert.equal(queries[2]?.preferHashedScopedSemiJoin, undefined);
});
