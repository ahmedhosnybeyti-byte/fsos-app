import { strict as assert } from "node:assert";
import test from "node:test";
import { FilesService } from "./files.service";

function createService(prisma: Record<string, unknown>) {
  return new FilesService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

test("workbook claim is conditional so exactly one concurrent worker wins", async () => {
  let available = true;
  const claims: unknown[] = [];
  const service = createService({
    workbookIngestionRun: {
      updateMany: async (query: unknown) => {
        claims.push(query);
        if (!available) return { count: 0 };
        available = false;
        return { count: 1 };
      },
      findUnique: async () => null,
    },
  });
  await Promise.all([service.processQueuedWorkbookRun("run-1"), service.processQueuedWorkbookRun("run-1")]);
  assert.equal(claims.length, 2);
  assert.deepEqual((claims[0] as { where: unknown }).where, { id: "run-1", status: "QUEUED" });
});

test("stale RUNNING jobs are put back into QUEUED without creating a new job", async () => {
  let query: unknown;
  const service = createService({
    workbookIngestionRun: {
      updateMany: async (value: unknown) => { query = value; return { count: 2 }; },
    },
  });
  const staleBefore = new Date("2026-09-08T00:00:00.000Z");
  assert.equal(await service.recoverStaleWorkbookRuns(staleBefore), 2);
  assert.deepEqual(query, {
    where: { status: "RUNNING", startedAt: { lt: staleBefore } },
    data: { status: "QUEUED", startedAt: null },
  });
});
