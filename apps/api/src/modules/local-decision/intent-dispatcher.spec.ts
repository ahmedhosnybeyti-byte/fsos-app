import { strict as assert } from "node:assert";
import test from "node:test";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { PrismaService } from "../../common/prisma";
import type { RieFacade } from "../rie/rie-facade.service";
import { dispatchIntent } from "./intent-dispatcher";

const user = {
  userId: "user-1",
  companyId: "company-1",
  roleCode: "SALES_REP",
  email: "rep@example.com",
} as AuthenticatedUser;

const prisma = {
  companyProfile: { findUnique: async () => ({ currency: "SAR" }) },
} as unknown as PrismaService;

test("GetTotalSales uses only the compact PostgreSQL contract and preserves wording", async () => {
  let call: { companyId: string; requestingUser?: { roleCode: string; email: string }; range: { start: string; end: string } } | undefined;
  const rie = {
    queryLocalDecisionTotalSales: async (context: { companyId: string; requestingUser?: { roleCode: string; email: string } }, range: { start: string; end: string }) => {
      call = { ...context, range };
      return { available: true, total: 350.5 };
    },
    getEntityRecords: async () => { throw new Error("GetTotalSales must not load raw facts"); },
  } as unknown as RieFacade;

  const result = await dispatchIntent(rie, prisma, user, "إجمالي المبيعات 01/08/2026 إلى 31/08/2026");

  assert.deepEqual(call, {
    companyId: "company-1",
    requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" },
    range: { start: "2026-08-01", end: "2026-08-31" },
  });
  assert.deepEqual(result, {
    status: "answered",
    intentId: "GetTotalSales",
    text: `إجمالي المبيعات خلال 2026-08-01 إلى 2026-08-31: ${350.5.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} SAR.`,
  });
});

test("GetTotalSales preserves no-data and unavailable-source behavior", async (t) => {
  await t.test("available sources with no matching rows return zero", async () => {
    const rie = { queryLocalDecisionTotalSales: async () => ({ available: true, total: 0 }) } as unknown as RieFacade;
    const result = await dispatchIntent(rie, prisma, user, "إجمالي المبيعات 01/08/2026 إلى 31/08/2026");
    assert.equal(result.status, "answered");
    assert.equal(result.status === "answered" ? result.text : "", "إجمالي المبيعات خلال 2026-08-01 إلى 2026-08-31: ٠ SAR.");
  });

  await t.test("missing source keeps the existing fallback", async () => {
    const rie = { queryLocalDecisionTotalSales: async () => ({ available: false, total: 0 }) } as unknown as RieFacade;
    const result = await dispatchIntent(rie, prisma, user, "إجمالي المبيعات 01/08/2026 إلى 31/08/2026");
    assert.deepEqual(result, {
      status: "answered",
      intentId: "GetTotalSales",
      text: "لا توجد بيانات فواتير متاحة حاليًا للشركة — تأكد من رفع ملفات Invoices وInvoice Items أولاً.",
    });
  });
});

test("GetTotalSales preserves fail-open error behavior", async () => {
  const rie = { queryLocalDecisionTotalSales: async () => { throw new Error("database unavailable"); } } as unknown as RieFacade;
  assert.deepEqual(
    await dispatchIntent(rie, prisma, user, "إجمالي المبيعات 01/08/2026 إلى 31/08/2026"),
    { status: "not_matched" },
  );
});

test("GetCollectionsTotal uses only the compact PostgreSQL contract and preserves exact wording", async () => {
  let call: Record<string, unknown> | undefined;
  let fullReads = 0;
  const rie = {
    queryLocalDecisionCollections: async (context: Record<string, unknown>, scope: Record<string, unknown>) => {
      call = { ...context, ...scope };
      return { available: true, total: 350.5, pendingTotal: 20, bouncedTotal: 30, collectedTotal: 300.5, customerCount: 4, oldestDueDate: "2026-08-01" };
    },
    getEntityRecords: async () => { fullReads++; throw new Error("Collections full read must not run"); },
  } as unknown as RieFacade;

  const result = await dispatchIntent(rie, prisma, user, "إجمالي التحصيل 01/08/2026 إلى 31/08/2026");
  assert.equal(fullReads, 0);
  assert.deepEqual(call, {
    companyId: "company-1",
    requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" },
    mode: "collectionDateRange",
    start: "2026-08-01",
    end: "2026-08-31",
  });
  assert.deepEqual(result, {
    status: "answered",
    intentId: "GetCollectionsTotal",
    text: `إجمالي التحصيل خلال 2026-08-01 إلى 2026-08-31: ${350.5.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} SAR.`,
  });
});

test("GetOverdueCollections uses pending-before-today compact totals and preserves exact wording", async () => {
  let call: Record<string, unknown> | undefined;
  let fullReads = 0;
  const rie = {
    queryLocalDecisionCollections: async (context: Record<string, unknown>, scope: Record<string, unknown>) => {
      call = { ...context, ...scope };
      return { available: true, total: 33.5, pendingTotal: 33.5, bouncedTotal: 0, collectedTotal: 0, customerCount: 4, oldestDueDate: "2026-08-01" };
    },
    getEntityRecords: async () => { fullReads++; throw new Error("Collections full read must not run"); },
  } as unknown as RieFacade;
  const today = new Date().toISOString().slice(0, 10);

  const result = await dispatchIntent(rie, prisma, user, "تحصيلات متأخرة");
  assert.equal(fullReads, 0);
  assert.deepEqual(call, {
    companyId: "company-1",
    requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" },
    mode: "overduePending",
    before: today,
  });
  assert.deepEqual(result, {
    status: "answered",
    intentId: "GetOverdueCollections",
    text: `إجمالي التحصيلات المتأخرة: ${33.5.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} SAR، عدد العملاء: 4.`,
  });
});

test("Collections intents preserve zero, missing-source and fail-open behavior", async (t) => {
  await t.test("no matching rows return the established zero response", async () => {
    const rie = { queryLocalDecisionCollections: async () => ({ available: true, total: 0, pendingTotal: 0, bouncedTotal: 0, collectedTotal: 0, customerCount: 0, oldestDueDate: null }) } as unknown as RieFacade;
    const result = await dispatchIntent(rie, prisma, user, "إجمالي التحصيل 01/08/2026 إلى 31/08/2026");
    assert.equal(result.status === "answered" ? result.text : "", "إجمالي التحصيل خلال 2026-08-01 إلى 2026-08-31: ٠ SAR.");
  });

  await t.test("missing Collections source keeps both existing fallbacks", async () => {
    const rie = { queryLocalDecisionCollections: async () => ({ available: false, total: 0, pendingTotal: 0, bouncedTotal: 0, collectedTotal: 0, customerCount: 0, oldestDueDate: null }) } as unknown as RieFacade;
    for (const message of ["إجمالي التحصيل 01/08/2026 إلى 31/08/2026", "تحصيلات متأخرة"]) {
      const result = await dispatchIntent(rie, prisma, user, message);
      assert.deepEqual(result, {
        status: "answered",
        intentId: message.startsWith("إجمالي") ? "GetCollectionsTotal" : "GetOverdueCollections",
        text: "لا توجد بيانات تحصيل متاحة حاليًا للشركة — تأكد من رفع ملف Collections أولاً.",
      });
    }
  });

  await t.test("query failure still falls through to AI", async () => {
    const rie = { queryLocalDecisionCollections: async () => { throw new Error("database unavailable"); } } as unknown as RieFacade;
    assert.deepEqual(await dispatchIntent(rie, prisma, user, "تحصيلات متأخرة"), { status: "not_matched" });
  });
});
