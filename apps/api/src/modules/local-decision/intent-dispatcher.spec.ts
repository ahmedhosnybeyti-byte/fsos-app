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
