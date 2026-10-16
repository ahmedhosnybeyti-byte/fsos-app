import { strict as assert } from "node:assert";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { OpportunityRadarListQuery } from "@field-sales-os/schemas";
import { OpportunityRadarService } from "./opportunity-radar.service";

const manager = { userId: "manager-1", companyId: "company-1", email: "manager@example.test", roleCode: "MANAGER", permissions: [], mustChangePassword: false, orgUnitId: null } as const;
const companyAdmin = { ...manager, userId: "admin-1", roleCode: "COMPANY_ADMIN" } as const;
const supervisor = { ...manager, userId: "supervisor-1", roleCode: "SUPERVISOR" } as const;
const rep = { ...manager, userId: "rep-1", roleCode: "SALES_REP" } as const;

function fixture(options: { existing?: unknown; policyMode?: "STANDARD" | "EVENT_FIRST_WATER" } = {}) {
  const calls: Record<string, unknown>[] = [];
  const prisma: Record<string, unknown> & { $transaction?: (operations: Promise<unknown>[] | ((client: unknown) => Promise<unknown>)) => Promise<unknown> } = {
    user: { findMany: async (args: unknown) => { calls.push({ userFindMany: args }); return [{ id: "admin-1", employee: null }, { id: "manager-1", employee: { id: "employee-manager", managerId: null } }, { id: "supervisor-1", employee: { id: "employee-supervisor", managerId: "employee-manager" } }, { id: "rep-1", employee: { id: "employee-rep", managerId: "employee-supervisor" } }]; } },
    companyOpportunity: {
      count: async (args: unknown) => { calls.push({ count: args }); return 1; },
      findMany: async (args: unknown) => { calls.push({ findMany: args }); return []; },
      findFirst: async (args: unknown) => { calls.push({ findFirst: args }); return options.existing ?? null; },
      update: async (args: unknown) => { calls.push({ update: args }); return { id: "company-opportunity-1" }; },
    },
    marketOpportunity: {
      groupBy: async (args: unknown) => { calls.push({ groupBy: args }); return []; },
    },
    opportunityRadarPolicy: {
      findUnique: async (args: unknown) => { calls.push({ policyFindUnique: args }); return options.policyMode ? { mode: options.policyMode } : null; },
    },
    opportunityRadarPreference: {
      upsert: async (args: unknown) => { calls.push({ preferenceUpsert: args }); return { isFavorite: true, isHidden: false }; },
    },
    prospectVisitIntent: {
      updateMany: async (args: unknown) => { calls.push({ intentUpdateMany: args }); return { count: 1 }; },
    },
  };
  prisma.$transaction = async (operations: Promise<unknown>[] | ((client: unknown) => Promise<unknown>)) =>
    typeof operations === "function" ? operations(prisma) : Promise.all(operations);
  return { service: new OpportunityRadarService(prisma as never), calls };
}

function listQuery(overrides: Partial<OpportunityRadarListQuery> = {}): OpportunityRadarListQuery {
  return { view: "ALL", timeRange: "NEXT_12_MONTHS", favoriteOnly: false, visibility: "VISIBLE", page: 1, pageSize: 20, ...overrides };
}

test("Opportunity Radar gives Company Admin and Manager company-wide visibility", async () => {
  for (const user of [companyAdmin, manager]) {
    const { service, calls } = fixture();
    await service.list(user as never, listQuery());
    const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
    assert.equal(count.where.companyId, "company-1");
    assert.equal(count.where.OR, undefined);
    assert.equal(count.where.assignedToUserId, undefined);
  }
});

test("Opportunity Radar keeps companies standard unless they have an explicit Event-First policy", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.policy(manager as never), { mode: "STANDARD" });
  const find = calls.find((call) => "policyFindUnique" in call)?.policyFindUnique as { where: Record<string, unknown> };
  assert.equal(find.where.companyId, "company-1");
});

test("Opportunity Radar lets Supervisors see unassigned opportunities and their hierarchy only", async () => {
  const { service, calls } = fixture();
  await service.list(supervisor as never, listQuery());
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  assert.deepEqual(count.where.OR, [{ assignedToUserId: null }, { assignedToUserId: { in: ["supervisor-1", "rep-1"] } }]);
});

test("Opportunity Radar lets Sales Reps see only opportunities assigned to themselves", async () => {
  const { service, calls } = fixture();
  await service.list(rep as never, listQuery());
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  assert.equal(count.where.assignedToUserId, "rep-1");
  assert.equal(count.where.OR, undefined);
});

test("Opportunity Radar applies type-specific act-now horizons without a generic seven-day rule", async () => {
  const { service, calls } = fixture();
  await service.list(manager as never, listQuery({ view: "ACT_NOW" }));
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

test("Opportunity Radar applies bilingual geography and personal preference filters in the database query", async () => {
  const { service, calls } = fixture();
  await service.list(manager as never, listQuery({ regions: ["riyadh-region", "makkah-region"], cities: ["jeddah", "madinah"], favoriteOnly: true, visibility: "HIDDEN" }));
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  const market = count.where.marketOpportunity as { region: { in: string[] }; city: { in: string[] } };
  assert.ok(market.region.in.includes("الرياض"));
  assert.ok(market.region.in.includes("riyadh"));
  assert.ok(market.region.in.includes("مكة المكرمة"));
  assert.ok(market.city.in.includes("جدة"));
  assert.ok(market.city.in.includes("jeddah"));
  assert.ok(market.city.in.includes("المدينة المنورة"));
  assert.deepEqual(count.where.AND, [
    { userPreferences: { some: { userId: "manager-1", isHidden: true } } },
    { userPreferences: { some: { userId: "manager-1", isFavorite: true } } },
  ]);
});

test("Opportunity Radar defaults event views to verified future events within twelve months", async () => {
  const { service, calls } = fixture({ policyMode: "EVENT_FIRST_WATER" });
  await service.list(manager as never, listQuery({ type: "EVENT", timeRange: "NEXT_12_MONTHS" }));
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  const market = count.where.marketOpportunity as Record<string, unknown>;
  assert.deepEqual(market.reviewStatus, { in: ["VERIFIED", "NEEDS_VERIFICATION"] });
  assert.equal(market.opportunityType, "EVENT");
  assert.equal(market.status, "OPEN");
  const ranges = market.OR as Array<{ opportunityDate: { gte?: Date; gt?: Date; lte: Date } }>;
  assert.equal(ranges.length, 3);
  assert.ok(ranges[0]!.opportunityDate.gte instanceof Date);
  assert.ok(ranges[2]!.opportunityDate.lte instanceof Date);
  assert.ok(ranges[2]!.opportunityDate.lte.getTime() - ranges[0]!.opportunityDate.gte!.getTime() >= 365 * 86_400_000);
});

test("Opportunity Radar preserves standard event behavior for companies without the water policy", async () => {
  const { service, calls } = fixture();
  await service.list(manager as never, listQuery({ type: "EVENT", timeRange: "NEXT_12_MONTHS", eventCategories: ["رياضة"] }));
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  const market = count.where.marketOpportunity as Record<string, unknown>;
  assert.equal(market.eventCategory, undefined);
  assert.equal(market.opportunityDate, undefined);
  assert.equal(market.status, undefined);
});

test("Opportunity Radar persists favorite and hidden state only for the current user after tenant-scope validation", async () => {
  const { service, calls } = fixture({ existing: { id: "company-opportunity-1" } });
  await service.updatePreference(manager as never, "company-opportunity-1", { isFavorite: true, isHidden: true });
  const find = calls.find((call) => "findFirst" in call)?.findFirst as { where: Record<string, unknown> };
  assert.equal(find.where.companyId, "company-1");
  const upsert = calls.find((call) => "preferenceUpsert" in call)?.preferenceUpsert as { where: { userId_companyOpportunityId: Record<string, string> }; create: Record<string, unknown> };
  assert.deepEqual(upsert.where.userId_companyOpportunityId, { userId: "manager-1", companyOpportunityId: "company-opportunity-1" });
  assert.equal(upsert.create.userId, "manager-1");
});

test("Opportunity Radar never writes a personal preference outside the viewer tenant", async () => {
  const { service, calls } = fixture();
  await assert.rejects(() => service.updatePreference(manager as never, "other-company-row", { isHidden: true }), NotFoundException);
  assert.equal(calls.some((call) => "preferenceUpsert" in call), false);
});

test("Opportunity Radar location options retain tenant and hierarchy scope before database grouping", async () => {
  const { service, calls } = fixture();
  await service.listLocations(supervisor as never, { regions: ["riyadh-region", "makkah-region"] });
  const groups = calls.filter((call) => "groupBy" in call).map((call) => call.groupBy) as Array<{ where: Record<string, unknown> }>;
  const firstScope = (groups[0]!.where.companyOpportunities as { some: Record<string, unknown> }).some;
  assert.equal(firstScope.companyId, "company-1");
  assert.deepEqual(firstScope.OR, [{ assignedToUserId: null }, { assignedToUserId: { in: ["supervisor-1", "rep-1"] } }]);
  assert.ok(((groups[1]!.where.region as { in: string[] }).in).includes("riyadh"));
  assert.ok(((groups[1]!.where.region as { in: string[] }).in).includes("مكة المكرمة"));
});

test("Event-First multi-select filters stay in PostgreSQL and use disjoint date buckets", async () => {
  const { service, calls } = fixture({ policyMode: "EVENT_FIRST_WATER" });
  await service.list(manager as never, listQuery({
    type: "EVENT",
    eventCategories: ["رياضة", "معرض"],
    dataQualities: ["NEEDS_VERIFICATION"],
    timeRange: undefined,
    timeRanges: ["NEXT_30_DAYS", "AFTER_12_MONTHS"],
  }));
  const count = calls.find((call) => "count" in call)?.count as { where: Record<string, unknown> };
  const market = count.where.marketOpportunity as Record<string, unknown>;
  assert.deepEqual(market.eventCategory, { in: ["رياضة", "معرض"] });
  assert.deepEqual(market.reviewStatus, { in: ["NEEDS_VERIFICATION"] });
  const ranges = market.OR as Array<{ opportunityDate: { gte?: Date; gt?: Date; lte?: Date } }>;
  assert.equal(ranges.length, 2);
  assert.ok(ranges[0]!.opportunityDate.gte instanceof Date);
  assert.ok(ranges[0]!.opportunityDate.lte instanceof Date);
  assert.ok(ranges[1]!.opportunityDate.gt instanceof Date);
  assert.equal(ranges[1]!.opportunityDate.lte, undefined);
});

test("Event-First location options include candidates without changing standard companies", async () => {
  const water = fixture({ policyMode: "EVENT_FIRST_WATER" });
  await water.service.listLocations(manager as never, { type: "EVENT" });
  const waterGroup = water.calls.find((call) => "groupBy" in call)?.groupBy as { where: Record<string, unknown> };
  assert.deepEqual(waterGroup.where.reviewStatus, { in: ["VERIFIED", "NEEDS_VERIFICATION"] });

  const standard = fixture();
  await standard.service.listLocations(manager as never, { type: "EVENT" });
  const standardGroup = standard.calls.find((call) => "groupBy" in call)?.groupBy as { where: Record<string, unknown> };
  assert.equal(standardGroup.where.reviewStatus, "VERIFIED");
});

test("Opportunity Radar never updates a company opportunity outside the viewer tenant and hierarchy scope", async () => {
  const { service, calls } = fixture();
  await assert.rejects(() => service.update(manager as never, "other-company-row", { status: "REVIEWED" }), NotFoundException);
  const find = calls.find((call) => "findFirst" in call)?.findFirst as { where: Record<string, unknown> };
  assert.equal(find.where.companyId, "company-1");
  assert.equal(calls.some((call) => "update" in call), false);
});

test("Opportunity Radar records the assigning manager and cancels the prior assignee's planned stop", async () => {
  const { service, calls } = fixture({ existing: { id: "company-opportunity-1", assignedToUserId: "rep-1", contactedAt: null } });
  await service.update(manager as never, "company-opportunity-1", { assignedToUserId: "supervisor-1" });

  const cancel = calls.find((call) => "intentUpdateMany" in call)?.intentUpdateMany as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(cancel.where, {
    companyId: "company-1",
    companyOpportunityId: "company-opportunity-1",
    assignedToUserId: "rep-1",
    status: "PLANNED",
  });
  assert.equal(cancel.data.status, "CANCELLED");
  const update = calls.find((call) => "update" in call)?.update as { data: Record<string, unknown> };
  assert.equal(update.data.assignedToUserId, "supervisor-1");
  assert.equal(update.data.assignedByUserId, "manager-1");
  assert.ok(update.data.assignedAt instanceof Date);
});

test("Team follow-up keeps hierarchy scope and requires structured order evidence", async () => {
  const { service, calls } = fixture();
  await service.teamFollowUp(supervisor as never, { status: "ORDERED", page: 1, pageSize: 20 });
  const countCalls = calls.filter((call) => "count" in call).map((call) => call.count) as Array<{ where: Record<string, unknown> }>;
  const filtered = countCalls[0]!.where.AND as Array<Record<string, unknown>>;
  assert.equal(filtered[0]!.companyId, "company-1");
  assert.deepEqual(filtered[0]!.assignedToUserId, { in: ["supervisor-1", "rep-1"] });
  assert.equal(filtered[1]!.status, "WON");
  assert.deepEqual(filtered[1]!.OR, [{ orderValue: { not: null } }, { orderQuantity: { not: null } }]);
});

test("Sales representatives cannot open management team follow-up", async () => {
  const { service } = fixture();
  await assert.rejects(() => service.teamFollowUp(rep as never, { page: 1, pageSize: 20 }), ForbiddenException);
});
