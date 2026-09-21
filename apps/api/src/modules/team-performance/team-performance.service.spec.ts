import { strict as assert } from "node:assert";
import test from "node:test";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TeamPerformanceService } from "./team-performance.service";

const user: AuthenticatedUser = {
  userId: "manager-1", companyId: "company-1", email: "manager@example.com", roleCode: "MANAGER",
  permissions: [], mustChangePassword: false, orgUnitId: null,
};

const result = (records: Record<string, unknown>[]) => ({ records, page: { limit: 5_000, offset: 0, hasMore: false } });

test("Team Performance current/prior metric query preserves per-rep parity with one RIE query per metric", async () => {
  const queries: Record<string, unknown>[] = [];
  const rows = {
    "Invoice Items": [
      { salesRepId: "rep-1", repName: "Rep One", repEmail: "rep-1@example.com", supervisorEmail: "manager@example.com", supervisorName: "Manager", currentRouteIds: ["R-1"], priorRouteIds: ["R-1"], currentValue: 120, priorValue: 100 },
      { salesRepId: "rep-2", repName: "Rep Two", repEmail: "rep-2@example.com", supervisorEmail: "manager@example.com", supervisorName: "Manager", currentRouteIds: ["R-2"], priorRouteIds: ["R-2"], currentValue: 80, priorValue: 90 },
    ],
    Collections: [
      { salesRepId: "rep-1", repName: "Rep One", repEmail: "rep-1@example.com", supervisorEmail: "manager@example.com", supervisorName: "Manager", currentRouteIds: ["R-1"], priorRouteIds: ["R-1"], currentValue: 70, priorValue: 60 },
      { salesRepId: "rep-2", repName: "Rep Two", repEmail: "rep-2@example.com", supervisorEmail: "manager@example.com", supervisorName: "Manager", currentRouteIds: ["R-2"], priorRouteIds: ["R-2"], currentValue: 40, priorValue: 45 },
    ],
    Returns: [
      { salesRepId: "rep-1", repName: "Rep One", repEmail: "rep-1@example.com", supervisorEmail: "manager@example.com", supervisorName: "Manager", currentRouteIds: ["R-1"], priorRouteIds: ["R-1"], currentValue: 5, priorValue: 4 },
      { salesRepId: "rep-2", repName: "Rep Two", repEmail: "rep-2@example.com", supervisorEmail: "manager@example.com", supervisorName: "Manager", currentRouteIds: ["R-2"], priorRouteIds: ["R-2"], currentValue: 2, priorValue: 3 },
    ],
  } as const;
  const rie = {
    queryCanonicalRecords: async (query: Record<string, unknown>) => {
      queries.push(query);
      if (query.entityName === "Targets") return result([{ SalesTarget: 300, CollectionTarget: 150, ActiveCustomersTarget: 0, SKUDistributionTarget: 0 }]);
      if (query.entityName === "Invoice Items" && (query.projection as unknown[]).length === 0) return result([{ customers: 2, invoices: 4, skus: 3 }]);
      return result(rows[query.entityName as keyof typeof rows] as unknown as Record<string, unknown>[]);
    },
  };
  const prisma = { rieDatasetVersion: { findMany: async () => ["Routes", "Invoices", "Invoice Items", "Collections", "Returns"].map((entityName) => ({ entityName })) } };
  const service = new TeamPerformanceService(rie as never, prisma as never);

  const actual = await service.query(user, { dateFrom: "2026-08-01", dateTo: "2026-08-31", priorDateFrom: "2026-07-01", priorDateTo: "2026-07-31", routeIds: ["R-1", "R-2"] });

  // Expected values are the legacy current-query + prior-query merge for the
  // same manager, periods, reps, and three metrics.
  assert.deepEqual(actual.reps, [
    { routeIds: ["R-1"], repEmail: "rep-1@example.com", repName: "Rep One", supervisorEmail: "manager@example.com", supervisorName: "Manager", sales: 120, salesPrior: 100, collection: 70, collectionPrior: 60, returns: 5, returnsPrior: 4 },
    { routeIds: ["R-2"], repEmail: "rep-2@example.com", repName: "Rep Two", supervisorEmail: "manager@example.com", supervisorName: "Manager", sales: 80, salesPrior: 90, collection: 40, collectionPrior: 45, returns: 2, returnsPrior: 3 },
  ]);
  assert.equal(queries.length, 5);
  const metricQueries = queries.filter((query) => (query.projection as unknown[]).length > 0);
  assert.equal(metricQueries[0]?.entityName, "Invoice Items");
  assert.equal(metricQueries[0]?.preferHashedScopedSemiJoin, true);
  assert.equal(metricQueries[1]?.entityName, "Collections");
  assert.equal(metricQueries[1]?.preferHashedScopedSemiJoin, undefined);
  assert.equal(metricQueries[2]?.entityName, "Returns");
  assert.equal(metricQueries[2]?.preferHashedScopedSemiJoin, undefined);
  for (const query of metricQueries) {
    assert.equal(query.companyId, user.companyId);
    assert.deepEqual(query.requestingUser, { roleCode: user.roleCode, email: user.email });
    const aggregates = query.aggregates as Array<{ as: string; filterDate?: { from: string; to: string } }>;
    assert.deepEqual(aggregates.map(({ as }) => as), ["currentRouteIds", "currentValue", "priorRouteIds", "priorValue"]);
    assert.deepEqual(aggregates.map(({ filterDate }) => filterDate && [filterDate.from, filterDate.to]), [["2026-08-01", "2026-08-31"], ["2026-08-01", "2026-08-31"], ["2026-07-01", "2026-07-31"], ["2026-07-01", "2026-07-31"]]);
  }
});
