import { strict as assert } from "node:assert";
import test from "node:test";
import type { Prisma } from "@field-sales-os/database";
import { RieScalableQueryService } from "./scalable-query.service";

interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

test("Local Decision Collections aggregates preserve legacy Node semantics in PostgreSQL", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE to run PostgreSQL regression tests",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => TestPostgres };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TEMP TABLE rie_canonical_entity_rows (
      id text PRIMARY KEY, company_id text NOT NULL, entity_name text NOT NULL,
      entity_key text NOT NULL, precedence integer NOT NULL DEFAULT 1,
      data jsonb NOT NULL, created_at timestamptz NOT NULL
    );
  `);
  const insert = (id: string, company: string, key: string, data: Record<string, unknown>, createdAt = "2026-08-01T00:00:00Z") =>
    db.query(
      "INSERT INTO rie_canonical_entity_rows (id, company_id, entity_name, entity_key, data, created_at) VALUES ($1, $2, 'Collections', $3, $4::jsonb, $5)",
      [id, company, key, JSON.stringify(data), createdAt],
    );
  const base = { CollectionDate: "2026-08-15", RouteID: "R-1", PaymentMethod: "Cash" };
  await insert("collected", "company-1", "COL-1", { ...base, CustomerCode: "C-1", Amount: 100, Status: "Collected", DueDate: "2026-09-10" });
  await insert("pending", "company-1", "COL-2", { ...base, CustomerCode: "C-1", Amount: "20.5", Status: " Pending ", DueDate: "2026-08-20" });
  await insert("pending-invalid", "company-1", "COL-3", { ...base, CustomerCode: "C-2", Amount: "not-a-number", Status: "Pending", DueDate: "2026-08-10" });
  await insert("bounced", "company-1", "COL-4", { ...base, CustomerCode: "C-3", Amount: 30, Status: "Bounced", DueDate: "2026-08-01" });
  await insert("pending-today", "company-1", "COL-5", { ...base, CustomerCode: "C-3", Amount: 40, Status: "Pending", DueDate: "2026-09-01" });
  await insert("pending-invalid-date", "company-1", "COL-6", { ...base, CustomerCode: "C-3", Amount: 50, Status: "Pending", DueDate: "not-a-date" });
  await insert("duplicate-a", "company-1", "DUP", { ...base, CustomerCode: "C-1", Amount: 5, Status: "Pending", DueDate: "2026-08-05" }, "2026-08-01T00:00:01Z");
  await insert("duplicate-b", "company-1", "DUP", { ...base, CustomerCode: "C-1", Amount: 7, Status: "Pending", DueDate: "2026-08-05" }, "2026-08-01T00:00:02Z");
  await insert("null-amount", "company-1", "NULL", { ...base, CustomerCode: "C-4", Amount: null, Status: "Pending", DueDate: "2026-08-01" });
  await insert("blank-amount", "company-1", "BLANK", { ...base, CustomerCode: "C-4", Amount: " ", Status: "Pending", DueDate: "2026-08-02" });
  await insert("blank-customer", "company-1", "BLANK-CUSTOMER", { ...base, CustomerCode: null, Amount: 1, Status: "Pending", DueDate: "2026-08-15" });
  await insert("boolean-amount", "company-1", "BOOL", { ...base, CustomerCode: "C-5", Amount: true, Status: "Collected", DueDate: "2026-09-10" });
  await insert("exponent-amount", "company-1", "EXP", { ...base, CustomerCode: "C-5", Amount: "1e2", Status: "Collected", DueDate: "2026-09-10" });
  await insert("outside-date", "company-1", "OUTSIDE", { ...base, CollectionDate: "2026-07-31", CustomerCode: "C-1", Amount: 500, Status: "Collected", DueDate: "2026-08-01" });
  await insert("other-route", "company-1", "OTHER-ROUTE", { ...base, CustomerCode: "C-1", Amount: 1000, Status: "Pending", DueDate: "2026-08-01", RouteID: "R-2" });
  await insert("other-company", "company-2", "OTHER-COMPANY", { ...base, CustomerCode: "C-1", Amount: 9999, Status: "Pending", DueDate: "2026-08-01" });

  let lastSql: Prisma.Sql | undefined;
  let lastRowCount = -1;
  const service = new RieScalableQueryService({
    $queryRaw: async (sql: Prisma.Sql) => {
      lastSql = sql;
      const result = await db.query(sql.text, sql.values);
      lastRowCount = result.rows.length;
      return result.rows;
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
  const context = { companyId: "company-1", requestingUser: { roleCode: "SALES_REP" as const, email: "rep@example.com" } };

  await t.test("date-range total keeps all current statuses and Number/isFinite behavior", async () => {
    const result = await service.queryLocalDecisionCollections({ ...context, mode: "collectionDateRange", start: "2026-08-01", end: "2026-08-31" });
    assert.deepEqual(result, {
      total: 354.5,
      pendingTotal: 123.5,
      bouncedTotal: 30,
      collectedTotal: 201,
      customerCount: 6,
      oldestDueDate: "2026-08-01",
    });
    assert.equal(lastRowCount, 1);
    assert.match(lastSql!.text, /SUM\(/);
    assert.doesNotMatch(lastSql!.text, /company-1|C-1|2026-08-01/);
  });

  await t.test("overdue is exact Pending with DueDate before today, including oldest due date and distinct blank customer", async () => {
    const result = await service.queryLocalDecisionCollections({ ...context, mode: "overduePending", before: "2026-09-01" });
    assert.deepEqual(result, {
      total: 33.5,
      pendingTotal: 33.5,
      bouncedTotal: 0,
      collectedTotal: 0,
      customerCount: 4,
      oldestDueDate: "2026-08-01",
    });
  });

  await t.test("customer-specific scope stays in PostgreSQL", async () => {
    const result = await service.queryLocalDecisionCollections({ ...context, mode: "collectionDateRange", start: "2026-08-01", end: "2026-08-31", customerCodes: [" c-1 "] });
    assert.equal(result.total, 132.5);
    assert.equal(result.customerCount, 1);
  });

  await t.test("company and hierarchy isolation plus no-match return one compact zero row", async () => {
    const noMatch = await service.queryLocalDecisionCollections({ ...context, mode: "collectionDateRange", start: "2025-01-01", end: "2025-01-31" });
    assert.deepEqual(noMatch, { total: 0, pendingTotal: 0, bouncedTotal: 0, collectedTotal: 0, customerCount: 0, oldestDueDate: null });
    const otherCompany = await service.queryLocalDecisionCollections({ companyId: "company-2", mode: "collectionDateRange", start: "2026-08-01", end: "2026-08-31" });
    assert.equal(otherCompany.total, 9999);
  });
});
