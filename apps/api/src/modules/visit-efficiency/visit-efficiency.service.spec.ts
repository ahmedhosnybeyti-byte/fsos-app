import { strict as assert } from "node:assert";
import test from "node:test";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { VisitEfficiencyService } from "./visit-efficiency.service";

const user: AuthenticatedUser = {
  userId: "u", companyId: "company-1", email: "rep@example.test", roleCode: "SALES_REP",
  permissions: [], mustChangePassword: false, orgUnitId: null,
};

test("Visit Efficiency returns the compact PostgreSQL result without materializing entities", async () => {
  const sourceChecks: string[][] = [];
  const queries: Record<string, unknown>[] = [];
  const facade = {
    hasCanonicalEntitySources: async (_ctx: unknown, entities: string[]) => {
      sourceChecks.push(entities);
      return true;
    },
  };
  const scalable = {
    queryVisitEfficiency: async (input: Record<string, unknown>) => {
      queries.push(input);
      return {
        usedVisits: 2,
        excludedNoCoordinates: 1,
        excludedSingleVisitDays: 1,
        timeColumnUsed: true,
        matchedScopeRows: 3,
        points: [{ id: "C-1-0", label: "C-1", lat: 24.7, lon: 46.7, value: 0, rep: "Rep", dateKey: "2026-01-01" }],
        repSummaries: [{ rep: "Rep", visitDays: 1, totalVisits: 2, totalDistanceKm: 5, avgDistanceKmPerVisit: 2.5 }],
      };
    },
  };
  const service = new VisitEfficiencyService(facade as never, scalable as never);
  const result = await service.query(user, {
    scopeField: "City", scopeValues: ["Riyadh"], dateFrom: "2026-01-01", dateTo: "invalid",
  });

  assert.deepEqual(sourceChecks, [["Visits"], ["Routes"], ["Customers"]]);
  assert.equal(queries.length, 1);
  assert.equal(queries[0]?.requireValidDate, true);
  assert.equal(queries[0]?.fromTime, Date.parse("2026-01-01"));
  assert.equal("toTime" in queries[0]!, false);
  assert.equal("matchedScopeRows" in result, false);
  assert.deepEqual(result.points[0], { id: "C-1-0", label: "C-1", lat: 24.7, lon: 46.7, value: 0, rep: "Rep", dateKey: "2026-01-01" });
});

test("Visit Efficiency forwards each operational viewer to the canonical hierarchy scope", async () => {
  const contexts: Array<{ roleCode: string; email: string }> = [];
  const facade = { hasCanonicalEntitySources: async () => true };
  const scalable = {
    queryVisitEfficiency: async (input: { requestingUser: { roleCode: string; email: string } }) => {
      contexts.push(input.requestingUser);
      return {
        usedVisits: 0, excludedNoCoordinates: 0, excludedSingleVisitDays: 0,
        timeColumnUsed: false, matchedScopeRows: 0, points: [], repSummaries: [],
      };
    },
  };
  const service = new VisitEfficiencyService(facade as never, scalable as never);

  for (const [roleCode, email] of [
    ["COMPANY_ADMIN", "admin@example.test"],
    ["MANAGER", "manager@example.test"],
    ["SUPERVISOR", "supervisor@example.test"],
    ["SALES_REP", "rep@example.test"],
  ] as const) {
    await service.query({ ...user, roleCode, email }, {});
  }

  assert.deepEqual(contexts, [
    { roleCode: "COMPANY_ADMIN", email: "admin@example.test" },
    { roleCode: "MANAGER", email: "manager@example.test" },
    { roleCode: "SUPERVISOR", email: "supervisor@example.test" },
    { roleCode: "SALES_REP", email: "rep@example.test" },
  ]);
});

test("Visit Efficiency preserves source and empty-scope errors", async () => {
  let missing = "Routes";
  const facade = {
    hasCanonicalEntitySources: async (_ctx: unknown, entities: string[]) => entities[0] !== missing,
  };
  const scalable = {
    queryVisitEfficiency: async () => ({
      usedVisits: 0, excludedNoCoordinates: 0, excludedSingleVisitDays: 0,
      timeColumnUsed: false, matchedScopeRows: 0, points: [], repSummaries: [],
    }),
  };
  const service = new VisitEfficiencyService(facade as never, scalable as never);
  await assert.rejects(() => service.query(user, {}), /بيانات "المسارات" غير متاحة/);

  missing = "none";
  await assert.rejects(
    () => service.query(user, { scopeField: "Channel", scopeValues: ["Missing"] }),
    /لا توجد بيانات مطابقة لـ Channel ضمن \[Missing\]/,
  );
});

test("Visit Efficiency scope values preserve trim, dedupe and locale ordering with a grouped scalar read", async () => {
  const calls: Record<string, unknown>[] = [];
  const facade = {
    hasCanonicalEntitySources: async () => true,
    queryCanonicalRecords: async (input: Record<string, unknown>) => {
      calls.push(input);
      return {
        records: [{ value: " Riyadh " }, { value: "Riyadh" }, { value: "" }, { value: "Jeddah" }],
        page: { limit: 0, offset: 0, hasMore: false },
      };
    },
  };
  const service = new VisitEfficiencyService(facade as never, {} as never);

  assert.deepEqual(await service.scopeValues(user, "City"), { values: ["Jeddah", "Riyadh"] });
  assert.equal(calls[0]?.entityName, "Customers");
  assert.deepEqual(calls[0]?.projection, [{ field: "City", as: "value" }]);
  assert.deepEqual(calls[0]?.groupBy, [{ field: "City" }]);
  assert.equal(calls[0]?.unboundedFinalResult, true);
});
