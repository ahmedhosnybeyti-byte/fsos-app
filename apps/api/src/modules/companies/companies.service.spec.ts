import { strict as assert } from "node:assert";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { createPlatformCompanySchema } from "@field-sales-os/schemas";
import { CompaniesService } from "./companies.service";

const input = { name: "Acme Sales", slug: "acme-sales", initialStatus: "ACTIVE" as const, initialPlanCode: "basic", adminFullName: "First Admin", adminEmail: "ADMIN@EXAMPLE.TEST" };

function provisionHarness(failAt?: "admin" | "subscription") {
  const audit: string[] = [];
  const refreshRevocations: unknown[] = [];
  const tx = {
    company: { create: async () => ({ id: "company-1", name: input.name, slug: input.slug, status: input.initialStatus }), findUnique: async () => ({ id: "company-1", status: "ACTIVE", name: input.name, slug: input.slug }), update: async () => ({ id: "company-1", status: "SUSPENDED", name: input.name, slug: input.slug }) },
    companyProfile: { create: async () => ({}) },
    role: { findUnique: async () => ({ id: "role-1" }) },
    user: { create: async () => { if (failAt === "admin") throw new Error("admin failed"); return { id: "user-1", email: "admin@example.test", fullName: input.adminFullName, mustChangePassword: true }; } },
    refreshToken: { updateMany: async (args: unknown) => refreshRevocations.push(args) },
  };
  const prisma = { $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx), ...tx };
  const service = new CompaniesService(prisma as never, { record: async (entry: { action: string }) => audit.push(entry.action) } as never, { ensureDefaultRegion: async () => ({ id: "region-1" }), create: async () => ({ id: "branch-1" }) } as never, { emit: async () => undefined } as never, {} as never, { createInitialSubscription: async () => { if (failAt === "subscription") throw new Error("subscription failed"); return { id: "sub-1", status: "TRIAL", plan: { code: "basic" } }; } } as never);
  return { service, audit, refreshRevocations };
}

test("normalizes the selected plan/company input contract", () => {
  const parsed = createPlatformCompanySchema.parse({ ...input, slug: "ACME-SALES", adminEmail: "  ADMIN@EXAMPLE.TEST  " });
  assert.equal(parsed.slug, "acme-sales");
  assert.equal(parsed.adminEmail, "admin@example.test");
});

test("provisions company, first admin, chosen subscription, and audits", async () => {
  const { service, audit } = provisionHarness();
  const result = await service.createPlatformCompany({ ...input, adminEmail: "admin@example.test" }, "actor-1");
  assert.equal(result.admin.mustChangePassword, true);
  assert.equal(result.subscription.plan.code, "basic");
  assert.ok(result.temporaryPassword.length >= 12);
  assert.deepEqual(audit, ["company.create", "user.create", "subscription.create"]);
});

test("propagates provisioning failures so the transaction can roll back", async () => {
  await assert.rejects(() => provisionHarness("admin").service.createPlatformCompany({ ...input, adminEmail: "admin@example.test" }, "actor-1"));
  await assert.rejects(() => provisionHarness("subscription").service.createPlatformCompany({ ...input, adminEmail: "admin@example.test" }, "actor-1"));
});

test("suspending a company revokes company refresh tokens and audits", async () => {
  const { service, audit, refreshRevocations } = provisionHarness();
  await service.transitionStatus("company-1", "SUSPEND", "actor-1");
  assert.equal(refreshRevocations.length, 1);
  assert.deepEqual(audit, ["company.suspend"]);
});
function duplicateService(target: "slug" | "email") {
  const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test", meta: { target: [target] } });
  return new CompaniesService(
    { $transaction: async () => { throw duplicate; } } as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
  );
}

test("maps a duplicate company slug to conflict", async () => {
  await assert.rejects(
    () => duplicateService("slug").createPlatformCompany({ ...input, adminEmail: "admin@example.test" }, "actor-1"),
    (error: unknown) => error instanceof ConflictException && error.message === "Company slug already exists",
  );
});

test("maps a duplicate first-admin email to conflict", async () => {
  await assert.rejects(
    () => duplicateService("email").createPlatformCompany({ ...input, adminEmail: "admin@example.test" }, "actor-1"),
    (error: unknown) => error instanceof ConflictException && error.message === "An account with this email already exists",
  );
});

test("updates company identity and records non-sensitive before/after audit", async () => {
  const audits: Array<{ action: string; metadata: { before: unknown; after: unknown } }> = [];
  const service = new CompaniesService(
    { company: { findUnique: async () => ({ id: "company-1", name: "Old", slug: "old", status: "ACTIVE" }), update: async () => ({ id: "company-1", name: "New", slug: "new", status: "SUSPENDED" }) } } as never,
    { record: async (entry: { action: string; metadata: { before: unknown; after: unknown } }) => audits.push(entry) } as never,
    {} as never, { emit: async () => undefined } as never, {} as never, {} as never,
  );
  const updated = await service.update("company-1", { name: "New", slug: "new", status: "SUSPENDED" }, "actor-1");
  assert.equal(updated.slug, "new");
  assert.equal(audits[0]?.action, "company.update");
  assert.deepEqual(audits[0]?.metadata, { before: { name: "Old", slug: "old", status: "ACTIVE" }, after: { name: "New", slug: "new", status: "SUSPENDED" } });
});

test("reactivate records the transition and does not revoke refresh tokens", async () => {
  const audit: string[] = [];
  let revocations = 0;
  const tx = { company: { findUnique: async () => ({ id: "company-1", status: "SUSPENDED" }), update: async () => ({ id: "company-1", status: "ACTIVE" }) }, refreshToken: { updateMany: async () => { revocations++; } } };
  const service = new CompaniesService(tx as never, { record: async (entry: { action: string }) => audit.push(entry.action) } as never, {} as never, { emit: async () => undefined } as never, {} as never, {} as never);
  await service.transitionStatus("company-1", "REACTIVATE", "actor-1");
  assert.equal(revocations, 0);
  assert.deepEqual(audit, ["company.reactivate"]);
});