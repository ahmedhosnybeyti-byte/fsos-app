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
    queryDecisionSalesFacts: async () => ({ currentKpi: {}, priorKpi: {}, currentChart: [], priorChart: [], heatmap: [], truncated: { currentChart: false, priorChart: false, heatmap: false } }),
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

test("Decision Analytics sales facts use ONE statement by default and the previous five only on explicit rollback", async () => {
  const calls = { facts: 0, canonical: 0 };
  const rieFacade = {
    runPlannedRequest: async <T>(_options: unknown, execute: () => Promise<T>) => execute(),
    hasCanonicalEntitySources: async () => true,
    queryCanonicalRecords: async () => { calls.canonical += 1; return { records: [] }; },
    queryDecisionSalesFacts: async () => { calls.facts += 1; return { currentKpi: {}, priorKpi: {}, currentChart: [], priorChart: [], heatmap: [], truncated: { currentChart: false, priorChart: false, heatmap: false } }; },
    getEntityRecords: async () => ({ available: true, records: [], fields: [], warnings: [] }),
  };
  const service = new DecisionAnalyticsStudioService(rieFacade as never, { getLatest: async () => null } as never);
  const user = { companyId: "company", roleCode: "COMPANY_ADMIN", email: "admin@example.com" } as never;
  const input = { analyzeBy: "channel", dateFrom: "2026-01-01", dateTo: "2026-01-31" } as never;
  const previous = process.env.DECISION_ANALYTICS_LEGACY_SALES_QUERIES;
  try {
    delete process.env.DECISION_ANALYTICS_LEGACY_SALES_QUERIES;
    await service.query(user, input);
    assert.deepEqual(calls, { facts: 1, canonical: 4 }); // collections, returns and the two visit statements stay unchanged
    calls.facts = 0; calls.canonical = 0;
    process.env.DECISION_ANALYTICS_LEGACY_SALES_QUERIES = "true";
    await service.query(user, input);
    assert.deepEqual(calls, { facts: 0, canonical: 9 }); // five sales statements + the same four
  } finally {
    if (previous === undefined) delete process.env.DECISION_ANALYTICS_LEGACY_SALES_QUERIES; else process.env.DECISION_ANALYTICS_LEGACY_SALES_QUERIES = previous;
  }
});
