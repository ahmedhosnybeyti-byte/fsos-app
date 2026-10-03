import { strict as assert } from "node:assert";
import test from "node:test";
import { UserActivityService } from "./user-activity.service";

const rawUser = {
  id: "user-1",
  companyId: "company-1",
  roleId: "role-1",
  email: "manager@example.test",
  fullName: "Manager User",
  status: "ACTIVE",
  orgUnitId: "org-1",
  passwordHash: "$argon2id$secret",
  mustChangePassword: true,
  sessionVersion: 7,
  gptLaunchCodeQuotaDay: new Date("2026-10-03T00:00:00.000Z"),
  gptLaunchCodeIssuedToday: 3,
  discoveryQuotaDay: new Date("2026-10-03T00:00:00.000Z"),
  discoveryIssuedToday: 4,
  whatsapp: "+966500000000",
  company: { id: "company-1", name: "Acme" },
  orgUnit: { id: "org-1", name: "Riyadh" },
  role: { id: "role-1", code: "MANAGER", name: "Manager" },
  employee: { id: "employee-1", managerId: null },
};

const sensitiveUserFields = [
  "passwordHash",
  "mustChangePassword",
  "sessionVersion",
  "gptLaunchCodeQuotaDay",
  "gptLaunchCodeIssuedToday",
  "discoveryQuotaDay",
  "discoveryIssuedToday",
  "whatsapp",
];

function createHarness() {
  const calls: Array<Record<string, unknown>> = [];
  const service = new UserActivityService({
    user: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        const select = args.select as Record<string, unknown> | undefined;
        if (select && Object.keys(select).length === 1 && select.id === true) return [{ id: rawUser.id }];
        // Deliberately return a full user object even after a select request.
        // The DTO is therefore independently tested as the final response guard.
        return [rawUser];
      },
    },
  } as never);
  return { service, calls };
}

function assertSafeResponse(users: Array<Record<string, unknown>>) {
  assert.equal(users.length, 1);
  for (const field of sensitiveUserFields) assert.equal(field in users[0]!, false, `${field} must not be returned`);
  assert.deepEqual(users[0], {
    id: "user-1",
    companyId: "company-1",
    roleId: "role-1",
    email: "manager@example.test",
    fullName: "Manager User",
    status: "ACTIVE",
    orgUnitId: "org-1",
    company: { id: "company-1", name: "Acme" },
    orgUnit: { id: "org-1", name: "Riyadh" },
    role: { id: "role-1", code: "MANAGER", name: "Manager" },
    employee: { id: "employee-1", managerId: null },
  });
}

function assertSafePrismaSelection(call: Record<string, unknown>) {
  assert.equal("include" in call, false);
  const select = call.select as Record<string, unknown>;
  assert.ok(select);
  for (const field of sensitiveUserFields) assert.equal(field in select, false, `${field} must not be selected`);
}

const superAdmin = { userId: "admin-1", roleCode: "SUPER_ADMIN", companyId: null } as never;

test("search uses a public projection and never returns authentication-sensitive user fields", async () => {
  const { service, calls } = createHarness();
  const users = await service.search(superAdmin, "manager");
  assertSafePrismaSelection(calls[1]!);
  assertSafeResponse(users);
});

test("tree uses a public projection and never returns authentication-sensitive user fields", async () => {
  const { service, calls } = createHarness();
  const users = await service.tree(superAdmin);
  assertSafePrismaSelection(calls[1]!);
  assertSafeResponse(users);
});
