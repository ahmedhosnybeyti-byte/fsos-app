import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import { SfaAccessGuard } from "../../common/guards/sfa-access.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { VisitExecutionController } from "./visit-execution.controller";

test("every visit/photo route requires explicit rep permissions and current SFA/Full ERP activation", async () => {
  const reflector = new Reflector();
  const roles = new RolesGuard(reflector, { record: async () => undefined } as never);
  const modes: Record<string, string> = { a: "SFA", b: "FULL_ERP", c: "ANALYSIS_ONLY" };
  const sfa = new SfaAccessGuard(reflector, { companyOperatingSettings: { findUnique: async ({ where }: any) => modes[where.companyId] ? { operatingMode: modes[where.companyId] } : null } } as never);
  for (const method of ["access", "start", "read", "context", "save", "upload", "photoUrl"] as const) {
    for (const [roleCode, companyId, permissions, expected] of [
      ["SALES_REP", "a", ["sfa.access", "visits.execute"], true],
      ["SALES_REP", "b", ["sfa.access", "visits.execute"], true],
      ["SALES_REP", "c", ["sfa.access", "visits.execute"], false],
      ["SALES_REP", "missing", ["sfa.access", "visits.execute"], false],
      ["SALES_REP", "a", ["sfa.access"], false],
      ["SALES_REP", "a", ["visits.execute"], false],
      ["COMPANY_ADMIN", "a", ["sfa.access", "visits.execute"], false],
      ["SUPER_ADMIN", null, ["sfa.access", "visits.execute"], false],
    ] as const) {
      const ctx = { getClass: () => VisitExecutionController, getHandler: () => VisitExecutionController.prototype[method],
        switchToHttp: () => ({ getRequest: () => ({ user: { roleCode, companyId, permissions }, body: { companyId: "a", repId: "other", operatingMode: "SFA" } }) }) } as never;
      const call = async () => { await roles.canActivate(ctx); return sfa.canActivate(ctx); };
      if (expected) assert.equal(await call(), true); else await assert.rejects(call(), ForbiddenException);
    }
  }
});
