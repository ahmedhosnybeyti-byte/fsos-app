import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import { SfaSetupController } from "./sfa-setup.controller";
import { SfaAccessGuard } from "../../common/guards/sfa-access.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CompanyScreenAccessGuard } from "../../common/guards/company-screen-access.guard";

test("all setup routes require company-admin role, explicit permissions and current SFA mode", async () => {
  const reflector = new Reflector();
  const roleGuard = new RolesGuard(reflector, { record: async () => undefined } as never);
  const modes: Record<string, string> = { a: "SFA", b: "ANALYSIS_ONLY" };
  const sfaGuard = new SfaAccessGuard(reflector, { companyOperatingSettings: { findUnique: async ({ where }: any) => modes[where.companyId] ? { operatingMode: modes[where.companyId] } : null } } as never);
  for (const method of ["checklist", "list", "get", "create", "update", "setBranches"] as const) {
    for (const [roleCode, companyId, permissions, expected] of [
      ["COMPANY_ADMIN", "a", ["sfa.access", "company.manage"], true],
      ["COMPANY_ADMIN", "b", ["sfa.access", "company.manage"], false],
      ["COMPANY_ADMIN", "missing", ["sfa.access", "company.manage"], false],
      ["COMPANY_ADMIN", "a", ["company.manage"], false],
      ["COMPANY_ADMIN", "a", ["sfa.access"], false],
      ["SALES_REP", "a", ["sfa.access", "company.manage"], false],
      ["SUPER_ADMIN", null, ["sfa.access", "company.manage"], false],
    ] as const) {
      const ctx = { getClass: () => SfaSetupController, getHandler: () => SfaSetupController.prototype[method],
        switchToHttp: () => ({ getRequest: () => ({ user: { roleCode, companyId, permissions }, body: { companyId: "a" } }) }) } as never;
      const call = async () => { await roleGuard.canActivate(ctx); return sfaGuard.canActivate(ctx); };
      if (expected) assert.equal(await call(), true); else await assert.rejects(call(), ForbiddenException);
    }
  }
});

test("controller derives tenant and actor from authentication only", async () => {
  const calls: unknown[] = [];
  const controller = new SfaSetupController({ create: (...args: unknown[]) => { calls.push(args); } } as never);
  controller.create({ companyId: "a", userId: "actor" } as never, { code: "A", name: "Main" });
  assert.deepEqual(calls, [["a", { code: "A", name: "Main" }, "actor"]]);
  assert.throws(() => controller.checklist({ companyId: null } as never), ForbiddenException);
});

test("every direct setup API requires the existing company screen gate even when SFA is enabled", async () => {
  const reflector = new Reflector();
  for (const method of ["checklist", "list", "get", "create", "update", "setBranches"] as const) {
    for (const state of [undefined, "HIDDEN", "LOCKED", "ENABLED"]) {
      const queries: unknown[] = [];
      const guard = new CompanyScreenAccessGuard(reflector, { company: { findUnique: async (query: unknown) => {
        queries.push(query); return { featureAccess: state ? { "sfa-setup": state } : {} };
      } } } as never);
      const ctx = { getClass: () => SfaSetupController, getHandler: () => SfaSetupController.prototype[method],
        switchToHttp: () => ({ getRequest: () => ({ user: { roleCode: "COMPANY_ADMIN", companyId: "company-a" }, body: { companyId: "company-b" } }) }) } as never;
      if (state === "ENABLED") assert.equal(await guard.canActivate(ctx), true);
      else await assert.rejects(guard.canActivate(ctx), ForbiddenException);
      assert.deepEqual(queries, [{ where: { id: "company-a" }, select: { featureAccess: true } }]);
    }
  }
});
