import assert from "node:assert/strict";
import test from "node:test";
import {
  RIE_POSTGRES_CONCURRENCY,
  RieExecutionCoordinatorService,
  RiePostgresExecutionBudgetExceededError,
} from "./rie-execution-coordinator.service";
import { RieFsos360QueryService } from "./fsos-360-query.service";

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const waitFor = async (predicate: () => boolean, timeoutMs = 2_000) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for coordinator test state.");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};

test("one request runs at most one sibling RIE PostgreSQL execution at a time", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  let active = 0;
  let maximumActive = 0;
  const values = await coordinator.runRequest("same-request", () => Promise.all(
    Array.from({ length: 8 }, (_, index) => coordinator.execute(`sql-${index}`, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return index;
    })),
  ));

  assert.equal(maximumActive, 1);
  assert.deepEqual(values, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("different requests still use the full process-wide concurrency of 20", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  const release = deferred<void>();
  let active = 0;
  let maximumActive = 0;
  let started = 0;
  const executions = Array.from({ length: RIE_POSTGRES_CONCURRENCY + 4 }, (_, index) =>
    coordinator.runRequest(`request-${index}`, () => coordinator.execute(`sql-${index}`, async () => {
      active += 1;
      started += 1;
      maximumActive = Math.max(maximumActive, active);
      await release.promise;
      active -= 1;
      return index;
    })),
  );

  await waitFor(() => started === RIE_POSTGRES_CONCURRENCY);
  assert.equal(maximumActive, RIE_POSTGRES_CONCURRENCY);
  release.resolve();
  assert.equal((await Promise.all(executions)).length, RIE_POSTGRES_CONCURRENCY + 4);
  assert.equal(active, 0);
});

test("FSOS 360 direct SQL is admitted and serialized by the coordinator", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  let active = 0;
  let maximumActive = 0;
  const prisma = {
    $queryRaw: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return [{ total: 0, geographies: [], selected: [] }];
    },
  };
  const hierarchy = { resolveAllowedRouteIds: async () => null };
  const service = new RieFsos360QueryService(prisma as never, hierarchy as never, coordinator);
  const context = { companyId: "company", requestingUser: { roleCode: "COMPANY_ADMIN", email: "admin@example.com" } } as const;

  const results = await coordinator.runRequest("fsos-direct", () => Promise.all([
    service.customerContext(context, []),
    service.customerContext(context, []),
  ]));

  assert.equal(maximumActive, 1);
  assert.deepEqual(results, [
    { total: 0, geographies: [], selected: [] },
    { total: 0, geographies: [], selected: [] },
  ]);
});

test("nested executions are re-entrant and page-like sibling executions remain leak-free", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  const order: string[] = [];
  let nestedActive = 0;
  let nestedMaximumActive = 0;
  const result = await coordinator.runRequest("nested", () => coordinator.execute("outer", async () => {
    order.push("outer-start");
    const nestedValues = await Promise.all([40, 1].map((value) => coordinator.execute(`nested-${value}`, async () => {
      nestedActive += 1;
      nestedMaximumActive = Math.max(nestedMaximumActive, nestedActive);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(`nested-${value}`);
      nestedActive -= 1;
      return value;
    })));
    order.push("outer-end");
    return nestedValues.reduce((sum, value) => sum + value, 1);
  }));
  assert.equal(result, 42);
  assert.equal(nestedMaximumActive, 1);
  assert.deepEqual(order, ["outer-start", "nested-40", "nested-1", "outer-end"]);

  const pages = await coordinator.runRequest("pages", async () => {
    const rows: number[] = [];
    for (let page = 0; page < 4; page += 1) rows.push(await coordinator.execute(`page-${page}`, async () => page));
    return rows;
  });
  assert.deepEqual(pages, [0, 1, 2, 3]);
});

test("exceptions release both request and global slots", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  await assert.rejects(
    () => coordinator.runRequest("failure", () => coordinator.execute("failing-sql", async () => { throw new Error("expected"); })),
    /expected/,
  );
  const value = await coordinator.runRequest("after-failure", () => coordinator.execute("working-sql", async () => "ok"));
  assert.equal(value, "ok");
});

test("the global slot is released before caller-side Node processing", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  const blockerReleases = Array.from({ length: RIE_POSTGRES_CONCURRENCY - 1 }, () => deferred<void>());
  let blockersStarted = 0;
  const blockers = blockerReleases.map((release, index) => coordinator.runRequest(`node-blocker-${index}`, () => coordinator.execute("blocker-sql", async () => {
    blockersStarted += 1;
    await release.promise;
  })));
  await waitFor(() => blockersStarted === RIE_POSTGRES_CONCURRENCY - 1);
  const nodeWorkRelease = deferred<void>();
  const sqlFinished = deferred<void>();
  let secondRequestRan = false;

  const first = coordinator.runRequest("node-processing", async () => {
    await coordinator.execute("first-sql", async () => "rows");
    sqlFinished.resolve();
    await nodeWorkRelease.promise;
    return "composed";
  });
  await sqlFinished.promise;
  const second = coordinator.runRequest("other-request", () => coordinator.execute("second-sql", async () => {
    secondRequestRan = true;
    return "other";
  }));
  assert.equal(await second, "other");
  assert.equal(secondRequestRan, true);
  nodeWorkRelease.resolve();
  assert.equal(await first, "composed");
  blockerReleases.forEach(({ resolve }) => resolve());
  await Promise.all(blockers);
});

test("SQL preparation runs before waiting for a global execution slot", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  const releases = Array.from({ length: RIE_POSTGRES_CONCURRENCY }, () => deferred<void>());
  let holdersStarted = 0;
  const holders = releases.map((release, index) => coordinator.runRequest(`prepare-holder-${index}`, () => coordinator.execute("holder-sql", async () => {
    holdersStarted += 1;
    await release.promise;
  })));
  await waitFor(() => holdersStarted === RIE_POSTGRES_CONCURRENCY);

  let prepared = false;
  let executed = false;
  const queued = coordinator.runRequest("prepared-request", () => coordinator.executePrepared(
    "prepared-sql",
    () => { prepared = true; return "statement"; },
    async (statement) => { executed = true; return statement; },
  ));
  assert.equal(prepared, true);
  assert.equal(executed, false);

  releases[0]!.resolve();
  assert.equal(await queued, "statement");
  releases.slice(1).forEach(({ resolve }) => resolve());
  await Promise.all(holders);
});

test("the budget counts actual PostgreSQL executions and fails clearly without a partial return", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  await assert.rejects(
    () => coordinator.runWithBudget("budgeted", 2, async () => {
      await coordinator.execute("sql-1", async () => 1);
      await coordinator.execute("sql-2", async () => 2);
      return coordinator.execute("sql-3", async () => 3);
    }),
    (error: unknown) => error instanceof RiePostgresExecutionBudgetExceededError,
  );
});

test("hierarchy and active-version metadata are single-flight within one request", async () => {
  const coordinator = new RieExecutionCoordinatorService();
  let hierarchyExecutions = 0;
  let activeVersionExecutions = 0;

  await coordinator.runRequest("reuse", async () => {
    const hierarchy = () => coordinator.resolveHierarchy("company", "MANAGER", "manager@example.com", async () => {
      hierarchyExecutions += 1;
      await new Promise((resolve) => setTimeout(resolve, 1));
      return new Set(["route-1"]);
    });
    const [firstHierarchy, secondHierarchy] = await Promise.all([hierarchy(), hierarchy()]);
    assert.deepEqual(firstHierarchy, secondHierarchy);

    const versions = (entityNames: readonly string[]) => coordinator.resolveActiveVersionCounts("company", entityNames, async (missing) => {
      activeVersionExecutions += 1;
      await new Promise((resolve) => setTimeout(resolve, 1));
      return new Map(missing.map((entityName) => [entityName, 1]));
    });
    const [firstVersions, secondVersions] = await Promise.all([
      versions(["Invoices", "Invoice Items"]),
      versions(["Invoices", "Invoice Items"]),
    ]);
    assert.deepEqual(firstVersions, secondVersions);
  });

  assert.equal(hierarchyExecutions, 1);
  assert.equal(activeVersionExecutions, 1);
});
