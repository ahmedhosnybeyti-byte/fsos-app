import { strict as assert } from "node:assert";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { CompanyScreenAccessGuard } from "./company-screen-access.guard";

const contextFor = (user: { roleCode: string; companyId: string | null }) => ({
  getHandler: () => undefined,
  getClass: () => undefined,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
}) as never;

const guardFor = (featureAccess: unknown, calls: string[] = []) => new CompanyScreenAccessGuard(
  { getAllAndOverride: () => "user_activity" } as never,
  { company: { findUnique: async ({ where }: { where: { id: string } }) => { calls.push(where.id); return { featureAccess }; } } } as never,
);

test("allows an enabled User Activity screen for the request company", async () => {
  const calls: string[] = [];
  await assert.doesNotReject(() => guardFor({ user_activity: "ENABLED" }, calls).canActivate(contextFor({ roleCode: "COMPANY_ADMIN", companyId: "company-a" })));
  assert.deepEqual(calls, ["company-a"]);
});

test("returns 403 when User Activity is disabled for the request company", async () => {
  await assert.rejects(
    () => guardFor({ user_activity: "HIDDEN" }).canActivate(contextFor({ roleCode: "COMPANY_ADMIN", companyId: "company-a" })),
    (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403,
  );
});

test("SUPER_ADMIN bypasses company screen access without a company lookup", async () => {
  const calls: string[] = [];
  await assert.doesNotReject(() => guardFor({ user_activity: "HIDDEN" }, calls).canActivate(contextFor({ roleCode: "SUPER_ADMIN", companyId: null })));
  assert.deepEqual(calls, []);
});

test("uses only the authenticated user's company when enforcing the screen", async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => guardFor({ user_activity: "HIDDEN" }, calls).canActivate(contextFor({ roleCode: "MANAGER", companyId: "company-a" })),
    ForbiddenException,
  );
  assert.deepEqual(calls, ["company-a"]);
});
