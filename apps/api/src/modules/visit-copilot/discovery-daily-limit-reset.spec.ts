import { strict as assert } from "node:assert";
import test from "node:test";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { VisitCopilotController } from "./visit-copilot.controller";
import { VisitCopilotService } from "./visit-copilot.service";

const actor = (roleCode: AuthenticatedUser["roleCode"]): AuthenticatedUser => ({
  userId: "super-admin", companyId: null, email: "super@example.com", roleCode, permissions: [], mustChangePassword: false, orgUnitId: null,
});

test("Super Admin reset restores only the target user's Google Discovery quota and writes an audit record", async () => {
  let updateArgs: unknown;
  let auditEntry: unknown;
  const prisma = {
    user: {
      findUnique: async () => ({ id: "target-user", companyId: "company-1", company: { profile: { timeZone: "Asia/Riyadh" } } }),
      update: async (args: unknown) => { updateArgs = args; return {}; },
    },
  };
  const audit = { record: async (entry: unknown) => { auditEntry = entry; } };
  const service = new VisitCopilotService({} as never, {} as never, prisma as never, {} as never, {} as never, {} as never, audit as never, {} as never);

  const result = await service.resetDiscoveryDailyLimit(actor("SUPER_ADMIN"), "target-user");

  const update = updateArgs as { where: { id: string }; data: { discoveryQuotaDay: unknown; discoveryIssuedToday: number } };
  const auditRecord = auditEntry as unknown as { companyId: string; userId: string; action: string; entityType: string; entityId: string; metadata: { targetUserId: string; actorUserId: string; dailyLimit: number } };
  assert.equal(update.where.id, "target-user");
  assert.equal(update.data.discoveryIssuedToday, 0);
  assert.ok(update.data.discoveryQuotaDay instanceof Date);
  assert.equal(auditRecord.companyId, "company-1");
  assert.equal(auditRecord.userId, "super-admin");
  assert.equal(auditRecord.action, "visit_copilot.google_discovery.daily_limit.reset");
  assert.equal(auditRecord.entityType, "User");
  assert.equal(auditRecord.entityId, "target-user");
  assert.equal(auditRecord.metadata.targetUserId, "target-user");
  assert.equal(auditRecord.metadata.actorUserId, "super-admin");
  assert.equal(auditRecord.metadata.dailyLimit, 3);
  assert.equal(result.remaining, 3);
});

test("non-Super Admin roles cannot reset the Discovery limit even through the service", async () => {
  const service = new VisitCopilotService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  for (const role of ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"] as const) {
    await assert.rejects(() => service.resetDiscoveryDailyLimit(actor(role), "target-user"), { status: 403 });
  }
});

test("a user whose daily Discovery quota is exhausted remains blocked until a reset", async () => {
  const prisma = {
    user: {
      findUnique: async () => ({ company: { profile: { timeZone: "Asia/Riyadh" } } }),
      updateMany: async () => ({ count: 0 }),
    },
  };
  const service = new VisitCopilotService({} as never, {} as never, prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const reserve = (service as unknown as { reserveDiscoveryQuota(user: AuthenticatedUser): Promise<number> }).reserveDiscoveryQuota.bind(service);
  await assert.rejects(() => reserve(actor("SALES_REP")), { status: 403 });
});

test("the reset endpoint is restricted to SUPER_ADMIN", () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, VisitCopilotController.prototype.resetDiscoveryDailyLimit), ["SUPER_ADMIN"]);
});
