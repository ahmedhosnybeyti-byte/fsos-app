import assert from "node:assert/strict";
import test from "node:test";
import {
  RIE_POSTGRES_CONCURRENCY, RieExecutionCoordinatorService,
  RieExecutionQueueTimeoutError, RieExecutionQueueCancelledError,
} from "../../apps/api/src/modules/rie/rie-execution-coordinator.service";

test("timed-out and cancelled admission never executes SQL and leaves no leaked permits", async (t) => {
  const coordinator = new RieExecutionCoordinatorService();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  t.after(release);
  let started = 0;
  const holders = Array.from({ length: RIE_POSTGRES_CONCURRENCY }, (_, i) => coordinator.runRequest(`holder-${i}`, () => coordinator.execute("fixture", async () => {
    started++; await held;
  })));
  // Yield until all holders enter admission; do not use wall-clock sleeps.
  for (let i = 0; started < RIE_POSTGRES_CONCURRENCY && i < 100; i++) await Promise.resolve();
  assert.equal(started, RIE_POSTGRES_CONCURRENCY);
  let forbiddenCalls = 0;
  await assert.rejects(coordinator.runRequest("timeout", () => coordinator.execute("must-not-run", async () => { forbiddenCalls++; }, { timeoutMs: 5 })), RieExecutionQueueTimeoutError);
  const controller = new AbortController();
  const cancelled = coordinator.runRequest("cancel", () => coordinator.execute("must-not-run", async () => { forbiddenCalls++; }, { signal: controller.signal }));
  const rejected = assert.rejects(cancelled, RieExecutionQueueCancelledError);
  controller.abort(); await rejected;
  assert.equal(forbiddenCalls, 0);
  release(); await Promise.all(holders);
  const recovered = await Promise.all(Array.from({ length: RIE_POSTGRES_CONCURRENCY }, (_, i) => coordinator.runRequest(`recovered-${i}`, () => coordinator.execute("ok", async () => i, { timeoutMs: 500 }))));
  assert.equal(recovered.length, RIE_POSTGRES_CONCURRENCY);
});
