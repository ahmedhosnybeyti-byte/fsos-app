import assert from "node:assert/strict";
import test from "node:test";
import { Controller, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RequiresSfa } from "../decorators/requires-sfa.decorator";
import { SfaAccessGuard } from "./sfa-access.guard";
import { FilesController } from "../../modules/files/files.controller";
import { VisitCopilotController } from "../../modules/visit-copilot/visit-copilot.controller";
import { SmartLoadingController } from "../../modules/smart-loading/smart-loading.controller";

@Controller("sfa/test")
@RequiresSfa("sfa.test.read")
class SfaTestController {
  read() {}
  @RequiresSfa("sfa.test.write")
  write() {}
}

@Controller("sfa/forgotten")
class UnmarkedSfaController { read() {} }

@Controller("sfa/specialist")
class SpecialistController {
  @RequiresSfa("wms.read") warehouse() {}
  @RequiresSfa("accounting.read") accounting() {}
  @RequiresSfa("procurement.read", "wms.read") procurement() {}
}

test("specialist duties cannot be crossed by forged broad grants; company administration stays separate", async () => {
  for (const [role, own] of [["WAREHOUSE_KEEPER", "warehouse"], ["ACCOUNTANT", "accounting"], ["PROCUREMENT", "procurement"]] as const) {
    for (const method of ["warehouse", "accounting", "procurement"] as const) {
      const f = fixture("FULL_ERP");
      const request = context(SpecialistController, SpecialistController.prototype[method], { ...actor, roleCode: role, permissions: ["sfa.access", "wms.read", "accounting.read", "procurement.read"] });
      // Procurement needs the existing warehouse picker, but no accounting.
      if (method === own || (role === "PROCUREMENT" && method === "warehouse")) assert.equal(await f.guard.canActivate(request), true);
      else { await assert.rejects(f.guard.canActivate(request), ForbiddenException); assert.equal(f.calls.length, 0); }
    }
  }
  for (const method of ["warehouse", "accounting", "procurement"] as const) {
    const f = fixture("FULL_ERP");
    await assert.rejects(f.guard.canActivate(context(SpecialistController, SpecialistController.prototype[method], { ...actor, roleCode: "COMPANY_ADMIN", permissions: ["sfa.access", "wms.read", "accounting.read", "procurement.read"] })), ForbiddenException);
    assert.equal(f.calls.length, 0);
  }
});

test("company admin read-only capability admits exact GET views and denies all mutations and unrelated reads", async () => {
  const user = {...actor,roleCode:"COMPANY_ADMIN",permissions:["sfa.access","erp.admin.read","wms.products.manage","accounting.journal.post"]};
  for (const [method,path,allowed] of [
    ["GET","/api/v1/sfa/wms/warehouses",true],
    ["GET","/api/v1/sfa/wms/warehouses/wa/products?page=1",true],
    ["POST","/api/v1/sfa/wms/warehouses/wa/products",false],
    ["PATCH","/api/v1/sfa/wms/warehouses/wa/products/p",false],
    ["DELETE","/api/v1/sfa/wms/warehouses/wa/products/p",false],
    ["GET","/api/v1/sfa/wms/warehouses/wa/movements",false],
    ["GET","/api/v1/sfa/wms/warehouses/wa/access",false],
  ] as const) {
    const f=fixture("FULL_ERP"),request={getClass:()=>SpecialistController,getHandler:()=>SpecialistController.prototype.warehouse,switchToHttp:()=>({getRequest:()=>({user,method,originalUrl:path})})} as never;
    if(allowed)assert.equal(await f.guard.canActivate(request),true);else {await assert.rejects(f.guard.canActivate(request),ForbiddenException);assert.equal(f.calls.length,0);}
  }
});

const actor = { companyId: "company-a", roleCode: "SALES_REP", permissions: ["sfa.access", "sfa.test.read"] };
const context = (controller: Function, handler: Function, user: unknown = actor) => ({
  getClass: () => controller, getHandler: () => handler,
  switchToHttp: () => ({ getRequest: () => ({ user, body: { companyId: "company-b", operatingMode: "SFA" } }) }),
}) as never;

function fixture(mode: string | null = "SFA") {
  const calls: unknown[] = [];
  const state = { mode };
  const guard = new SfaAccessGuard(new Reflector(), {
    companyOperatingSettings: { findUnique: async (query: unknown) => {
      calls.push(query);
      return state.mode === null ? null : { operatingMode: state.mode };
    } },
  } as never);
  return { guard, calls, state };
}

test("legacy Excel, Visit Copilot and Smart Loading endpoints bypass the SFA gate without database work", async () => {
  const { guard, calls } = fixture(null);
  for (const controller of [FilesController, VisitCopilotController, SmartLoadingController]) {
    for (const name of Object.getOwnPropertyNames(controller.prototype).filter((name) => name !== "constructor")) {
      const handler = (controller.prototype as unknown as Record<string, Function>)[name]!;
      assert.equal(await guard.canActivate(context(controller, handler)), true, `${controller.name}.${name}`);
    }
  }
  assert.deepEqual(calls, []);
});

test("old, analysis-only and invalid settings cannot enable SFA", async () => {
  for (const mode of [null, "ANALYSIS_ONLY", "unknown"]) {
    await assert.rejects(fixture(mode).guard.canActivate(context(SfaTestController, SfaTestController.prototype.read)), ForbiddenException);
  }
});

test("SFA requires explicit permissions and a company even for platform admins", async () => {
  const { guard, calls } = fixture();
  for (const user of [undefined, { ...actor, companyId: null }, { ...actor, permissions: [] },
    { ...actor, permissions: ["sfa.test.read"] }, { ...actor, permissions: ["sfa.access"] },
    { ...actor, roleCode: "SUPER_ADMIN", companyId: null }]) {
    await assert.rejects(guard.canActivate(context(SfaTestController, SfaTestController.prototype.read, user ?? null)), ForbiddenException);
  }
  assert.deepEqual(calls, []);
});

test("SFA uses only the authenticated tenant and rechecks mode on every request", async () => {
  const { guard, calls, state } = fixture();
  assert.equal(await guard.canActivate(context(SfaTestController, SfaTestController.prototype.read)), true);
  assert.deepEqual(calls, [{ where: { companyId: "company-a" }, select: { operatingMode: true } }]);
  state.mode = "ANALYSIS_ONLY";
  await assert.rejects(guard.canActivate(context(SfaTestController, SfaTestController.prototype.read)), ForbiddenException);
  assert.equal(calls.length, 2);
});

test("method permissions cannot replace required controller permissions", async () => {
  const { guard } = fixture();
  await assert.rejects(guard.canActivate(context(SfaTestController, SfaTestController.prototype.write,
    { ...actor, permissions: ["sfa.access", "sfa.test.write"] })), ForbiddenException);
  assert.equal(await guard.canActivate(context(SfaTestController, SfaTestController.prototype.write,
    { ...actor, permissions: [...actor.permissions, "sfa.test.write"] })), true);
});

test("reserved SFA routes fail closed if permission metadata is missing", async () => {
  const { guard, calls } = fixture();
  await assert.rejects(guard.canActivate(context(UnmarkedSfaController, UnmarkedSfaController.prototype.read)), /metadata is required/);
  assert.deepEqual(calls, []);
});

test("Full ERP retains dual admission and downgrade revokes access without trusting client mode", async () => {
  const { guard, state } = fixture("FULL_ERP");
  assert.equal(await guard.canActivate(context(SfaTestController, SfaTestController.prototype.read)), true);
  await assert.rejects(guard.canActivate(context(SfaTestController, SfaTestController.prototype.read,
    { ...actor, permissions: ["sfa.access"] })), ForbiddenException);
  state.mode = "ANALYSIS_ONLY";
  await assert.rejects(guard.canActivate(context(SfaTestController, SfaTestController.prototype.read)), ForbiddenException);
});
