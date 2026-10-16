import { strict as assert } from "node:assert";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { ProspectVisitIntentService } from "./prospect-visit-intent.service";

const rep = {
  userId: "rep-1",
  companyId: "company-1",
  email: "rep@example.test",
  roleCode: "SALES_REP",
  permissions: [],
  mustChangePassword: false,
  orgUnitId: null,
} as const;

function fixture(opportunity: { id: string } | null) {
  const calls: Record<string, unknown>[] = [];
  const prisma = {
    companyOpportunity: {
      findFirst: async (args: unknown) => { calls.push({ opportunityFindFirst: args }); return opportunity; },
    },
    prospectVisitIntent: {
      upsert: async (args: unknown) => { calls.push({ intentUpsert: args }); return { id: "intent-1" }; },
    },
  };
  return { service: new ProspectVisitIntentService(prisma as never), calls };
}

test("Radar scheduling stays tenant- and assignee-scoped and reschedules through one upsert key", async () => {
  const { service, calls } = fixture({ id: "company-opportunity-1" });
  await service.create(rep as never, { companyOpportunityId: "company-opportunity-1", scheduledFor: "2026-10-20" });

  const lookup = calls.find((call) => "opportunityFindFirst" in call)?.opportunityFindFirst as { where: Record<string, unknown> };
  assert.deepEqual(lookup.where, { id: "company-opportunity-1", companyId: "company-1", assignedToUserId: "rep-1" });
  const upsert = calls.find((call) => "intentUpsert" in call)?.intentUpsert as {
    where: { companyOpportunityId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  };
  assert.equal(upsert.where.companyOpportunityId, "company-opportunity-1");
  assert.equal(upsert.create.companyId, "company-1");
  assert.equal((upsert.update.scheduledFor as Date).toISOString(), "2026-10-20T00:00:00.000Z");
  assert.equal(upsert.update.status, "PLANNED");
});

test("Radar scheduling cannot expose or schedule another company's or another user's opportunity", async () => {
  const { service, calls } = fixture(null);
  await assert.rejects(
    () => service.create(rep as never, { companyOpportunityId: "outside-scope", scheduledFor: "2026-10-20" }),
    NotFoundException,
  );
  assert.equal(calls.some((call) => "intentUpsert" in call), false);
});

test("A confirmed radar visit records an explicit structured order and completes the same route intent", async () => {
  const calls: Record<string, unknown>[] = [];
  const prisma: Record<string, unknown> & { $transaction?: (callback: (client: unknown) => Promise<unknown>) => Promise<unknown> } = {
    prospectVisitIntent: {
      findFirst: async (args: unknown) => { calls.push({ intentFindFirst: args }); return { id: "intent-1", companyOpportunityId: "company-opportunity-1" }; },
      update: async (args: unknown) => { calls.push({ intentUpdate: args }); return {}; },
    },
    companyOpportunity: {
      update: async (args: unknown) => { calls.push({ opportunityUpdate: args }); return { id: "company-opportunity-1" }; },
    },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const service = new ProspectVisitIntentService(prisma as never);
  await service.recordRadarResult(rep as never, "intent-1", { result: "ORDERED", outcome: "Confirmed", orderValue: 1250 });

  const lookup = calls.find((call) => "intentFindFirst" in call)?.intentFindFirst as { where: Record<string, unknown> };
  assert.equal(lookup.where.companyId, "company-1");
  assert.equal(lookup.where.assignedToUserId, "rep-1");
  const intentUpdate = calls.find((call) => "intentUpdate" in call)?.intentUpdate as { data: Record<string, unknown> };
  assert.equal(intentUpdate.data.status, "COMPLETED");
  const opportunityUpdate = calls.find((call) => "opportunityUpdate" in call)?.opportunityUpdate as { data: Record<string, unknown> };
  assert.equal(opportunityUpdate.data.status, "WON");
  assert.equal(opportunityUpdate.data.orderValue, 1250);
  assert.equal(opportunityUpdate.data.orderQuantity, null);
});
