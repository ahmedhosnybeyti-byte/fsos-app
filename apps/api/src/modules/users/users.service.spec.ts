import { strict as assert } from "node:assert";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import * as argon2 from "argon2";
import { createUserSchema } from "@field-sales-os/schemas";
import { UsersService } from "./users.service";

const argon2MockTarget = (argon2 as unknown as { default?: typeof argon2 }).default ?? argon2;

function createHarness(create: (args: { data: { companyId: string; mustChangePassword: boolean; passwordHash: string } }) => Promise<unknown>) {
  const audits: Array<{ action: string; entityId?: string | null }> = [];
  const service = new UsersService(
    {
      user: { count: async () => 0, create },
      subscription: { findFirst: async () => null },
    } as never,
    { findByCode: async () => ({ id: "role-1", code: "SALES_REP" }) } as never,
    {} as never,
    { record: async (entry: { action: string; entityId?: string | null }) => audits.push(entry) } as never,
    { listCompanyRouteIds: async () => [] } as never,
  );
  return { service, audits };
}

test("normalizes a company-user email and rejects SUPER_ADMIN", () => {
  const parsed = createUserSchema.parse({ email: "  USER@EXAMPLE.TEST  ", fullName: "User Name", roleCode: "SALES_REP", password: "Valid1!Pass" });
  assert.equal(parsed.email, "user@example.test");
  assert.throws(() => createUserSchema.parse({ ...parsed, roleCode: "SUPER_ADMIN" }));
});

test("creates a user in the selected company, forces a password change, and audits creation", async (t) => {
  const createCalls: Array<{ data: { companyId: string; mustChangePassword: boolean; passwordHash: string } }> = [];
  const hashMock = t.mock.method(argon2MockTarget, "hash", async () => "new-hash");
  const { service, audits } = createHarness(async (args: { data: { companyId: string; mustChangePassword: boolean; passwordHash: string } }) => {
    createCalls.push(args);
    return { id: "user-1", status: "ACTIVE" };
  });

  await service.createUser("company-1", { email: "user@example.test", fullName: "User Name", roleCode: "SALES_REP", password: "Valid1!Pass" }, "actor-1");

  assert.equal(hashMock.mock.callCount(), 1);
  assert.deepEqual(createCalls[0]?.data.companyId, "company-1");
  assert.equal(createCalls[0]?.data.mustChangePassword, true);
  assert.deepEqual(audits.map((entry) => entry.action), ["user.create"]);
});

test("maps a duplicate company-user email to conflict", async () => {
  const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test", meta: { target: ["email"] } });
  const { service } = createHarness(async () => { throw duplicate; });
  await assert.rejects(
    () => service.createUser("company-1", { email: "user@example.test", fullName: "User Name", roleCode: "SALES_REP", password: "Valid1!Pass" }, "actor-1"),
    (error: unknown) => error instanceof ConflictException,
  );
});