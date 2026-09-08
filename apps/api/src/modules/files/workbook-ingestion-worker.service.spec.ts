import { strict as assert } from "node:assert";
import test from "node:test";
import { WorkbookIngestionWorkerService } from "./workbook-ingestion-worker.service";

test("two worker replicas may see a queued run but only the atomic service claim can process it", async () => {
  let claimed = 0;
  const files = {
    processQueuedWorkbookRun: async () => { claimed += 1; },
    recoverStaleWorkbookRuns: async () => 0,
  };
  const queue = [{ id: "run-1" }];
  const prisma = {
    workbookIngestionRun: {
      findFirst: async () => queue.shift() ?? null,
    },
  };
  const first = new WorkbookIngestionWorkerService(prisma as never, files as never);
  const second = new WorkbookIngestionWorkerService(prisma as never, files as never);
  await Promise.all([first.processNextQueuedRun(), second.processNextQueuedRun()]);
  assert.equal(claimed, 1);
});

test("startup recovery delegates stale RUNNING jobs to the durable queue recovery", async () => {
  let staleBefore: Date | undefined;
  const files = {
    processQueuedWorkbookRun: async () => undefined,
    recoverStaleWorkbookRuns: async (value: Date) => { staleBefore = value; return 1; },
  };
  const worker = new WorkbookIngestionWorkerService({ workbookIngestionRun: { findFirst: async () => null } } as never, files as never);
  await worker.onApplicationBootstrap();
  assert.ok(staleBefore instanceof Date);
  assert.ok(staleBefore.getTime() < Date.now());
});
