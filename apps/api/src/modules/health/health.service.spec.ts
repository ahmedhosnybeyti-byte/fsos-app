import { strict as assert } from "node:assert";
import test from "node:test";
import { HealthService } from "./health.service";
import { DrainingService, rejectNewWorkWhileDraining } from "../../common/runtime/draining.service";

function createHealth(query: () => Promise<unknown>) {
  const draining = new DrainingService();
  const service = new HealthService({ $queryRawUnsafe: query } as never, draining);
  return { draining, service };
}

test("readiness fails when the database is unavailable", async () => {
  const { service } = createHealth(async () => { throw new Error("database unavailable"); });
  assert.equal(await service.isReady(), false);
});

test("readiness succeeds only after the database probe succeeds", async () => {
  const { service } = createHealth(async () => [{ "?column?": 1 }]);
  assert.equal(await service.isReady(), true);
});

test("shutdown enters draining and rejects new application work", () => {
  const draining = new DrainingService();
  draining.onApplicationShutdown();
  let nextCalled = false;
  const response = {
    setHeader: () => response,
    status: () => response,
    json: (body: unknown) => { assert.deepEqual(body, { status: "draining" }); },
  };
  rejectNewWorkWhileDraining(draining)({ path: "/api/v1/auth/refresh" } as never, response as never, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
});

test("draining keeps health endpoints available", () => {
  const draining = new DrainingService();
  draining.beginDraining();
  let nextCalled = false;
  rejectNewWorkWhileDraining(draining)({ path: "/health/ready" } as never, {} as never, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
