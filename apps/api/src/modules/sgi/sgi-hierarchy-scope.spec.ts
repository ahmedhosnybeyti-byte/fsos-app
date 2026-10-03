import { strict as assert } from "node:assert";
import test from "node:test";
import type { SgiRecalculateResult } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SgiService } from "./sgi.service";

const COMPANY_ID = "company-1";
const reps = ["rep@example.test", "team@example.test", "hierarchy@example.test", "outside@example.test"];

function content(): SgiRecalculateResult {
  const situations = reps.map((ownerRepEmail, index) => ({
    id: `s-${index}`, type: "LOST_SALES" as const, severity: index === 0 ? "high" as const : "low" as const,
    entityType: "customer" as const, entityKey: `customer-${index}`, entityLabel: `Customer ${index}`, title: "Scope", detail: "Scope", recommendation: "Act",
    metricValue: 1, metricValuePrior: 2, periodMonth: "2026-10", ownerRepEmail,
  }));
  const repMonthlyGoals = Object.fromEntries(reps.map((email, index) => [email, { targetTotal: 100 + index, actualTotal: 10 + index }]));
  const repStats = Object.fromEntries(reps.map((email) => [email, { salesActual: 10, salesTarget: 100, collectionActual: 1, activeCustomers: 1, topProducts: [] }]));
  return {
    generatedAt: "2026-10-04T00:00:00.000Z", periodMonth: "2026-10", situations,
    repSupervisorMap: Object.fromEntries(reps.map((email) => [email, "supervisor@example.test"])), repMonthlyGoals, repStats, warnings: [],
    summary: { totalSituations: situations.length, highSeverityCount: 1, monthlyGoal: { targetTotal: 406, actualTotal: 46, progressPct: 11 } }, briefing: "Company briefing",
  };
}

function user(roleCode: AuthenticatedUser["roleCode"]): AuthenticatedUser {
  return { userId: roleCode, companyId: COMPANY_ID, email: `${roleCode}@example.test`, roleCode, permissions: [], mustChangePassword: false, orgUnitId: null };
}

function createService(allowed: Set<string> | null) {
  let reportReads = 0;
  const prisma = {
    aiReport: { findFirst: async () => (++reportReads === 1 ? null : { content: content() }) },
    user: { findMany: async () => reps.map((email) => ({ email, fullName: email })) },
  };
  return new SgiService({} as never, prisma as never, { resolveAllowedSalesRepEmails: async () => allowed } as never);
}

async function visible(roleCode: AuthenticatedUser["roleCode"], allowed: Set<string> | null) {
  const result = await createService(allowed).getLatest(user(roleCode));
  return result!.situations.map((s) => s.ownerRepEmail);
}

test("Sales Rep sees only its own SGI scope", async () => {
  assert.deepEqual(await visible("SALES_REP", new Set([reps[0]!])), [reps[0]]);
});

test("Supervisor sees only its team SGI scope", async () => {
  assert.deepEqual(await visible("SUPERVISOR", new Set(reps.slice(0, 2))), reps.slice(0, 2));
});

test("Manager sees only its hierarchy SGI scope", async () => {
  assert.deepEqual(await visible("MANAGER", new Set(reps.slice(0, 3))), reps.slice(0, 3));
});

test("Company Admin sees company-wide SGI", async () => {
  assert.deepEqual(await visible("COMPANY_ADMIN", null), reps);
});

test("Manager recalculation persists company-wide facts but returns a scoped result", async () => {
  const service = createService(new Set(reps.slice(0, 3)));
  let persistedAs: { roleCode: string; email: string } | undefined;
  (service as unknown as { runRecalculation: (companyId: string, hierarchyUser: { roleCode: string; email: string }, userId: string, input: unknown) => Promise<SgiRecalculateResult> }).runRecalculation = async (_companyId, hierarchyUser) => {
    persistedAs = hierarchyUser;
    return content();
  };
  const result = await service.recalculate(user("MANAGER"), { periodMonth: "2026-10", dateFrom: "2026-10-01", dateTo: "2026-10-04", priorDateFrom: "2026-09-01", priorDateTo: "2026-09-30" });
  assert.deepEqual(persistedAs, { roleCode: "COMPANY_ADMIN", email: "system@internal" });
  assert.deepEqual(result.situations.map((s) => s.ownerRepEmail), reps.slice(0, 3));
});

test("Manager recalculate-now returns only its hierarchy scope", async () => {
  const service = createService(new Set(reps.slice(0, 3)));
  (service as unknown as { recalculateForCompany: (companyId: string) => Promise<SgiRecalculateResult> }).recalculateForCompany = async () => content();
  const result = await service.recalculateNow(user("MANAGER"));
  assert.deepEqual(result.situations.map((s) => s.ownerRepEmail), reps.slice(0, 3));
});
