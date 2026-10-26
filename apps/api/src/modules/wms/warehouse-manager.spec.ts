import assert from "node:assert/strict";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import { hasOperationalPermissions, permitsOperationalRole, warehouseManagerPermissions, warehouseRoleNames, isSpecialistRole } from "@field-sales-os/schemas";
import { RolesGuard } from "../../common/guards/roles.guard";
import { SfaAccessGuard } from "../../common/guards/sfa-access.guard";
import { CompanyScreenAccessGuard } from "../../common/guards/company-screen-access.guard";
import { WarehouseManagementController } from "./warehouse-management.controller";
import { WmsController } from "./wms.controller";
import { WmsOperationsController } from "./wms-operations.controller";
import { WmsCoreController } from "./wms-core.controller";
import { WmsCountController } from "./wms-count.controller";
import { WmsQuarantineController } from "./wms-quarantine.controller";
import { UsersService } from "../users/users.service";
import { AuthService } from "../auth/auth.service";

const manager = { userId: "manager-a", companyId: "a", roleCode: "WAREHOUSE_MANAGER", permissions: [...warehouseManagerPermissions] };
const context = (controller: Function, method: Function, user: unknown = manager) => ({ getClass: () => controller, getHandler: () => method,
  switchToHttp: () => ({ getRequest: () => ({ user, method: "POST", originalUrl: "/api/v1/sfa/wms/registry/warehouses", body: { companyId: "forged" } }) }) } as never);

test("manager's bounded profile allows approvals but denies inventory writes and other domains even with forged grants", () => {
  assert.equal(isSpecialistRole("WAREHOUSE_MANAGER"), true);
  assert.deepEqual(warehouseRoleNames.WAREHOUSE_MANAGER, { ar: "مدير المستودع", en: "Warehouse Manager" });
  for (const permission of warehouseManagerPermissions) {
    assert.equal(hasOperationalPermissions(manager.roleCode, manager.permissions, [permission]), true);
    assert.equal(permitsOperationalRole(manager.roleCode, [permission]), true);
    assert.equal(hasOperationalPermissions(manager.roleCode, [], [permission]), false);
  }
  for (const permission of ["company.manage", "users.manage", "wms.opening.post", "wms.products.manage", "wms.receiving.create", "wms.picking.manage", "wms.dispatch.execute", "wms.count.create", "accounting.read", "procurement.read"]) {
    assert.equal(hasOperationalPermissions(manager.roleCode, [...manager.permissions, permission], [permission]), false);
    assert.equal(permitsOperationalRole(manager.roleCode, [permission]), false);
  }
  // Existing role behavior is not broadened or replaced by the new profile.
  assert.equal(hasOperationalPermissions("MANAGER", [], ["wms.read"]), false);
  assert.equal(hasOperationalPermissions("WAREHOUSE_KEEPER", ["wms.picking.manage"], ["wms.picking.manage"]), true);
  assert.equal(permitsOperationalRole("COMPANY_ADMIN", ["wms.opening.post"], { method: "POST", path: "/sfa/wms/warehouses/a/openings" }), false);
});

test("registry requires the manager role, explicit delegation, enabled screen, operational mode and company", async () => {
  const r = new Reflector(), role = new RolesGuard(r, { record: async () => {} } as never);
  for (const method of ["list", "get", "create", "update"] as const) {
    const request = (user: unknown) => context(WarehouseManagementController, WarehouseManagementController.prototype[method], user);
    assert.equal(await role.canActivate(request(manager)), true);
    for (const code of ["WAREHOUSE_KEEPER", "MANAGER", "COMPANY_ADMIN", "SALES_REP"]) await assert.rejects(role.canActivate(request({ ...manager, roleCode: code })), ForbiddenException);
    for (const mode of [undefined, "ANALYSIS_ONLY", "SFA", "FULL_ERP"]) {
      const gate = new SfaAccessGuard(r, { companyOperatingSettings: { findUnique: async () => mode ? { operatingMode: mode } : null } } as never);
      if (mode === "SFA" || mode === "FULL_ERP") assert.equal(await gate.canActivate(request(manager)), true);
      else await assert.rejects(gate.canActivate(request(manager)), ForbiddenException);
      for (const missing of ["sfa.access", "wms.read", "wms.warehouses.manage"]) await assert.rejects(gate.canActivate(request({ ...manager, permissions: manager.permissions.filter(p => p !== missing) })), ForbiddenException);
      await assert.rejects(gate.canActivate(request({ ...manager, companyId: null })), ForbiddenException);
    }
    const screen = new CompanyScreenAccessGuard(r, { company: { findUnique: async () => ({ featureAccess: { "warehouse-core": "LOCKED" } }) } } as never);
    await assert.rejects(screen.canActivate(request(manager)), ForbiddenException);
  }
});

test("existing warehouse read/document controllers admit managers without opening denied command capabilities", async () => {
  const r = new Reflector(), roles = new RolesGuard(r, { record: async () => {} } as never);
  for (const [controller, method] of [[WmsController, WmsController.prototype.summary], [WmsOperationsController, WmsOperationsController.prototype.command],
    [WmsCoreController, WmsCoreController.prototype.list], [WmsCountController, WmsCountController.prototype.approve], [WmsQuarantineController, WmsQuarantineController.prototype.writeOff]] as const) {
    const request = context(controller, method);
    assert.equal(await roles.canActivate(request), true);
    assert.equal(await new SfaAccessGuard(r, { companyOperatingSettings: { findUnique: async () => ({ operatingMode: "FULL_ERP" }) } } as never).canActivate(request), true);
  }
  const gate = new SfaAccessGuard(r, { companyOperatingSettings: { findUnique: async () => ({ operatingMode: "FULL_ERP" }) } } as never);
  await assert.rejects(gate.canActivate(context(WmsController, WmsController.prototype.opening, { ...manager, permissions: [...manager.permissions, "wms.opening.post"] })), ForbiddenException);
});

test("company admins cannot create, assume, edit or reset the new specialist role", async () => {
  let writes = 0;
  const service = new UsersService({ user: { findUnique: async ({ where }: { where: { id: string } }) => where.id === "actor"
    ? { role: { code: "COMPANY_ADMIN" } } : { id: "target", companyId: "a", role: { code: "WAREHOUSE_MANAGER" } }, create: async () => { writes++; }, update: async () => { writes++; } } } as never, {} as never, {} as never, {} as never, {} as never);
  await assert.rejects(service.createUser("a", { email: "unused@example.invalid", fullName: "Not created", roleCode: "WAREHOUSE_MANAGER", password: "Valid1!Pass" }, "actor"), ForbiddenException);
  await assert.rejects(service.updateUser("target", "a", { roleCode: "COMPANY_ADMIN" }, "actor"), ForbiddenException);
  const auth = new AuthService({} as never, { findById: async () => ({ id: "target", companyId: "a", role: { code: "WAREHOUSE_MANAGER" } }), setPasswordHash: async () => { writes++; } } as never, {} as never, {} as never, {} as never);
  await assert.rejects(auth.resetPassword("target", { ...manager, roleCode: "COMPANY_ADMIN" } as never), ForbiddenException);
  assert.equal(writes, 0);
});
