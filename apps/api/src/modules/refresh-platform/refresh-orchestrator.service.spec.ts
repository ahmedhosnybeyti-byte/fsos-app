import { strict as assert } from "node:assert";
import test from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { RefreshOrchestratorService } from "./refresh-orchestrator.service";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function invalidValidation() {
  return { valid: false, checks: [{ passed: false, name: "structure", message: "Invalid structure" }] };
}

function harness(options: { owned?: boolean; validate?: () => Promise<ReturnType<typeof invalidValidation>> } = {}) {
  const creates: unknown[] = [];
  const updates: Array<{ data: { status?: string } }> = [];
  const sourceWrites: unknown[] = [];
  const service = new RefreshOrchestratorService(
    {
      dataSource: {
        findFirst: async () => options.owned === false ? null : { id: "source-1" },
        updateMany: async (args: unknown) => { sourceWrites.push(args); return { count: 1 }; },
      },
      refreshRun: {
        create: async (args: unknown) => { creates.push(args); return { id: `run-${creates.length}` }; },
        update: async (args: { data: { status?: string } }) => { updates.push(args); return { id: "run-1", ...args.data }; },
      },
    } as never,
    { record: async () => undefined } as never,
    { build: async () => ({}) } as never,
    { validate: options.validate ?? (async () => invalidValidation()) } as never,
    { run: async () => ({}) } as never,
    { emit: async () => undefined } as never,
  );
  return { service, creates, updates, sourceWrites };
}

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

test("concurrent refresh requests have one successful active-run claim", async () => {
  const gate = deferred<ReturnType<typeof invalidValidation>>();
  const { service, creates } = harness({ validate: async () => gate.promise });
  let successfulClaims = 0;
  const originalCreate = (service as unknown as { prisma: { refreshRun: { create: (args: unknown) => Promise<unknown> } } }).prisma.refreshRun.create;
  (service as unknown as { prisma: { refreshRun: { create: (args: unknown) => Promise<unknown> } } }).prisma.refreshRun.create = async (args) => {
    if (successfulClaims++ === 0) return originalCreate(args);
    throw new Prisma.PrismaClientKnownRequestError("active refresh exists", { code: "P2002", clientVersion: "test" });
  };

  const first = service.requestRefresh("company-a", "source-1", "user-a");
  await assert.rejects(
    () => service.requestRefresh("company-a", "source-1", "user-a"),
    (error: unknown) => error instanceof ConflictException,
  );
  gate.resolve(invalidValidation());
  await first;

  assert.equal(creates.length, 1);
});

test("a thrown refresh exception transitions its run to FAILED", async () => {
  const { service, updates } = harness({ validate: async () => { throw new Error("validation crashed"); } });

  await assert.rejects(() => service.requestRefresh("company-a", "source-1", "user-a"), /validation crashed/);

  assert.equal(updates.at(-1)?.data.status, "FAILED");
});
