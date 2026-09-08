import { strict as assert } from "node:assert";
import test from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { RefreshOrchestratorService } from "./refresh-orchestrator.service";

function invalidValidation() {
  return { valid: false, checks: [{ passed: false, name: "structure", message: "Invalid structure" }] };
}

function harness(options: { owned?: boolean; validate?: () => Promise<ReturnType<typeof invalidValidation>> } = {}) {
  const creates: unknown[] = [];
  const updates: Array<{ data: { status?: string } }> = [];
  const updateManyCalls: Array<{ where: { status?: string }; data: { status?: string; startedAt?: Date | null } }> = [];
  const sourceWrites: unknown[] = [];
  const validationCalls: unknown[] = [];
  let claimCount = 1;
  const service = new RefreshOrchestratorService(
    {
      dataSource: {
        findFirst: async () => options.owned === false ? null : { id: "source-1" },
        updateMany: async (args: unknown) => { sourceWrites.push(args); return { count: 1 }; },
      },
      refreshRun: {
        create: async (args: { data: { status?: string } }) => { creates.push(args); return { id: `run-${creates.length}`, ...args.data }; },
        update: async (args: { data: { status?: string } }) => { updates.push(args); return { id: "run-1", ...args.data }; },
        updateMany: async (args: { where: { status?: string }; data: { status?: string; startedAt?: Date | null } }) => {
          updateManyCalls.push(args);
          return { count: args.where.status === "QUEUED" ? claimCount-- : 1 };
        },
        findUniqueOrThrow: async () => ({ id: "run-1", companyId: "company-a", dataSourceId: "source-1", triggeredByUserId: "user-a" }),
      },
    } as never,
    { record: async () => undefined } as never,
    { build: async () => ({}) } as never,
    { validate: async () => { validationCalls.push(true); return options.validate ? options.validate() : invalidValidation(); } } as never,
    { run: async () => ({}) } as never,
    { emit: async () => undefined } as never,
  );
  return { service, creates, updates, updateManyCalls, sourceWrites, validationCalls };
}

test("HTTP enqueue returns QUEUED without executing refresh work", async () => {
  const { service, creates, validationCalls } = harness();
  const run = await service.requestRefresh("company-a", "source-1", "user-a");

  assert.equal((run as { status?: string }).status, "QUEUED");
  assert.equal(((creates[0] as { data?: { status?: string } }).data?.status), "QUEUED");
  assert.equal(validationCalls.length, 0);
});

test("cross-company refresh creates no run and makes no source write", async () => {
  const { service, creates, updates, sourceWrites } = harness({ owned: false });

  await assert.rejects(
    () => service.requestRefresh("company-a", "source-owned-by-b", "user-a"),
    (error: unknown) => error instanceof NotFoundException,
  );

  assert.equal(creates.length, 0);
  assert.equal(updates.length, 0);
  assert.equal(sourceWrites.length, 0);
});

test("duplicate refresh remains rejected and workers can claim only once", async () => {
  const { service, creates } = harness();
  let successfulClaims = 0;
  const originalCreate = (service as unknown as { prisma: { refreshRun: { create: (args: unknown) => Promise<unknown> } } }).prisma.refreshRun.create;
  (service as unknown as { prisma: { refreshRun: { create: (args: unknown) => Promise<unknown> } } }).prisma.refreshRun.create = async (args) => {
    if (successfulClaims++ === 0) return originalCreate(args);
    throw new Prisma.PrismaClientKnownRequestError("active refresh exists", { code: "P2002", clientVersion: "test" });
  };

  await service.requestRefresh("company-a", "source-1", "user-a");
  await assert.rejects(
    () => service.requestRefresh("company-a", "source-1", "user-a"),
    (error: unknown) => error instanceof ConflictException,
  );
  assert.equal(creates.length, 1);
  assert.equal(await service.processQueuedRun("run-1"), true);
  assert.equal(await service.processQueuedRun("run-1"), false);
});

test("a thrown refresh exception transitions its run to FAILED", async () => {
  const { service, updates } = harness({ validate: async () => { throw new Error("validation crashed"); } });

  await service.processQueuedRun("run-1");

  assert.equal(updates.at(-1)?.data.status, "FAILED");
});

test("stale RUNNING jobs are requeued for restart recovery", async () => {
  const { service, updateManyCalls } = harness();
  assert.equal(await service.recoverStaleRunningRuns(new Date("2026-09-08T00:00:00.000Z")), 1);
  const recovery = updateManyCalls.at(-1);
  assert.equal(recovery?.where.status, "RUNNING");
  assert.equal(recovery?.data.status, "QUEUED");
  assert.equal(recovery?.data.startedAt, null);
});
