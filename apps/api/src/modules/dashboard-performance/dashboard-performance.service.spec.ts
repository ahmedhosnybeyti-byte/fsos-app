import { strict as assert } from "node:assert";
import test from "node:test";
import { DashboardPerformanceService } from "./dashboard-performance.service";

const available = (records: Record<string, unknown>[]) => ({ available: true, records, fields: [], warnings: [] });
const unavailable = () => ({ available: false, records: [], fields: [], warnings: [] });

test("keeps the full target month calendar for Sales and Collection pacing", async () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const calendar = Array.from({ length: 28 }, (_, day) => ({ calendarDate: new Date(Date.UTC(year, month, day + 1)), workingDay: true }));
  const date = new Date(Date.UTC(year, month, 1)).toISOString();
  const rie = {
    getEntityRecords: async (name: string) => {
      if (name === "Invoices") return available([{ InvoiceNo: "I-1", InvoiceDate: date, CustomerCode: "C-1", RouteID: "R-1" }]);
      if (name === "Invoice Items") return available([{ InvoiceNo: "I-1", LineTotal: 280 }]);
      if (name === "Collections") return available([{ CollectionDate: date, Amount: 140, RouteID: "R-1" }]);
      if (name === "Targets") return available([{ Year: year, Month: month + 1, SalesTarget: 2_800, CollectionTarget: 1_400, RouteID: "R-1" }]);
      return unavailable();
    },
  };
  const prisma = { salesCalendar: { findMany: async () => calendar } };
  const service = new DashboardPerformanceService(rie as any, prisma as any);

  const result = await service.get({ companyId: "company", userId: "user", email: "rep@example.com", roleCode: "SALES_REP" } as any, "previous-month");
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
