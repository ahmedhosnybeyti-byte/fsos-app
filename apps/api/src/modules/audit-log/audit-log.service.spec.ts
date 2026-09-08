import { strict as assert } from "node:assert";
import test from "node:test";
import { Prisma } from "@field-sales-os/database";
import { AuditLogService } from "./audit-log.service";

function transientError() {
  return new Prisma.PrismaClientKnownRequestError("temporary database outage", {
    code: "P1001",
    clientVersion: "test",
  });
}

test("recovers a transient audit persistence failure without duplicating the event", async () => {
  const persisted = new Map<string, Record<string, unknown>>();
  const eventKeys: string[] = [];
  let calls = 0;
  const prisma = {
    auditLog: {
      upsert: async (input: { where: { eventKey: string }; create: Record<string, unknown> }) => {
        calls += 1;
        eventKeys.push(input.where.eventKey);
        persisted.set(input.where.eventKey, input.create);
        // Simulate an uncertain acknowledgement: the first write reached the
        // database but the caller must safely retry it with the same key.
        if (calls === 1) throw transientError();
        return persisted.get(input.where.eventKey);
      },
    },
  };
  const service = new AuditLogService(prisma as never);

  await service.record({ companyId: "company-1", action: "auth.login" });

  assert.equal(calls, 2);
  assert.equal(new Set(eventKeys).size, 1);
  assert.equal(persisted.size, 1);
  assert.equal([...persisted.values()][0]?.action, "auth.login");
});

test("surfaces a permanent audit persistence failure", async () => {
  const service = new AuditLogService({
    auditLog: { upsert: async () => { throw new Error("database rejected write"); } },
  } as never);

  await assert.rejects(
    service.record({ action: "company.update" }),
    /database rejected write/,
  );
});
