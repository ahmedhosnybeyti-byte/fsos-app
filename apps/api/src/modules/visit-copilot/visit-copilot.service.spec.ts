import { strict as assert } from "node:assert";
import test from "node:test";
import { VisitCopilotService } from "./visit-copilot.service";

test("Visit Copilot enters a bounded RIE request plan for its direct and fan-out reads", async () => {
  const plans: Array<{ name: string; maxConcurrentOperations: number; maxOperations: number }> = [];
  const rieFacade = {
    runPlannedRequest: async <T>(options: { name: string; maxConcurrentOperations: number; maxOperations: number }, execute: () => Promise<T>) => {
      plans.push(options);
      return execute();
    },
    queryCanonicalRecords: async () => ({ records: [], page: { hasMore: false } }),
  };
  const prisma = {
    salesCalendar: { findMany: async () => [] },
    prospectVisitIntent: { findMany: async () => [] },
  };
  const service = new VisitCopilotService(
    rieFacade as never,
    {} as never,
    prisma as never,
    {} as never,
    { detect: async () => ({ opportunities: [] }) } as never,
    {} as never,
    {} as never,
  );
  const user = { companyId: "company", userId: "user", roleCode: "SALES_REP", email: "rep@example.com" };

  await service.dailyBrief(user as never, { period: "3m" } as never);
  await service.supervisedSalesReps({ ...user, roleCode: "SUPERVISOR" } as never);

  assert.deepEqual(plans, [
    { name: "visit_copilot.daily_brief", maxConcurrentOperations: 3, maxOperations: 24 },
    { name: "visit_copilot.supervised_sales_reps", maxConcurrentOperations: 3, maxOperations: 24 },
  ]);
});
