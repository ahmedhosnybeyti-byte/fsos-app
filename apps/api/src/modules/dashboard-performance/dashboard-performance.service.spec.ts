import { strict as assert } from "node:assert";
import test from "node:test";
import { DashboardPerformanceService } from "./dashboard-performance.service";
import type { RieScalableQuery } from "../rie/scalable-query.types";

const resultPage = (records: Record<string, unknown>[]) => ({ records, page: { limit: 500, offset: 0, hasMore: false } });

test("keeps the full target month calendar for Sales and Collection pacing", async () => {
  const now = new Date("2026-08-07T12:00:00Z");
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const calendar = Array.from({ length: 28 }, (_, day) => ({ calendarDate: new Date(Date.UTC(year, month, day + 1)), workingDay: true }));
  const date = new Date(Date.UTC(year, month, 1)).toISOString();
  const rie = {
    // The dashboard now consumes SQL aggregate pages, not full entities.
    queryCanonicalRecords: async ({ entityName }: RieScalableQuery) => {
      if (entityName === "Invoice Items") return resultPage([{ date, sales: 280, invoices: 1, customers: 1, skus: 1 }]);
      if (entityName === "Collections") return resultPage([{ date, collections: 140 }]);
      if (entityName === "Targets") return resultPage([{ SalesTarget: 2_800, CollectionTarget: 1_400 }]);
      return resultPage([]);
    },
  };
  const prisma = { salesCalendar: { findMany: async () => calendar } };
  const service = new DashboardPerformanceService(rie as any, prisma as any);

  const result = await service.get({ companyId: "company", userId: "user", email: "rep@example.com", roleCode: "SALES_REP" } as any, "previous-month", undefined, "2026-08-01", "2026-08-07");
  const sales = result.targets.find((target) => target.key === "SalesTarget")!;
  const collections = result.targets.find((target) => target.key === "CollectionTarget")!;

  assert.equal(result.sellingDays.total, 28);
  assert.ok(result.sellingDays.remaining > 0);
  for (const target of [sales, collections]) {
    assert.notEqual(target.targetMtd, target.monthlyTarget);
    assert.notEqual(target.remainingMonthlyTarget, null);
    assert.notEqual(target.requiredDailyVelocity, null);
    assert.notEqual(target.runRateForecast, null);
  }
});
