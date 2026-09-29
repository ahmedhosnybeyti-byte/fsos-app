import { strict as assert } from "node:assert";
import test from "node:test";
import type { Prisma } from "@field-sales-os/database";
import { RieScalableQueryService } from "./scalable-query.service";

interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

test("Assistant query_dataset parity stays inside scoped PostgreSQL current-state", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE to run PostgreSQL regression tests",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => TestPostgres };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TEMP TABLE rie_canonical_entity_rows (
      id text PRIMARY KEY, company_id text NOT NULL, entity_name text NOT NULL,
      entity_key text NOT NULL, precedence integer NOT NULL, data jsonb NOT NULL,
      created_at timestamptz NOT NULL
    );
  `);
  const insert = (id: string, company: string, entityKey: string, precedence: number, createdAt: string, data: Record<string, unknown>) =>
    db.query(
      "INSERT INTO rie_canonical_entity_rows VALUES ($1, $2, 'Invoices', $3, $4, $5::jsonb, $6)",
      [id, company, entityKey, precedence, JSON.stringify(data), createdAt],
    );
  await insert("a", "company-1", "INV-A", 2, "2026-01-02T00:00:00Z", { InvoiceNo: "INV-A", CustomerCode: " C-1 ", RouteID: "R-1", InvoiceStatus: "Open" });
  await insert("b", "company-1", "", 1, "2026-01-03T00:00:00Z", { InvoiceNo: "", CustomerCode: "C-1", RouteID: "R-1", InvoiceStatus: null });
  await insert("c", "company-1", "INV-C", 1, "2026-01-01T00:00:00Z", { InvoiceNo: "INV-C", CustomerCode: "C-2", RouteID: "R-1", InvoiceStatus: "Open" });
  await insert("d", "company-1", "INV-D", 1, "2026-01-01T00:00:00Z", { InvoiceNo: "INV-D", CustomerCode: "C-1", RouteID: "R-2", InvoiceStatus: "Secret route" });
  await insert("e", "company-2", "INV-E", 1, "2026-01-01T00:00:00Z", { InvoiceNo: "INV-E", CustomerCode: "C-1", RouteID: "R-1", InvoiceStatus: "Other company" });

  let lastSql: Prisma.Sql | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (sql: Prisma.Sql) => {
      lastSql = sql;
      return (await db.query(sql.text, sql.values)).rows;
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
  const context = {
    companyId: "company-1",
    requestingUser: { roleCode: "SALES_REP" as const, email: "rep@example.com" },
    entityName: "Invoices",
  };

  await t.test("exact/in, duplicates, blank PK, projection, offset and canonical default order have parity", async () => {
    const result = await service.queryAssistantDataset({
      ...context,
      filters: [
        { field: "CustomerCode", values: ["c-1", "C-2"] },
        { field: "RouteID", values: [" R-1 "] },
      ],
      projection: ["InvoiceNo", "InvoiceStatus"],
      hintFields: ["CustomerCode", "RouteID"],
      countOnly: false,
      pagination: { limit: 2, offset: 1 },
    });
    assert.equal(result.totalMatchingRows, 3);
    assert.deepEqual(result.records, [
      { InvoiceNo: "", InvoiceStatus: null },
      { InvoiceNo: "INV-A", InvoiceStatus: "Open" },
    ]);
    assert.deepEqual(result.noMatchHint, {});
    assert.match(lastSql!.text, /ORDER BY filtered\.precedence ASC, filtered\.created_at ASC, filtered\.id ASC/);
    assert.doesNotMatch(lastSql!.text, /INV-A|company-1|CustomerCode/);
  });

  await t.test("count is scoped by company and hierarchy without returning fact rows", async () => {
    const result = await service.queryAssistantDataset({
      ...context,
      filters: [{ field: "CustomerCode", values: ["c-1"] }],
      projection: null,
      hintFields: ["CustomerCode"],
      countOnly: true,
      pagination: { limit: 20, offset: 0 },
    });
    assert.equal(result.totalMatchingRows, 2);
    assert.deepEqual(result.records, []);
  });

  await t.test("zero-match hints use only company/hierarchy-visible rows and preserve first-seen distinct values", async () => {
    const result = await service.queryAssistantDataset({
      ...context,
      filters: [{ field: "InvoiceStatus", values: ["missing"] }],
      projection: null,
      hintFields: ["InvoiceStatus", "RouteID"],
      countOnly: false,
      pagination: { limit: 20, offset: 0 },
    });
    assert.equal(result.totalMatchingRows, 0);
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.noMatchHint, { InvoiceStatus: ["Open"], RouteID: ["R-1"] });
    assert.doesNotMatch(JSON.stringify(result), /Secret route|Other company/);
  });

  await t.test("closed entity and field whitelists reject dynamic SQL input", async () => {
    await assert.rejects(() => service.queryAssistantDataset({
      ...context,
      entityName: "Unknown",
      filters: [], projection: null, hintFields: [], countOnly: false,
      pagination: { limit: 20, offset: 0 },
    }), /not allowed/);
    await assert.rejects(() => service.queryAssistantDataset({
      ...context,
      filters: [{ field: "InvoiceNo') OR TRUE --", values: ["x"] }],
      projection: null, hintFields: [], countOnly: false,
      pagination: { limit: 20, offset: 0 },
    }), /not allowed/);
  });
});
