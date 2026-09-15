import { strict as assert } from "node:assert";
import test from "node:test";
import { DecisionAnalyticsStudioService } from "./decision-analytics-studio.service";

test("Decision Analytics Studio enters the bounded RIE plan for every endpoint workflow", async () => {
  const plans: Array<{ name: string; maxConcurrentOperations: number; maxOperations: number }> = [];
  const rieFacade = {
    runPlannedRequest: async <T>(options: { name: string; maxConcurrentOperations: number; maxOperations: number }, execute: () => Promise<T>) => {
      plans.push(options);
      return execute();
    },
    hasCanonicalEntitySources: async () => true,
    queryCanonicalRecords: async () => ({ records: [] }),
    getEntityRecords: async () => ({ available: true, records: [], fields: [], warnings: [] }),
  };
  const service = new DecisionAnalyticsStudioService(rieFacade as never, { getLatest: async () => null } as never);
  const user = { companyId: "company", roleCode: "COMPANY_ADMIN", email: "admin@example.com" } as never;

  await service.query(user, { analyzeBy: "territory", dateFrom: "2026-01-01", dateTo: "2026-01-31" } as never);
  await service.filterOptions(user, "branch");
  await service.table(user, { dateFrom: "2026-01-01", dateTo: "2026-01-31", page: 1, pageSize: 25 } as never);

  assert.deepEqual(plans, [
    { name: "decision_analytics.query", maxConcurrentOperations: 3, maxOperations: 24 },
    { name: "decision_analytics.filter_options", maxConcurrentOperations: 3, maxOperations: 24 },
    { name: "decision_analytics.table", maxConcurrentOperations: 3, maxOperations: 24 },
  ]);
});
