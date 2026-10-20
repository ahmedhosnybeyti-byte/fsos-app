import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { updateCompanyOperatingSettingsSchema, type CompanyOperatingMode } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { CompaniesController } from "./companies.controller";
import { CompanyOperatingSettingsService } from "./company-operating-settings.service";

const admin = { roleCode: "SUPER_ADMIN", userId: "platform-admin" } as AuthenticatedUser;
function fixture() {
  const settings = new Map<string, { operatingMode: CompanyOperatingMode }>();
  const writes: unknown[] = [], audits: unknown[] = [];
  const tx = {
    company: { findUnique: async ({ where }: { where: { id: string } }) => ["company-a", "company-b"].includes(where.id) ? { id: where.id } : null },
    companyOperatingSettings: {
      findUnique: async ({ where }: { where: { companyId: string } }) => settings.get(where.companyId) ?? null,
      upsert: async (query: { where: { companyId: string }; create: { companyId: string; operatingMode: CompanyOperatingMode }; update: { operatingMode: CompanyOperatingMode } }) => {
        writes.push(query);
        const value = { operatingMode: query.update.operatingMode };
        settings.set(query.where.companyId, value);
        return value;
      },
    },
  };
  const service = new CompanyOperatingSettingsService({ ...tx, $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } as never,
    { record: async (entry: unknown, client: unknown) => { assert.equal(client, tx); audits.push(entry); } } as never);
  return { service, settings, writes, audits };
}

test("companies without settings remain analysis-only without creating settings", async () => {
  const { service, writes, settings } = fixture();
  for (const id of ["company-a", "company-b"]) assert.deepEqual(await service.get(id), { operatingMode: "ANALYSIS_ONLY" });
  await service.update("company-a", { operatingMode: "ANALYSIS_ONLY" }, admin);
  assert.equal(settings.size, 0);
  assert.deepEqual(writes, []);
  await assert.rejects(service.get("missing"), NotFoundException);
});

test("Full ERP upgrade and downgrade touch only the target settings and audited mode", async () => {
  const { service, settings, writes, audits } = fixture();
  settings.set("company-b", { operatingMode: "SFA" });
  for (const operatingMode of ["FULL_ERP", "SFA", "ANALYSIS_ONLY", "FULL_ERP"] as const) {
    assert.deepEqual(await service.update("company-a", { operatingMode }, admin), { operatingMode });
    assert.deepEqual(await service.get("company-b"), { operatingMode: "SFA" });
  }
  assert.equal(writes.length, 4); assert.equal(audits.length, 4);
  for (const roleCode of ["COMPANY_ADMIN", "SALES_REP"] as const) {
    await assert.rejects(service.update("company-b", { operatingMode: "FULL_ERP" }, { ...admin, roleCode }), ForbiddenException);
  }
});

test("platform changes are tenant-specific, transactional and audited; repeated mode is a no-op", async () => {
  const { service, writes, audits } = fixture();
  assert.deepEqual(await service.update("company-a", { operatingMode: "SFA" }, admin), { operatingMode: "SFA" });
  assert.deepEqual(await service.get("company-b"), { operatingMode: "ANALYSIS_ONLY" });
  await service.update("company-a", { operatingMode: "SFA" }, admin);
  assert.equal(writes.length, 1);
  assert.deepEqual(audits, [{ companyId: "company-a", userId: "platform-admin", action: "company.operating_mode.update",
    entityType: "Company", entityId: "company-a", metadata: { before: "ANALYSIS_ONLY", after: "SFA" } }]);
  await service.update("company-a", { operatingMode: "ANALYSIS_ONLY" }, admin);
  assert.deepEqual(await service.get("company-a"), { operatingMode: "ANALYSIS_ONLY" });
  assert.equal(writes.length, 2);
});

test("company users cannot enable SFA and input cannot smuggle tenant or feature settings", async () => {
  const { service, writes } = fixture();
  for (const roleCode of ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"] as const) {
    await assert.rejects(service.update("company-a", { operatingMode: "SFA" }, { ...admin, roleCode }), ForbiddenException);
  }
  for (const input of [{ operatingMode: "ERP" }, { operatingMode: "SFA", companyId: "company-b" }, { operatingMode: "SFA", featureAccess: {} }]) {
    assert.equal(updateCompanyOperatingSettingsSchema.safeParse(input).success, false);
    await assert.rejects(service.update("company-a", input, admin));
  }
  await assert.rejects(service.update("missing", { operatingMode: "SFA" }, admin), NotFoundException);
  assert.deepEqual(writes, []);
});

test("operating settings endpoints restrict writes to platform admins and own reads to the current tenant", async () => {
  const reads: string[] = [];
  const controller = new CompaniesController({} as never, { get: async (id: string) => { reads.push(id); return { operatingMode: "ANALYSIS_ONLY" }; } } as never);
  assert.deepEqual(new Reflector().get(ROLES_KEY, CompaniesController.prototype.updateOperatingSettings), ["SUPER_ADMIN"]);
  assert.deepEqual(new Reflector().get(ROLES_KEY, CompaniesController.prototype.getOperatingSettings), ["SUPER_ADMIN"]);
  await controller.getMyOperatingSettings({ companyId: "company-a" } as AuthenticatedUser);
  assert.deepEqual(reads, ["company-a"]);
  assert.throws(() => controller.getMyOperatingSettings({ companyId: null } as AuthenticatedUser), ForbiddenException);
});
