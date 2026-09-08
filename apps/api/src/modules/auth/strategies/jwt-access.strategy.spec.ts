import { strict as assert } from "node:assert";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { JwtAccessStrategy } from "./jwt-access.strategy";

function createStrategy(sessionVersion: number) {
  return new JwtAccessStrategy(
    { values: { jwt: { accessSecret: "test" } } } as never,
    {
      user: {
        findUnique: async () => ({
          id: "user-1", companyId: "company-1", email: "user@example.test", status: "ACTIVE",
          sessionVersion, roleId: "role-1", role: { code: "SALES_REP" }, company: { status: "ACTIVE", featureAccess: null },
          mustChangePassword: false, orgUnitId: null, trialStartsAt: null, trialEndsAt: null,
        }),
      },
    } as never,
    { getPermissionCodes: async () => [] } as never,
  );
}

test("rejects an access token immediately after its session version is revoked", async () => {
  const strategy = createStrategy(2);
  await assert.rejects(() => strategy.validate({ sub: "user-1", sv: 1 }), UnauthorizedException);
});

test("accepts an access token for the current session version", async () => {
  const strategy = createStrategy(2);
  const user = await strategy.validate({ sub: "user-1", sv: 2 });
  assert.equal(user.userId, "user-1");
});
