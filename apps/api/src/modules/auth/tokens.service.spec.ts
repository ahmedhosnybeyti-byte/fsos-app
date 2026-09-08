import { strict as assert } from "node:assert";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { TokensService } from "./tokens.service";

const USER_ID = "user-1";

function createRotationHarness() {
  let revoked = false;
  let sessionVersion = 0;
  const refreshTokens: Array<Record<string, unknown>> = [];
  const record = {
    id: "refresh-1", userId: USER_ID, tokenHash: "hash", revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000), sessionStartedAt: new Date(), createdAt: new Date(), sessionVersion,
  };
  const prisma = {
    refreshToken: {
      findUnique: async ({ where, select }: { where: Record<string, string>; select?: Record<string, boolean> }) => {
        if (where.tokenHash) return { ...record, revokedAt: revoked ? new Date() : null };
        if (select) return { revokedAt: revoked ? new Date() : null };
        return null;
      },
      updateMany: async () => {
        if (revoked) return { count: 0 };
        revoked = true;
        return { count: 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => { refreshTokens.push(data); return data; },
    },
    user: {
      findUnique: async () => ({ status: "ACTIVE", sessionVersion, company: { status: "ACTIVE" } }),
      update: async () => { sessionVersion += 1; },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      user: { update: async () => { sessionVersion += 1; } },
      refreshToken: { updateMany: async () => ({ count: 1 }) },
    }),
  };
  const service = new TokensService(
    { sign: () => "access" } as never,
    { values: { jwt: { accessSecret: "test" } } } as never,
    prisma as never,
  );
  return { service, refreshTokens };
}

test("atomically consumes a refresh token so only one concurrent rotation succeeds", async () => {
  const { service, refreshTokens } = createRotationHarness();
  const results = await Promise.allSettled([
    service.rotateRefreshToken("same-refresh-token"),
    service.rotateRefreshToken("same-refresh-token"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(refreshTokens.length, 1);
});

test("revoking all sessions increments the access-token session version", async () => {
  const { service } = createRotationHarness();
  await service.revokeAllForUser(USER_ID);
  assert.equal(await service.getSessionVersion(USER_ID), 1);
});
