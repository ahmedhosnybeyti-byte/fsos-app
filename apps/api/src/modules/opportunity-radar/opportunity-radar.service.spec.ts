import { strict as assert } from "node:assert";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import { OpportunityRadarService } from "./opportunity-radar.service";

const manager = { userId: "manager-1", companyId: "company-1", email: "manager@example.test", roleCode: "MANAGER", permissions: [], mustChangePassword: false, orgUnitId: null } as const;
const companyAdmin = { ...manager, userId: "admin-1", roleCode: "COMPANY_ADMIN" } as const;
const supervisor = { ...manager, userId: "supervisor-1", roleCode: "SUPERVISOR" } as const;
const rep = { ...manager, userId: "rep-1", roleCode: "SALES_REP" } as const;

function fixture(options: { existing?: unknown } = {}) {
  const calls: Record<string, unknown>[] = [];
  const prisma = {
    user: { findMany: async (args: unknown) => { calls.push({ userFindMany: args }); return [{ id: "admin-1", employee: null }, { id: "manager-1", employee: { id: "employee-manager", managerId: null } }, { id: "supervisor-1", employee: { id: "employee-supervisor", managerId: "employee-manager" } }, { id: "rep-1", employee: { id: "employee-rep", managerId: "employee-supervisor" } }]; } },
    companyOpportunity: {
      count: async (args: unknown) => { calls.push({ count: args }); return 1; },
      findMany: async (args: unknown) => { calls.push({ findMany: args }); return []; },
      findFirst: async (args: unknown) => { calls.push({ findFirst: args }); return options.existing ?? null; },
      update: async (args: unknown) => { calls.push({ update: args }); return { id: "company-opportunity-1" }; },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  return { service: new OpportunityRadarService(prisma as never), calls };
}

test("Opportunity Radar gives Company Admin and Manager company-wide visibility", async () => {
  for (const user of [companyAdmin, manager]) {
    const { service, calls } = fixture();
    await service.list(user as never, { view: "ALL", page: 1, pageSize: 20 });
    const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
    assert.equal(count.where.companyId, "company-1");
    assert.equal(count.where.OR, undefined);
    assert.equal(count.where.assignedToUserId, undefined);
  }
});

test("Opportunity Radar lets Supervisors see unassigned opportunities and their hierarchy only", async () => {
  const { service, calls } = fixture();
  await service.list(supervisor as never, { view: "ALL", page: 1, pageSize: 20 });
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  assert.deepEqual(count.where.OR, [{ assignedToUserId: null }, { assignedToUserId: { in: ["supervisor-1", "rep-1"] } }]);
});

test("Opportunity Radar lets Sales Reps see only opportunities assigned to themselves", async () => {
  const { service, calls } = fixture();
  await service.list(rep as never, { view: "ALL", page: 1, pageSize: 20 });
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  assert.equal(count.where.assignedToUserId, "rep-1");
  assert.equal(count.where.OR, undefined);
});

test("Opportunity Radar applies type-specific act-now horizons without a generic seven-day rule", async () => {
  const { service, calls } = fixture();
  await service.list(manager as never, { view: "ACT_NOW", page: 1, pageSize: 20 });
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  assert.equal(count.where.companyId, "company-1");
  const market = count.where.marketOpportunity as { status: string; OR: Array<Record<string, unknown>> };
  assert.equal(market.status, "OPEN");
  assert.equal(market.OR[0]?.opportunityType, "PURCHASE");
  assert.ok("deadlineAt" in market.OR[0]!);
  assert.equal(market.OR[1]?.opportunityType, "EVENT");
  assert.ok("opportunityDate" in market.OR[1]!);
  assert.equal(market.OR[2]?.opportunityType, "PROACTIVE");
  assert.ok("opportunityDate" in market.OR[2]!);
  const purchaseUntil = ((market.OR[0]?.deadlineAt as { lte: Date }).lte).getTime();
  const eventUntil = ((market.OR[1]?.opportunityDate as { lte: Date }).lte).getTime();
  assert.equal(Math.round((eventUntil - purchaseUntil) / 86_400_000), 23);
  assert.deepEqual((count.where.status as { in: string[] }).in, ["NEW", "REVIEWED", "CONTACTED", "QUALIFIED"]);
});

test("Opportunity Radar never updates a company opportunity outside the viewer tenant and hierarchy scope", async () => {
  const { service, calls } = fixture();
  await assert.rejects(() => service.update(manager as never, "other-company-row", { status: "REVIEWED" }), NotFoundException);
  const find = calls.find((call) => "findFirst" in call)?.findFirst as { where: Record<string, unknown> };
  assert.equal(find.where.companyId, "company-1");
  assert.equal(calls.some((call) => "update" in call), false);
});
