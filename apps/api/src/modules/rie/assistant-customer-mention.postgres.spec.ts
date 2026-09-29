import { strict as assert } from "node:assert";
import test from "node:test";
import type { Prisma } from "@field-sales-os/database";
import { resolveMentionedCustomer } from "../local-decision/dictionary-engine";
import { extractCandidateCodes } from "../local-decision/regex-engine";
import type { EntityRecord } from "./entity-provider.interface";
import { RieScalableQueryService } from "./scalable-query.service";

interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

test("Assistant customer mention PostgreSQL candidates preserve the legacy winner", {
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
  const insert = (id: string, company: string, key: string, precedence: number, createdAt: string, data: Record<string, unknown>) =>
    db.query(
      "INSERT INTO rie_canonical_entity_rows VALUES ($1, $2, 'Customers', $3, $4, $5::jsonb, $6)",
      [id, company, key, precedence, JSON.stringify(data), createdAt],
    );

  const visibleRows: EntityRecord[] = [
    { CustomerCode: "C-100", CustomerName: "Alpha", RouteID: "R-1" },
    { CustomerCode: "C-100", CustomerName: "Duplicate Alpha", RouteID: "R-1" },
    { CustomerCode: "C-200", CustomerName: "North Star", RouteID: "R-1" },
    { CustomerCode: "C-300", CustomerName: "Star", RouteID: "R-1" },
    { CustomerCode: "C-400", CustomerName: "East West", RouteID: "R-1" },
    { CustomerCode: "C-500", CustomerName: "West East", RouteID: "R-1" },
    { CustomerCode: "", CustomerName: "", RouteID: "R-1" },
    { CustomerCode: null, CustomerName: null, RouteID: "R-1" },
  ];
  for (const [index, row] of visibleRows.entries()) {
    await insert(`visible-${index}`, "company-1", String(row.CustomerCode ?? ""), 1, `2026-01-01T00:00:0${index}Z`, row);
  }
  await insert("hidden-route", "company-1", "C-999", 1, "2026-01-01T00:00:00Z", { CustomerCode: "C-999", CustomerName: "Hidden Long Customer", RouteID: "R-2" });
  await insert("other-company", "company-2", "C-888", 1, "2026-01-01T00:00:00Z", { CustomerCode: "C-888", CustomerName: "Other Company Customer", RouteID: "R-1" });

  const statements: Prisma.Sql[] = [];
  const service = new RieScalableQueryService({
    $queryRaw: async (sql: Prisma.Sql) => {
      statements.push(sql);
      return (await db.query(sql.text, sql.values)).rows;
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
  const context = {
    companyId: "company-1",
    requestingUser: { roleCode: "SALES_REP" as const, email: "rep@example.com" },
  };
  const cases = [
    "كيف الحال اليوم",
    "افتح C-100",
    "راجع North Star",
    "راجع north star",
    "قارن North Star مع Star",
    "قارن East West مع West East",
    "راجع C-300 ثم North Star",
    "راجع C-000",
    "راجع Hidden Long Customer أو C-999",
    "راجع Other Company Customer أو C-888",
    "Unknown Customer",
  ];

  for (const message of cases) {
    await t.test(message, async () => {
      const normalizedMessage = message.trim().toLowerCase();
      const { candidateCodes } = extractCandidateCodes(message);
      const candidates = await service.queryAssistantCustomerMentionCandidates({
        ...context,
        candidateCodes,
        normalizedMessage,
        allowNameMatch: normalizedMessage.length >= 4,
      });
      const legacy = resolveMentionedCustomer(message, visibleRows);
      const migrated = resolveMentionedCustomer(message, candidates);
      assert.deepEqual(migrated, legacy);
      assert.ok(candidates.length <= visibleRows.length);
      assert.doesNotMatch(JSON.stringify(candidates), /Hidden Long Customer|Other Company Customer/);
    });
  }

  assert.equal(statements.length, cases.length);
  for (const statement of statements) {
    assert.doesNotMatch(statement.text, /company-1|C-100|North Star|Hidden Long Customer/);
    assert.match(statement.text, /customer\."company_id"/);
    assert.match(statement.text, /ORDER BY customer\.precedence ASC/);
  }
});
