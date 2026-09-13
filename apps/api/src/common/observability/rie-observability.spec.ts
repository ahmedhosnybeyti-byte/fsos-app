import { strict as assert } from "node:assert";
import test from "node:test";
import { CanonicalHierarchyResolverService } from "../../modules/rie/canonical-hierarchy-resolver.service";
import { RieFacade } from "../../modules/rie/rie-facade.service";
import { RieFsos360QueryService } from "../../modules/rie/fsos-360-query.service";
import { RieScalableQueryService } from "../../modules/rie/scalable-query.service";
import { RieRequestPlannerService } from "../../modules/rie/rie-request-planner.service";
import { classifyRieHttpAction, completeRieRequest, runWithRieRequestContext, setRieTelemetryTestSink } from "./rie-observability";

type Event = Record<string, unknown>;

const facadeWith = (scalable: RieScalableQueryService, fsos360?: RieFsos360QueryService, planner?: RieRequestPlannerService) => new RieFacade(
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  scalable,
  fsos360,
  planner,
);

test("audited HTTP actions have stable low-cardinality classifications", () => {
  assert.deepEqual(classifyRieHttpAction("GET", "/api/v1/smart-loading/session"), { feature: "smart_loading", action: "get_session", routeTemplate: "/smart-loading/session" });
  assert.equal(classifyRieHttpAction("POST", "/api/v1/decision-analytics-studio/query").feature, "decision_analytics");
  assert.equal(classifyRieHttpAction("POST", "/api/v1/team-performance/query").feature, "team_performance");
  assert.equal(classifyRieHttpAction("GET", "/api/v1/visit-copilot/daily-brief").action, "daily_brief");
  assert.equal(classifyRieHttpAction("POST", "/api/v1/decision-analytics-studio/fsos-360/query").feature, "fsos360");
});

test("trace connects facade, hierarchy, semaphore and PostgreSQL with accurate counts and no sensitive values", async () => {
  const events: Event[] = [];
  const restore = setRieTelemetryTestSink((event) => events.push({ ...event }), 1);
  try {
    let sqlCalls = 0;
    const prisma = {
      $queryRaw: async () => {
        sqlCalls += 1;
        return sqlCalls === 1
          ? [{ entityName: "Customers", versionCount: 1n }]
          : [{ CustomerCode: "customer-secret", CustomerName: "payload-secret" }];
      },
    };
    const hierarchy = new CanonicalHierarchyResolverService(prisma as never);
    const scalable = new RieScalableQueryService(prisma as never, hierarchy);
    const facade = facadeWith(scalable);

    await runWithRieRequestContext({ traceId: "trace-test-1", feature: "decision_analytics", action: "query", routeTemplate: "/decision-analytics-studio" }, async () => {
      const result = await facade.queryCanonicalRecords({
        companyId: "company-secret",
        requestingUser: { roleCode: "COMPANY_ADMIN", email: "private@example.com" },
        entityName: "Customers",
        projection: [{ field: "CustomerCode" }],
        scope: { customer: { values: ["customer-secret"] }, route: { values: ["route-secret"] } },
        pagination: { limit: 10 },
      });
      assert.equal(result.records.length, 1);
      completeRieRequest(200);
    });

    assert.equal(sqlCalls, 2);
    const summary = events.find((event) => event.event === "rie_request_summary");
    assert.ok(summary);
    assert.equal(summary.traceId, "trace-test-1");
    assert.equal(summary.rieLogicalOperationCount, 1);
    assert.equal(summary.sqlOperationCount, 2);
    assert.equal(summary.semaphoreAcquisitionCount, 2);
    assert.equal(summary.directSqlOperationCount, 0);
    assert.equal(summary.hierarchyResolutionCount, 2);
    assert.equal(summary.versionResolutionCount, 1);
    assert.equal(summary.activeVersionEntityCount, 1);
    assert.equal(summary.activeSourceVersionCount, 1);
    assert.equal(summary.rowsReturnedTotal, 2);
    assert.ok(events.some((event) => event.layer === "facade" && event.traceId === "trace-test-1"));
    assert.ok(events.some((event) => event.layer === "semaphore" && event.traceId === "trace-test-1"));
    assert.ok(events.some((event) => event.layer === "postgres" && event.governance === "semaphore" && event.traceId === "trace-test-1"));

    const serialized = JSON.stringify(events);
    for (const secret of ["company-secret", "private@example.com", "customer-secret", "route-secret", "payload-secret"]) {
      assert.equal(serialized.includes(secret), false, `telemetry leaked ${secret}`);
    }
  } finally {
    restore();
  }
});

test("FSOS360 direct SQL is visible without acquiring the RIE semaphore", async () => {
  const events: Event[] = [];
  const restore = setRieTelemetryTestSink((event) => events.push({ ...event }), 1);
  try {
    const prisma = { $queryRaw: async () => [{ total: 0, geographies: [], selected: [] }] };
    const hierarchy = new CanonicalHierarchyResolverService(prisma as never);
    const scalable = new RieScalableQueryService(prisma as never, hierarchy);
    const fsos360 = new RieFsos360QueryService(prisma as never, hierarchy);
    const facade = facadeWith(scalable, fsos360);

    await runWithRieRequestContext({ traceId: "trace-fsos360", feature: "fsos360", action: "query", routeTemplate: "/decision-analytics-studio/fsos-360" }, async () => {
      await facade.queryFsos360CustomerContext({ companyId: "company-fsos-secret", requestingUser: { roleCode: "COMPANY_ADMIN", email: "fsos@example.com" } }, ["customer-fsos-secret"]);
      completeRieRequest(200);
    });

    const summary = events.find((event) => event.event === "rie_request_summary");
    assert.ok(summary);
    assert.equal(summary.rieLogicalOperationCount, 1);
    assert.equal(summary.sqlOperationCount, 1);
    assert.equal(summary.directSqlOperationCount, 1);
    assert.equal(summary.semaphoreAcquisitionCount, 0);
    assert.ok(events.some((event) => event.layer === "postgres" && event.operation === "fsos360.customerContext.sql" && event.governance === "direct"));
    const serialized = JSON.stringify(events);
    assert.equal(serialized.includes("company-fsos-secret"), false);
    assert.equal(serialized.includes("customer-fsos-secret"), false);
    assert.equal(serialized.includes("fsos@example.com"), false);
  } finally {
    restore();
  }
});

test("planned Smart Loading-style work reuses hierarchy and active versions while bounding fan-out", async () => {
  const events: Event[] = [];
  const restore = setRieTelemetryTestSink((event) => events.push({ ...event }), 1);
  try {
    let activeVersionQueries = 0;
    let factQueries = 0;
    const prisma = {
      $queryRaw: async (query: { strings?: readonly string[] }) => {
        const text = query.strings?.join(" ") ?? "";
        if (text.includes('COUNT(*) AS "versionCount"')) {
          activeVersionQueries += 1;
          return [{ entityName: "Customers", versionCount: 1n }];
        }
        factQueries += 1;
        return [];
      },
    };
    const planner = new RieRequestPlannerService();
    const hierarchy = new CanonicalHierarchyResolverService(prisma as never, planner);
    const scalable = new RieScalableQueryService(prisma as never, hierarchy, planner);
    const facade = facadeWith(scalable, undefined, planner);
    const query = {
      companyId: "company-planned-secret",
      requestingUser: { roleCode: "COMPANY_ADMIN", email: "planner@example.com" },
      entityName: "Customers",
      projection: [{ field: "CustomerCode" }],
      pagination: { limit: 10 },
    } as const;

    await runWithRieRequestContext({ traceId: "trace-planner", feature: "smart_loading", action: "get_session", routeTemplate: "/smart-loading/session" }, async () => {
      await facade.runPlannedRequest({ name: "smart_loading.session", maxConcurrentOperations: 1, maxOperations: 4 }, () =>
        Promise.all([facade.queryCanonicalRecords(query), facade.queryCanonicalRecords(query)]),
      );
      completeRieRequest(200);
    });

    assert.equal(activeVersionQueries, 1);
    assert.equal(factQueries, 2);
    const summary = events.find((event) => event.event === "rie_request_summary");
    assert.ok(summary);
    assert.equal(summary.requestPlanCount, 1);
    assert.equal(summary.plannedOperationCount, 2);
    assert.equal(summary.plannedOperationMaxActiveCount, 1);
    assert.equal(summary.hierarchyResolutionCount, 1);
    assert.ok(Number(summary.hierarchyReuseCount) >= 3);
    assert.ok(Number(summary.activeVersionReuseCount) >= 1);
  } finally {
    restore();
  }
});
