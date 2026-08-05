import { strict as assert } from "node:assert";
import test from "node:test";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";

const argon2MockTarget = (argon2 as unknown as { default?: typeof argon2 }).default ?? argon2;

const USER_ID = "user-1";
const COMPANY_ID = "company-1";
const CURRENT_PASSWORD = "Current1!Pass";
const NEW_PASSWORD = "Different2!Pass";
const STORED_HASH = "stored-password-hash";
const NEW_HASH = "new-password-hash";

function createHarness() {
  const passwordUpdates: Array<{ userId: string; passwordHash: string; mustChangePassword: boolean }> = [];
  const revokedUserIds: string[] = [];
  const auditEntries: unknown[] = [];

  const service = new AuthService(
    {} as never,
    {} as never,
    {
      findByIdWithPassword: async () => ({ id: USER_ID, companyId: COMPANY_ID, passwordHash: STORED_HASH }),
      setPasswordHash: async (userId: string, passwordHash: string, mustChangePassword: boolean) => {
        passwordUpdates.push({ userId, passwordHash, mustChangePassword });
      },
    } as never,
    {} as never,
    {
      revokeAllForUser: async (userId: string) => {
        revokedUserIds.push(userId);
      },
    } as never,
    {
      record: async (entry: unknown) => {
        auditEntries.push(entry);
      },
    } as never,
  );

  return { service, passwordUpdates, revokedUserIds, auditEntries };
}

test("changes the password, revokes refresh tokens, and records an audit event", async (t) => {
  const verifyMock = t.mock.method(argon2MockTarget, "verify", async (_hash: string, password: string | Buffer) => password === CURRENT_PASSWORD);
  const hashMock = t.mock.method(argon2MockTarget, "hash", async () => NEW_HASH);
  const harness = createHarness();

  await harness.service.changePassword(USER_ID, CURRENT_PASSWORD, NEW_PASSWORD);

  assert.equal(verifyMock.mock.callCount(), 2);
  assert.deepEqual(
    verifyMock.mock.calls.map((call) => call.arguments),
    [
      [STORED_HASH, CURRENT_PASSWORD],
      [STORED_HASH, NEW_PASSWORD],
    ],
  );
  assert.equal(hashMock.mock.callCount(), 1);
  assert.equal(hashMock.mock.calls[0]?.arguments[0], NEW_PASSWORD);
  assert.notEqual(NEW_HASH, STORED_HASH);
  assert.deepEqual(harness.passwordUpdates, [
    { userId: USER_ID, passwordHash: NEW_HASH, mustChangePassword: false },
  ]);
  assert.deepEqual(harness.revokedUserIds, [USER_ID]);
  assert.deepEqual(harness.auditEntries, [
    {
      companyId: COMPANY_ID,
      userId: USER_ID,
      action: "identity.password_change",
      entityType: "User",
      entityId: USER_ID,
    },
  ]);
});

test("rejects an incorrect current password without changing password state", async (t) => {
  const verifyMock = t.mock.method(argon2MockTarget, "verify", async () => false);
  const hashMock = t.mock.method(argon2MockTarget, "hash", async () => NEW_HASH);
  const harness = createHarness();

  await assert.rejects(
    () => harness.service.changePassword(USER_ID, "Wrong1!Pass", NEW_PASSWORD),
    (error: unknown) => {
      assert.ok(error instanceof UnauthorizedException);
      assert.equal(error.message, "Current password is incorrect");
      return true;
    },
  );

  assert.equal(verifyMock.mock.callCount(), 1);
  assert.equal(hashMock.mock.callCount(), 0);
  assert.deepEqual(harness.passwordUpdates, []);
  assert.deepEqual(harness.revokedUserIds, []);
  assert.deepEqual(harness.auditEntries, []);
});

test("rejects reuse of the current password before changing password state", async (t) => {
  const verifyMock = t.mock.method(argon2MockTarget, "verify", async () => true);
  const hashMock = t.mock.method(argon2MockTarget, "hash", async () => NEW_HASH);
  const harness = createHarness();

  await assert.rejects(
    () => harness.service.changePassword(USER_ID, CURRENT_PASSWORD, CURRENT_PASSWORD),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal((error.getResponse() as { code?: string }).code, "PASSWORD_REUSE_NOT_ALLOWED");
      return true;
    },
  );

  assert.equal(verifyMock.mock.callCount(), 2);
  assert.equal(hashMock.mock.callCount(), 0);
  assert.deepEqual(harness.passwordUpdates, []);
  assert.deepEqual(harness.revokedUserIds, []);
  assert.deepEqual(harness.auditEntries, []);
});
test("resets a target password, forces a change, revokes sessions, and audits the action", async (t) => {
  const passwordUpdates: Array<{ userId: string; mustChangePassword: boolean }> = [];
  const revoked: string[] = [];
  const audits: Array<{ action: string; entityId?: string | null }> = [];
  const hashMock = t.mock.method(argon2MockTarget, "hash", async () => NEW_HASH);
  const service = new AuthService(
    {} as never,
    {} as never,
    {
      findById: async () => ({ id: USER_ID, companyId: COMPANY_ID }),
      setPasswordHash: async (userId: string, _passwordHash: string, mustChangePassword: boolean) => passwordUpdates.push({ userId, mustChangePassword }),
    } as never,
    {} as never,
    { revokeAllForUser: async (userId: string) => revoked.push(userId) } as never,
    { record: async (entry: { action: string; entityId?: string | null }) => audits.push(entry) } as never,
  );

  const result = await service.resetPassword(USER_ID, { userId: "admin-1", companyId: null, email: "admin@example.test", roleCode: "SUPER_ADMIN", permissions: [], mustChangePassword: false, orgUnitId: null });

  assert.ok(result.temporaryPassword.length >= 12);
  assert.equal(hashMock.mock.callCount(), 1);
  assert.deepEqual(passwordUpdates, [{ userId: USER_ID, mustChangePassword: true }]);
  assert.deepEqual(revoked, [USER_ID]);
  assert.deepEqual(audits.map((entry) => entry.action), ["identity.password_reset", "identity.session_revoked"]);
});
test("prevents a company admin from resetting a user in another company", async (t) => {
  const passwordUpdates: unknown[] = [];
  const revoked: string[] = [];
  const audits: unknown[] = [];
  const hashMock = t.mock.method(argon2MockTarget, "hash", async () => NEW_HASH);
  const service = new AuthService(
    {} as never,
    {} as never,
    { findById: async () => ({ id: USER_ID, companyId: "other-company" }), setPasswordHash: async (...args: unknown[]) => passwordUpdates.push(args) } as never,
    {} as never,
    { revokeAllForUser: async (userId: string) => revoked.push(userId) } as never,
    { record: async (entry: unknown) => audits.push(entry) } as never,
  );

  await assert.rejects(
    () => service.resetPassword(USER_ID, { userId: "company-admin-1", companyId: COMPANY_ID, email: "admin@example.test", roleCode: "COMPANY_ADMIN", permissions: [], mustChangePassword: false, orgUnitId: null }),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(hashMock.mock.callCount(), 0);
  assert.deepEqual(passwordUpdates, []);
  assert.deepEqual(revoked, []);
  assert.deepEqual(audits, []);
});
test("creates trial companies with files enabled while retaining the four locked screens", async () => {
  const companyUpdates: Array<{ where: { id: string }; data: { status: string; featureAccess: Record<string, string> } }> = [];
  const service = new AuthService(
    {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        company: {
          update: async (input: { where: { id: string }; data: { status: string; featureAccess: Record<string, string> } }) => {
            companyUpdates.push(input);
            return { id: COMPANY_ID, ...input.data };
          },
        },
      }),
    } as never,
    { provisionCompany: async () => ({ company: { id: COMPANY_ID } }) } as never,
    {
      findByEmail: async () => null,
      createCompanyAdmin: async () => ({ id: USER_ID }),
      findById: async () => ({ id: USER_ID }),
    } as never,
    { createInitialSubscription: async () => ({ status: "TRIAL" }) } as never,
    {
      signAccessToken: () => "access-token",
      issueRefreshToken: async () => "refresh-token",
    } as never,
    { record: async () => undefined } as never,
  );

  await service.register(
    { companyName: "Trial Files Co", fullName: "Trial Admin", email: "trial-files@example.test", password: "Password1!", whatsapp: "+966500000000", accountType: "COMPANY" },
    { ip: "127.0.0.1", userAgent: "test" },
  );

  assert.deepEqual(companyUpdates, [{
    where: { id: COMPANY_ID },
    data: {
      status: "ACTIVE",
      featureAccess: { files: "ENABLED", assistant: "LOCKED", "fsos-360": "LOCKED", settings: "LOCKED", account: "LOCKED" },
    },
  }]);
});
