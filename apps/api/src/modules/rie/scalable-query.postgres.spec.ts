import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Prisma } from "@field-sales-os/database";
import { RieScalableQueryService } from "./scalable-query.service";

// Executes the service's actual parameterized SQL in ephemeral PostgreSQL,
// not a mocked SQL result or a JavaScript reimplementation of the merge.
// No application database or production dependency is required:
// npm install --prefix <temporary-directory> --no-save --package-lock=false @electric-sql/pglite@0.5.8
// RIE_TEST_PGLITE_MODULE=<temporary-directory>/node_modules/@electric-sql/pglite/dist/index.cjs
// Run this file with tsx --tsconfig apps/api/tsconfig.json --test.
interface TestPostgres {
  exec(sql: string): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

test("scalable RIE incremental merge in PostgreSQL", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE to run PostgreSQL regression tests",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => TestPostgres };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TEMP TABLE files (
      id text PRIMARY KEY, company_id text NOT NULL, created_at timestamptz NOT NULL,
      is_active boolean NOT NULL, status text NOT NULL, dataset_type_confirmed boolean NOT NULL
    );
    CREATE TEMP TABLE rie_dataset_versions (
      id text PRIMARY KEY, company_id text NOT NULL, entity_name text NOT NULL,
      source_file_id text NOT NULL REFERENCES files(id), is_active boolean NOT NULL
    );
    CREATE TEMP TABLE rie_entity_rows (
      id text PRIMARY KEY, company_id text NOT NULL, entity_name text NOT NULL,
      dataset_version_id text NOT NULL REFERENCES rie_dataset_versions(id),
      entity_key text NOT NULL, data jsonb NOT NULL, created_at timestamptz DEFAULT now(),
      UNIQUE(dataset_version_id, entity_key)
    );
    CREATE TEMP TABLE rie_canonical_entity_rows (
      id text PRIMARY KEY, company_id text NOT NULL, source_file_id text,
      entity_name text NOT NULL, entity_key text NOT NULL, data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX rie_canonical_entity_rows_company_id_entity_name_entity_key_key
      ON rie_canonical_entity_rows(company_id, entity_name, entity_key);
    CREATE INDEX rie_canonical_entity_rows_company_id_entity_name_idx
      ON rie_canonical_entity_rows(company_id, entity_name);
    CREATE INDEX ON rie_dataset_versions(company_id, entity_name, is_active);
    CREATE INDEX ON rie_entity_rows(dataset_version_id, (LOWER(BTRIM(COALESCE(data ->> 'InvoiceNo', '')))));
  `);

  const upload = async (id: string, entity: string, date: string, rows: Array<{ key: string; data: Record<string, unknown> }>, company = "company-1", active = true, ready = true) => {
    await db.query("INSERT INTO files VALUES ($1, $2, $3, $4, $5, true)", [id, company, date, active, ready ? "READY" : "PROCESSING"]);
    await db.query("INSERT INTO rie_dataset_versions VALUES ($1, $2, $3, $1, true)", [id, company, entity]);
    for (const [index, row] of rows.entries()) {
      await db.query("INSERT INTO rie_entity_rows (id, company_id, entity_name, dataset_version_id, entity_key, data) VALUES ($1, $2, $3, $4, $5, $6::jsonb)", [`${id}-${index}`, company, entity, id, row.key, JSON.stringify(row.data)]);
    }
  };
  // Insert the newer upload first: neither row insertion order nor the
  // materialization's age may override the source upload's precedence.
  await upload("new-invoices", "Invoices", "2026-08-01", [
    { key: " inv-1 ", data: { InvoiceNo: " inv-1 ", InvoiceStatus: "Closed", InvoiceDate: "2026-08-01", CustomerCode: "C-1", RouteID: "NEW", TotalAmount: 125 } },
  ]);
  await upload("old-invoices", "Invoices", "2026-07-01", [
    { key: "INV-1", data: { InvoiceNo: "INV-1", InvoiceStatus: "Pending", InvoiceDate: "2026-07-01", CustomerCode: "C-1", RouteID: "OLD", TotalAmount: 100 } },
    { key: "HIST", data: { InvoiceNo: "HIST", InvoiceStatus: "Historical", InvoiceDate: "2026-06-01", CustomerCode: "C-2", RouteID: "OLD", TotalAmount: 50 } },
  ]);
  await upload("old-items", "Invoice Items", "2026-07-01", [
    // Storage occurrence suffixes are not canonical business keys.
    { key: "INV-1␟1␟1", data: { InvoiceNo: "INV-1", LineNo: 1, ProductCode: "P-1", Quantity: 10, LineTotal: 100 } },
    { key: "INV-1␟2", data: { InvoiceNo: "INV-1", LineNo: 2, ProductCode: "P-1", Quantity: 3, LineTotal: 30 } },
  ]);
  await upload("new-items", "Invoice Items", "2026-08-01", [
    { key: "inv-1␟1", data: { InvoiceNo: "inv-1", LineNo: 1, ProductCode: "P-1", Quantity: 20, LineTotal: 200 } },
  ]);
  await upload("old-customers", "Customers", "2026-07-01", [
    { key: "C-1", data: { CustomerCode: "C-1", City: "Riyadh" } },
  ]);
  await upload("new-customers", "Customers", "2026-08-01", [
    { key: "C-1", data: { CustomerCode: "C-1", City: "Jeddah" } },
  ]);
  for (const [id, company, active, ready] of [
    ["other-company", "company-2", true, true],
    ["inactive-upload", "company-1", false, true],
    ["unfinished-upload", "company-1", true, false],
  ] as const) {
    await upload(id, "Invoices", "2026-09-01", [
      { key: "INV-1", data: { InvoiceNo: "INV-1", InvoiceStatus: "Excluded", TotalAmount: 999 } },
    ], company, active, ready);
  }

  await upload("only-visits", "Visits", "2026-08-01", [
    { key: "VIS-1", data: { VisitID: "VIS-1", VisitDate: "2026-08-01", RouteID: "R-1", VisitStatus: "Productive" } },
  ]);
  await upload("smart-loading-inventory", "Van Inventory", "2026-08-10", [
    { key: "2026-08-10|NEW|P-1|EA", data: { ReportDate: "2026-08-10", RouteID: "NEW", ProductCode: "P-1", Unit: "EA", Quantity: 1 } },
  ]);
  await upload("smart-loading-products", "Products", "2026-08-01", [
    { key: "P-1", data: { ProductCode: "P-1", ProductName: "Product 1", Category: "Food" } },
  ]);

  await upload("blank-invoices-old", "Invoices", "2026-06-01", [
    { key: "blank-old", data: { InvoiceNo: "", InvoiceStatus: "Blank old", TotalAmount: 1 } },
    { key: "null-old", data: { InvoiceNo: null, InvoiceStatus: "Null old", TotalAmount: 2 } },
  ]);
  await upload("blank-invoices-new", "Invoices", "2026-08-02", [
    { key: "blank-new", data: { InvoiceNo: "", InvoiceStatus: "Blank new", TotalAmount: 3 } },
  ]);

  // Execute the real cutover migration. Historical newest-wins remains only
  // as the reference oracle below; every service query after this point reads
  // rie_canonical_entity_rows.
  const migration = readFileSync(resolve(process.cwd(), "packages/database/prisma/migrations/20260923020000_rie_canonical_current_state/migration.sql"), "utf8");
  await db.exec(migration);

  const oldNewestWins = async (company: string, entity: string, keys: readonly string[]) => {
    const normalized = keys.map((key) => `LOWER(BTRIM(COALESCE(source_row.data ->> '${key}', '')))`);
    const keyProjection = normalized.map((expression, index) => `${expression} AS key_${index}`).join(", ");
    const blank = keys.map((_, index) => `candidate.key_${index} = ''`).join(" OR ");
    const rows = await db.query(`
      WITH versions AS MATERIALIZED (
        SELECT version.id, ROW_NUMBER() OVER (ORDER BY source_file.created_at DESC, source_file.id DESC) precedence
        FROM rie_dataset_versions version
        JOIN files source_file ON source_file.id = version.source_file_id
        WHERE version.company_id = $1 AND version.entity_name = $2 AND version.is_active = TRUE
          AND source_file.company_id = $1 AND source_file.is_active = TRUE
          AND source_file.status = 'READY' AND source_file.dataset_type_confirmed = TRUE
      ), candidates AS (
        SELECT source_row.id, source_row.entity_key, source_row.data, version.precedence, ${keyProjection},
          MIN(version.precedence) OVER (PARTITION BY ${normalized.join(", ")}) newest
        FROM versions version JOIN rie_entity_rows source_row ON source_row.dataset_version_id = version.id
        WHERE source_row.company_id = $1 AND source_row.entity_name = $2
      )
      SELECT id, entity_key, precedence, data FROM candidates candidate
      WHERE (${blank}) OR precedence = newest
      ORDER BY id
    `, [company, entity]);
    return rows.rows;
  };
  const currentRows = async (company: string, entity: string) => (await db.query(
    "SELECT id, entity_key, precedence, data FROM rie_canonical_entity_rows WHERE company_id = $1 AND entity_name = $2 ORDER BY id",
    [company, entity],
  )).rows;
  const assertParity = async (company: string, entity: string, keys: readonly string[]) => {
    assert.deepEqual(await currentRows(company, entity), await oldNewestWins(company, entity, keys));
  };

  await t.test("cutover current-state exactly matches the old newest-wins reference", async () => {
    await assertParity("company-1", "Invoices", ["InvoiceNo"]);
    await assertParity("company-1", "Invoice Items", ["InvoiceNo", "LineNo"]);
    await assertParity("company-1", "Visits", ["VisitID"]);
    await assertParity("company-2", "Invoices", ["InvoiceNo"]);
    const blankRows = (await currentRows("company-1", "Invoices")).filter((row) => !String((row.data as Record<string, unknown>).InvoiceNo ?? "").trim());
    assert.equal(blankRows.length, 3);
  });

  let lastQuery: Prisma.Sql | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (sql: Prisma.Sql) => {
      lastQuery = sql;
      return (await db.query(sql.text, sql.values)).rows;
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["old"]) } as never);
  const invoices = { companyId: "company-1", entityName: "Invoices", projection: [{ field: "InvoiceNo" }, { field: "InvoiceStatus" }], pagination: { limit: 10 } };

  await t.test("Geo directory and expansion sales preserve the legacy Node results with scoped scalar SQL", async () => {
    await upload("geo-customers", "Customers", "2026-09-01", [
      { key: "C-1", data: { CustomerCode: " C-1 ", CustomerName: "Bad first", Latitude: "0", Longitude: "0", RouteID: "R-1", City: "North" } },
      { key: "C-1␟1", data: { CustomerCode: "C-1", CustomerName: "Valid One", Latitude: "2.47e1", Longitude: "+46.70", RouteID: "R-1", City: "North" } },
      { key: "C-2", data: { CustomerCode: "C-2", CustomerName: "Second", Latitude: 24.8, Longitude: 46.8, RouteID: "R-1", City: " North " } },
      { key: "C-3", data: { CustomerCode: "C-3", CustomerName: "Outside hierarchy", Latitude: 24.9, Longitude: 46.9, RouteID: "R-2", City: "North" } },
      { key: "C-4", data: { CustomerCode: "C-4", CustomerName: "Alpha", Latitude: 25, Longitude: 47, RouteID: "R-1", City: "north" } },
      { key: "C-4␟1", data: { CustomerCode: "C-4", CustomerName: "Needle on later duplicate", Latitude: 26, Longitude: 48, RouteID: "R-1", City: "north" } },
      { key: "C-5", data: { CustomerCode: "C-5", CustomerName: "Invalid only", Latitude: 91, Longitude: 46, RouteID: "R-1", City: "Invalid" } },
      { key: "blank", data: { CustomerCode: "", CustomerName: "Blank", Latitude: 24, Longitude: 46, RouteID: "R-1", City: "North" } },
    ], "geo-company");
    await upload("geo-invoices", "Invoices", "2026-09-01", [
      { key: "INV-A", data: { InvoiceNo: "INV-A", CustomerCode: "C-1", RouteID: "R-1" } },
      { key: "INV-A␟1", data: { InvoiceNo: " INV-A ", CustomerCode: " C-2 ", RouteID: "R-1" } },
      { key: "INV-B", data: { InvoiceNo: "INV-B", CustomerCode: "C-1", RouteID: "R-1" } },
      { key: "CASE", data: { InvoiceNo: "CASE", CustomerCode: "C-4", RouteID: "R-1" } },
      { key: "INV-X", data: { InvoiceNo: "INV-X", CustomerCode: "C-9", RouteID: "R-2" } },
    ], "geo-company");
    await upload("geo-items", "Invoice Items", "2026-09-01", [
      { key: "INV-A␟1", data: { InvoiceNo: "INV-A", LineNo: 1, LineTotal: "10", RouteID: "R-1" } },
      { key: "INV-B␟1", data: { InvoiceNo: " INV-B ", LineNo: 1, LineTotal: "2e1", RouteID: "R-1" } },
      { key: "INV-B␟2", data: { InvoiceNo: "INV-B", LineNo: 2, LineTotal: "not-a-number", RouteID: "R-1" } },
      { key: "case␟1", data: { InvoiceNo: "case", LineNo: 1, LineTotal: 40, RouteID: "R-1" } },
      { key: "INV-X␟1", data: { InvoiceNo: "INV-X", LineNo: 1, LineTotal: 999, RouteID: "R-2" } },
    ], "geo-company");
    await upload("geo-other-customers", "Customers", "2026-09-01", [
      { key: "C-OTHER", data: { CustomerCode: "C-OTHER", CustomerName: "Other company", Latitude: 24, Longitude: 46, RouteID: "R-1", City: "North" } },
    ], "geo-other");
    await upload("geo-other-invoices", "Invoices", "2026-09-01", [
      { key: "INV-A", data: { InvoiceNo: "INV-A", CustomerCode: "C-OTHER", RouteID: "R-1" } },
    ], "geo-other");
    await upload("geo-other-items", "Invoice Items", "2026-09-01", [
      { key: "INV-A␟1", data: { InvoiceNo: "INV-A", LineNo: 1, LineTotal: 777, RouteID: "R-1" } },
    ], "geo-other");
    for (const company of ["geo-company", "geo-other"]) {
      for (const entity of ["Customers", "Invoices", "Invoice Items"]) {
        await db.query("SELECT rie_refresh_canonical_current_state($1, $2)", [company, entity]);
      }
    }

    const geoService = new RieScalableQueryService({
      $queryRaw: async (sql: Prisma.Sql) => {
        lastQuery = sql;
        return (await db.query(sql.text, sql.values)).rows;
      },
    } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
    const legacyRows = async (entity: string) => (await db.query(`
      SELECT row.data
      FROM rie_canonical_entity_rows row
      INNER JOIN files source_file ON source_file.id = row.source_file_id
      WHERE row.company_id = 'geo-company' AND row.entity_name = $1
        AND LOWER(BTRIM(COALESCE(row.data ->> 'RouteID', ''))) = 'r-1'
      ORDER BY source_file.created_at DESC, row.created_at ASC, row.id ASC
    `, [entity])).rows.map((row) => row.data as Record<string, unknown>);
    const finite = (value: unknown): number | null => {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };
    const customers = await legacyRows("Customers");
    const legacyDirectory = new Map<string, { id: string; name: string; lat: number; lon: number }>();
    for (const row of customers) {
      const id = String(row.CustomerCode ?? "").trim();
      const lat = finite(row.Latitude);
      const lon = finite(row.Longitude);
      if (!id || lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) continue;
      if (!legacyDirectory.has(id)) legacyDirectory.set(id, { id, name: String(row.CustomerName ?? id), lat, lon });
    }
    const directory = await geoService.queryGeoCustomerDirectory({
      companyId: "geo-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" },
    });
    assert.deepEqual(directory, [...legacyDirectory.values()]);
    assert.deepEqual(await geoService.queryGeoCustomerDirectory({
      companyId: "geo-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" }, search: "needle",
    }), []);
    assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|customer_source\.\*/);
    assert.match(lastQuery!.text, /customer_source\."company_id"/);
    assert.match(lastQuery!.text, /customer_source\."data" ->> 'RouteID'/);

    const invoiceCustomer = new Map<string, string>();
    for (const row of await legacyRows("Invoices")) {
      const invoiceNo = String(row.InvoiceNo ?? "").trim();
      const customerCode = String(row.CustomerCode ?? "").trim();
      if (invoiceNo && customerCode) invoiceCustomer.set(invoiceNo, customerCode);
    }
    const legacySales = new Map<string, number>();
    for (const row of await legacyRows("Invoice Items")) {
      const customerCode = invoiceCustomer.get(String(row.InvoiceNo ?? "").trim());
      if (!customerCode) continue;
      legacySales.set(customerCode, (legacySales.get(customerCode) ?? 0) + (finite(row.LineTotal) ?? 0));
    }
    const sales = await geoService.queryGeoCustomerSales({
      companyId: "geo-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" },
    });
    assert.deepEqual(new Map(sales.map((row) => [row.customerCode, row.total])), legacySales);
    assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|invoice_source\.\*|item_source\.\*/);
    assert.match(lastQuery!.text, /GROUP BY invoice\.customer_code/);

    const exactScope = await geoService.queryGeoExpansionCustomers({
      companyId: "geo-company",
      requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" },
      exactScope: { field: "City", values: ["North"] },
    });
    assert.equal(exactScope.matchedScopeRows, 3);
    assert.deepEqual(exactScope.customers, [{ id: "C-1", name: "Valid One", lat: 24.7, lon: 46.7 }]);
    assert.doesNotMatch(lastQuery!.text, /base_source\.\*|rie_dataset_versions|rie_entity_rows/);

    const invalidScope = await geoService.queryGeoExpansionCustomers({
      companyId: "geo-company",
      requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" },
      exactScope: { field: "City", values: ["Invalid"] },
    });
    assert.equal(invalidScope.matchedScopeRows, 1);
    assert.deepEqual(invalidScope.customers, []);
  });

  await t.test("Heatmap compact SQL preserves legacy points, totals, sales, lost-sales and opportunity semantics", async () => {
    await upload("heat-customers", "Customers", "2026-09-02", [
      { key: "C-1", data: { CustomerCode: " C-1 ", CustomerName: "One", Latitude: "24.7", Longitude: "46.7", RouteID: "R-1", City: "North", Channel: "A" } },
      { key: "C-1␟1", data: { CustomerCode: "C-1", CustomerName: "One duplicate", Latitude: "0", Longitude: "0", RouteID: "R-1", City: "North", Channel: "A" } },
      { key: "C-2", data: { CustomerCode: "C-2", CustomerName: "Two", Latitude: ".248e2", Longitude: "+46.8", RouteID: "R-1", City: " South ", Channel: "B" } },
      { key: "C-3", data: { CustomerCode: "C-3", CustomerName: "Outside", Latitude: 25, Longitude: 47, RouteID: "R-2", City: "North", Channel: "A" } },
      { key: "C-4", data: { CustomerCode: "C-4", CustomerName: "Exact scope", Latitude: 25, Longitude: 47, RouteID: "R-1", City: "North", Channel: " A " } },
      { key: "blank", data: { CustomerCode: "", CustomerName: "Blank", Latitude: 25, Longitude: 47, RouteID: "R-1", City: "North", Channel: "A" } },
    ], "heat-company");
    await upload("heat-collections", "Collections", "2026-09-02", [
      { key: "COL-1", data: { CollectionNo: "COL-1", CustomerCode: " C-1 ", CollectionDate: "2026-01-10", Amount: "1e2", RouteID: "R-1" } },
      { key: "COL-2", data: { CollectionNo: "COL-2", CustomerCode: "C-1", CollectionDate: "2026-02-10", Amount: "bad", RouteID: "R-1" } },
      { key: "COL-3", data: { CollectionNo: "COL-3", CustomerCode: "C-3", CollectionDate: "2026-01-10", Amount: 999, RouteID: "R-2" } },
    ], "heat-company");
    await upload("heat-returns", "Returns", "2026-09-02", [
      { key: "RET-1", data: { ReturnNo: "RET-1", CustomerCode: "C-2", ReturnDate: "2026-01-15", TotalAmount: "+25.5", RouteID: "R-1" } },
      { key: "RET-2", data: { ReturnNo: "RET-2", CustomerCode: "C-3", ReturnDate: "2026-01-15", TotalAmount: 999, RouteID: "R-2" } },
    ], "heat-company");
    await upload("heat-invoices", "Invoices", "2026-09-02", [
      { key: "INV-A", data: { InvoiceNo: "INV-A", CustomerCode: "C-1", InvoiceDate: "2026-01-10", RouteID: "R-1" } },
      { key: "INV-A␟1", data: { InvoiceNo: " INV-A ", CustomerCode: " C-2 ", InvoiceDate: "2026-01-10", RouteID: "R-1" } },
      { key: "INV-B", data: { InvoiceNo: "INV-B", CustomerCode: "C-1", InvoiceDate: "2026-02-10", RouteID: "R-1" } },
      { key: "INV-X", data: { InvoiceNo: "INV-X", CustomerCode: "C-3", InvoiceDate: "2026-01-10", RouteID: "R-2" } },
    ], "heat-company");
    await upload("heat-items", "Invoice Items", "2026-09-02", [
      { key: "INV-A␟1", data: { InvoiceNo: "INV-A", LineNo: 1, ProductCode: "P-1", LineTotal: "1e2", RouteID: "R-1" } },
      { key: "INV-B␟1", data: { InvoiceNo: "INV-B", LineNo: 1, ProductCode: "P-1", LineTotal: 50, RouteID: "R-1" } },
      { key: "INV-X␟1", data: { InvoiceNo: "INV-X", LineNo: 1, ProductCode: "P-1", LineTotal: 999, RouteID: "R-2" } },
    ], "heat-company");
    await upload("heat-products", "Products", "2026-09-02", [
      { key: "P-1", data: { ProductCode: "P-1", Category: "Food" } },
      { key: "P-1␟1", data: { ProductCode: " P-1 ", Category: "Other" } },
    ], "heat-company");
    await upload("heat-other-customers", "Customers", "2026-09-02", [
      { key: "OTHER", data: { CustomerCode: "OTHER", CustomerName: "Other", Latitude: 24, Longitude: 46, RouteID: "R-1", City: "North", Channel: "A" } },
    ], "heat-other");
    for (const company of ["heat-company", "heat-other"]) {
      for (const entity of company === "heat-company" ? ["Customers", "Collections", "Returns", "Invoices", "Invoice Items", "Products"] : ["Customers"]) {
        await db.query("SELECT rie_refresh_canonical_current_state($1, $2)", [company, entity]);
      }
    }

    const heatService = new RieScalableQueryService({
      $queryRaw: async (sql: Prisma.Sql) => {
        lastQuery = sql;
        return (await db.query(sql.text, sql.values)).rows;
      },
    } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
    const legacyRows = async (entity: string) => (await db.query(`
      SELECT row.data
      FROM rie_canonical_entity_rows row
      INNER JOIN files source_file ON source_file.id = row.source_file_id
      WHERE row.company_id = 'heat-company' AND row.entity_name = $1
        AND ($2::boolean = false OR LOWER(BTRIM(COALESCE(row.data ->> 'RouteID', ''))) = 'r-1')
      ORDER BY source_file.created_at DESC, row.created_at ASC, row.id ASC
    `, [entity, entity !== "Products"])).rows.map((row) => row.data as Record<string, unknown>);
    const finite = (value: unknown): number | null => {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const customers = await legacyRows("Customers");
    const north = customers.filter((row) => String(row.CustomerCode ?? "").trim() && ["North"].includes(String(row.City ?? "").trim())).map((row) => ({
      id: String(row.CustomerCode ?? "").trim(),
      label: String(row.CustomerName ?? String(row.CustomerCode ?? "").trim()),
      lat: finite(row.Latitude), lon: finite(row.Longitude),
    }));
    const points = await heatService.queryHeatmapCustomerPoints({
      companyId: "heat-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" },
      scopeField: "City", scopeValues: ["North"], limit: 5_000,
    });
    assert.deepEqual(points.map(({ totalRows: _totalRows, ...row }) => row), north);
    assert.ok(points.every((row) => row.totalRows === north.length));
    const exactChannel = await heatService.queryHeatmapCustomerPoints({
      companyId: "heat-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" },
      scopeField: "Channel", scopeValues: ["A"], limit: 5_000,
    });
    assert.deepEqual(exactChannel.map((row) => row.id), ["C-1", "C-1", ""]);
    assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|customer_source\.\*/);

    for (const [entityName, dateField, amountField] of [
      ["Collections", "CollectionDate", "Amount"],
      ["Returns", "ReturnDate", "TotalAmount"],
    ] as const) {
      const legacy = new Map<string, number>();
      for (const row of await legacyRows(entityName)) {
        const time = Date.parse(String(row[dateField] ?? ""));
        if (Number.isNaN(time) || time < Date.parse("2026-01-01") || time > Date.parse("2026-01-31")) continue;
        const id = String(row.CustomerCode ?? "").trim();
        if (!id) continue;
        legacy.set(id, (legacy.get(id) ?? 0) + (finite(row[amountField]) ?? 0));
      }
      const actual = await heatService.queryHeatmapEntityTotals({
        companyId: "heat-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" },
        entityName, dateField, amountField, fromTime: Date.parse("2026-01-01"), toTime: Date.parse("2026-01-31"),
      });
      assert.deepEqual(new Map(actual.map((row) => [row.customerCode, row.total])), legacy);
      assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|metric_source\.\*/);
    }

    const invoicesRows = await legacyRows("Invoices");
    const itemRows = await legacyRows("Invoice Items");
    const productRows = await legacyRows("Products");
    const directSales = new Map<string, number>();
    for (const invoice of invoicesRows) {
      const invoiceNo = String(invoice.InvoiceNo ?? "").trim();
      const customerCode = String(invoice.CustomerCode ?? "").trim();
      const time = Date.parse(String(invoice.InvoiceDate ?? ""));
      if (!customerCode || time < Date.parse("2026-01-01") || time > Date.parse("2026-01-31")) continue;
      for (const item of itemRows) {
        if (String(item.InvoiceNo ?? "").trim() !== invoiceNo) continue;
        directSales.set(customerCode, (directSales.get(customerCode) ?? 0) + (finite(item.LineTotal) ?? 0));
      }
    }
    const sales = await heatService.queryHeatmapSales({
      companyId: "heat-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" }, mode: "sales",
      fromTime: Date.parse("2026-01-01"), toTime: Date.parse("2026-01-31"),
    });
    assert.deepEqual(new Map(sales.map((row) => [row.customerCode, row.total])), directSales);

    const invoiceLookup = new Map<string, { customerCode: string; time: number }>();
    for (const invoice of invoicesRows) {
      const invoiceNo = String(invoice.InvoiceNo ?? "").trim();
      const customerCode = String(invoice.CustomerCode ?? "").trim();
      if (invoiceNo && customerCode) invoiceLookup.set(invoiceNo, { customerCode, time: Date.parse(String(invoice.InvoiceDate ?? "")) });
    }
    const productLookup = new Map<string, string>();
    for (const product of productRows) {
      const code = String(product.ProductCode ?? "").trim();
      if (code) productLookup.set(code, String(product.Category ?? ""));
    }
    const joined = itemRows.flatMap((item) => {
      const invoice = invoiceLookup.get(String(item.InvoiceNo ?? "").trim());
      if (!invoice) return [];
      return [{ ...invoice, productCode: String(item.ProductCode ?? "").trim(), amount: finite(item.LineTotal) ?? 0 }];
    });
    const priorFrom = Date.parse("2026-01-01");
    const priorTo = Date.parse("2026-01-31");
    const recentFrom = Date.parse("2026-02-01");
    const recentTo = Date.parse("2026-02-28");
    const priorByCustomerProduct = new Map<string, number>();
    const recent = new Set<string>();
    for (const row of joined) {
      const key = `${row.customerCode}\u0000${row.productCode}`;
      if (row.time >= priorFrom && row.time <= priorTo && row.customerCode && row.productCode) priorByCustomerProduct.set(key, (priorByCustomerProduct.get(key) ?? 0) + row.amount);
      if (row.time >= recentFrom && row.time <= recentTo && row.customerCode && row.productCode) recent.add(key);
    }
    const legacyLost = new Map<string, number>();
    for (const [key, amount] of priorByCustomerProduct) {
      if (recent.has(key)) continue;
      const customerCode = key.split("\u0000")[0]!;
      legacyLost.set(customerCode, (legacyLost.get(customerCode) ?? 0) + amount);
    }
    const lost = await heatService.queryHeatmapSales({
      companyId: "heat-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" }, mode: "lostSales",
      priorFromTime: priorFrom, priorToTime: priorTo, fromTime: recentFrom, toTime: recentTo,
    });
    assert.deepEqual(new Map(lost.map((row) => [row.customerCode, row.total])), legacyLost);
    const foodLost = await heatService.queryHeatmapSales({
      companyId: "heat-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" }, mode: "lostSales", categoryValue: "Food",
      priorFromTime: priorFrom, priorToTime: priorTo, fromTime: recentFrom, toTime: recentTo,
    });
    assert.deepEqual(foodLost, []);
    assert.equal(productLookup.get("P-1"), "Other");

    const priorByCustomer = new Map<string, number>();
    const recentByCustomer = new Map<string, number>();
    for (const row of joined) {
      if (row.time >= priorFrom && row.time <= priorTo && row.customerCode) priorByCustomer.set(row.customerCode, (priorByCustomer.get(row.customerCode) ?? 0) + row.amount);
      if (row.time >= recentFrom && row.time <= recentTo && row.customerCode) recentByCustomer.set(row.customerCode, (recentByCustomer.get(row.customerCode) ?? 0) + row.amount);
    }
    const legacyOpportunity = new Map([...priorByCustomer].flatMap(([customerCode, prior]) => {
      const decline = prior - (recentByCustomer.get(customerCode) ?? 0);
      return decline > 0 ? [[customerCode, decline] as const] : [];
    }));
    const opportunity = await heatService.queryHeatmapSales({
      companyId: "heat-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" }, mode: "opportunity",
      priorFromTime: priorFrom, priorToTime: priorTo, fromTime: recentFrom, toTime: recentTo,
    });
    assert.deepEqual(new Map(opportunity.map((row) => [row.customerCode, row.total])), legacyOpportunity);
    const scopedOpportunity = await heatService.queryHeatmapSales({
      companyId: "heat-company", requestingUser: { roleCode: "SALES_REP", email: "rep@example.test" }, mode: "opportunity",
      priorFromTime: priorFrom, priorToTime: priorTo, fromTime: recentFrom, toTime: recentTo, customerCodes: ["C-1"],
    });
    assert.deepEqual(scopedOpportunity, []);
    assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|invoice_source\.\*|item_source\.\*/);
  });

  await t.test("newer matching record wins regardless of insertion order, key casing or whitespace", async () => {
    const result = await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["INV-1"] }] } });
    assert.deepEqual(result.records, [{ InvoiceNo: " inv-1 ", InvoiceStatus: "Closed" }]);
  });
  await t.test("a single active version uses the direct path with identical records", async () => {
    const result = await service.query({ companyId: "company-1", entityName: "Visits", projection: [{ field: "VisitID" }, { field: "VisitStatus" }], pagination: { limit: 10 } });
    assert.deepEqual(result.records, [{ VisitID: "VIS-1", VisitStatus: "Productive" }]);
    assert.doesNotMatch(lastQuery!.text, /base_candidates|base_versions AS|ROW_NUMBER\(\) OVER|MIN\(candidate_version\.precedence\) OVER/);
    const explained = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${lastQuery!.text}`, lastQuery!.values);
    const plan = (explained.rows[0]!["QUERY PLAN"] as Array<Record<string, unknown>>)[0]!;
    const allNodes = (node: Record<string, unknown>): Record<string, unknown>[] => [node, ...((node.Plans ?? []) as Record<string, unknown>[]).flatMap(allNodes)];
    assert.ok(allNodes(plan.Plan as Record<string, unknown>).every((node) => node["Node Type"] !== "WindowAgg"));
  });
  await t.test("unmatched historical record remains after a partial upload", async () => {
    const result = await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["HIST"] }] } });
    assert.deepEqual(result.records, [{ InvoiceNo: "HIST", InvoiceStatus: "Historical" }]);
  });
  await t.test("duplicate business record is counted once and sums use its latest value", async () => {
    const result = await service.query({ ...invoices, projection: [], aggregates: [{ op: "count", as: "count" }, { op: "sum", field: "TotalAmount", as: "total" }] });
    assert.deepEqual(result.records, [{ count: 5, total: 181 }]);
    assert.equal(result.page.hasMore, false);
  });
  await t.test("status, date and hierarchy filters cannot resurrect an older matching record", async () => {
    assert.deepEqual((await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceStatus", values: ["Pending"] }] } })).records, []);
    assert.deepEqual((await service.query({ ...invoices, scope: { date: { field: "InvoiceDate", from: "2026-07-01", to: "2026-07-31" } } })).records, []);
    assert.deepEqual((await service.query({ ...invoices, requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" } })).records, [{ InvoiceNo: "HIST", InvoiceStatus: "Historical" }]);
  });
  await t.test("both sides merge before joins and aggregation, preserving unmatched composite keys", async () => {
    const result = await service.query({
      companyId: "company-1", entityName: "Invoice Items", projection: [],
      joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }],
      scope: { fields: [{ source: "invoice", field: "InvoiceStatus", values: ["Closed"] }] },
      aggregates: [{ op: "count", as: "count" }, { op: "sum", field: "LineTotal", as: "total" }],
    });
    assert.deepEqual(result.records, [{ count: 2, total: 230 }]);
  });
  await t.test("geographic scope uses the newest dimension before joining facts", async () => {
    for (const [city, expected] of [["Riyadh", 0], ["Jeddah", 1]] as const) {
      const result = await service.query({
        ...invoices, projection: [],
        joins: [{ entityName: "Customers", alias: "customer", on: { left: { field: "CustomerCode" }, rightField: "CustomerCode" } }],
        scope: { fields: [{ source: "customer", field: "City", values: [city] }] },
        aggregates: [{ op: "count", as: "count" }],
      });
      assert.deepEqual(result.records, [{ count: expected }]);
    }
  });
  await t.test("file deactivation and reactivation atomically restore and reapply newest-wins", async () => {
    await db.query("UPDATE files SET is_active = false WHERE id = 'new-invoices'");
    await assertParity("company-1", "Invoices", ["InvoiceNo"]);
    const fallback = await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["INV-1"] }] } });
    assert.deepEqual(fallback.records, [{ InvoiceNo: "INV-1", InvoiceStatus: "Pending" }]);

    await db.query("UPDATE files SET is_active = true WHERE id = 'new-invoices'");
    await assertParity("company-1", "Invoices", ["InvoiceNo"]);
    assert.deepEqual((await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["INV-1"] }] } })).records, [{ InvoiceNo: " inv-1 ", InvoiceStatus: "Closed" }]);
  });
  await t.test("dataset-version activation state refreshes current-state without a fallback read", async () => {
    await db.query("UPDATE rie_dataset_versions SET is_active = false WHERE id = 'new-invoices'");
    await assertParity("company-1", "Invoices", ["InvoiceNo"]);
    await db.query("UPDATE rie_dataset_versions SET is_active = true WHERE id = 'new-invoices'");
    await assertParity("company-1", "Invoices", ["InvoiceNo"]);
  });
  await t.test("replacement publishes only at READY and deactivation falls back atomically", async () => {
    await db.query("INSERT INTO files VALUES ('replacement-invoices', 'company-1', '2026-09-10', true, 'PROCESSING', true)");
    await db.query("INSERT INTO rie_dataset_versions VALUES ('replacement-invoices', 'company-1', 'Invoices', 'replacement-invoices', false)");
    await db.query("INSERT INTO rie_entity_rows (id, company_id, entity_name, dataset_version_id, entity_key, data) VALUES ('replacement-invoices-0', 'company-1', 'Invoices', 'replacement-invoices', 'INV-1', '{\"InvoiceNo\":\"INV-1\",\"InvoiceStatus\":\"Replacement\",\"InvoiceDate\":\"2026-09-10\",\"CustomerCode\":\"C-1\",\"RouteID\":\"NEW\",\"TotalAmount\":150}'::jsonb)");
    await db.query("UPDATE rie_dataset_versions SET is_active = true WHERE id = 'replacement-invoices'");
    await assertParity("company-1", "Invoices", ["InvoiceNo"]);
    assert.equal((await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["INV-1"] }] } })).records[0]?.InvoiceStatus, "Closed");

    await db.query("UPDATE files SET status = 'READY' WHERE id = 'replacement-invoices'");
    await assertParity("company-1", "Invoices", ["InvoiceNo"]);
    assert.equal((await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["INV-1"] }] } })).records[0]?.InvoiceStatus, "Replacement");

    await db.query("UPDATE files SET is_active = false WHERE id = 'replacement-invoices'");
    await assertParity("company-1", "Invoices", ["InvoiceNo"]);
    assert.equal((await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["INV-1"] }] } })).records[0]?.InvoiceStatus, "Closed");
  });
  await t.test("same-version duplicate business keys remain current", async () => {
    await db.query("INSERT INTO files VALUES ('duplicate-returns', 'company-1', '2026-09-11', true, 'PROCESSING', true)");
    await db.query("INSERT INTO rie_dataset_versions VALUES ('duplicate-returns', 'company-1', 'Returns', 'duplicate-returns', false)");
    await db.query(`
      INSERT INTO rie_entity_rows (id, company_id, entity_name, dataset_version_id, entity_key, data) VALUES
        ('duplicate-return-1', 'company-1', 'Returns', 'duplicate-returns', 'RET-1', '{"ReturnNo":"RET-1","RouteID":"R-1","TotalAmount":10}'::jsonb),
        ('duplicate-return-2', 'company-1', 'Returns', 'duplicate-returns', 'RET-1␟1', '{"ReturnNo":" ret-1 ","RouteID":"R-1","TotalAmount":20}'::jsonb)
    `);
    await db.query("UPDATE rie_dataset_versions SET is_active = true WHERE id = 'duplicate-returns'");
    await db.query("UPDATE files SET status = 'READY' WHERE id = 'duplicate-returns'");
    await assertParity("company-1", "Returns", ["ReturnNo"]);
    assert.equal((await currentRows("company-1", "Returns")).length, 2);
  });
  await t.test("single-upload data retains parity and SQL returns a bounded result", async () => {
    const result = await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["HIST"] }] }, pagination: { limit: 1 } });
    assert.deepEqual(result.records, [{ InvoiceNo: "HIST", InvoiceStatus: "Historical" }]);
    const explained = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${lastQuery!.text}`, lastQuery!.values);
    const plan = (explained.rows[0]!["QUERY PLAN"] as Array<Record<string, unknown>>)[0]!;
    const root = plan.Plan as Record<string, unknown>;
    const allNodes = (node: Record<string, unknown>): Record<string, unknown>[] => [node, ...((node.Plans ?? []) as Record<string, unknown>[]).flatMap(allNodes)];
    const nodes = allNodes(root);
    assert.ok(nodes.every((node) => node["Node Type"] !== "WindowAgg"));
    assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|ROW_NUMBER\(\) OVER|newest_precedence/);
    assert.ok(nodes.every((node) => node["Parent Relationship"] !== "SubPlan"));
    assert.ok(nodes.every((node) => !(node["Node Type"] === "Nested Loop" && (node.Plans as Record<string, unknown>[] | undefined)?.some((child) => child["Node Type"] === "Seq Scan" && Number(child["Actual Loops"] ?? 0) > 1))));
    const scanned = (node: Record<string, unknown>): number =>
      (node["Relation Name"] ? (Number(node["Actual Rows"]) + Number(node["Rows Removed by Filter"] ?? 0)) * Number(node["Actual Loops"]) : 0)
      + ((node.Plans ?? []) as Record<string, unknown>[]).reduce((sum, child) => sum + scanned(child), 0);
    t.diagnostic(`PostgreSQL fixture: relation rows visited=${scanned(root)}, returned=${root["Actual Rows"]}, executionMs=${plan["Execution Time"]}`);
  });

  await t.test("management Smart Loading bundle preserves all three legacy SQL results", async () => {
    const input = {
      companyId: "company-1",
      routeIds: ["new"],
      targetDate: "2026-08-10",
      salesFrom: "2026-07-01",
      salesTo: "2026-08-10",
      customerCodes: ["c-1"],
    };
    const executionMs = async (sql: Prisma.Sql) => {
      const explained = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql.text}`, sql.values);
      const plan = (explained.rows[0]!["QUERY PLAN"] as Array<Record<string, unknown>>)[0]!;
      return { milliseconds: Number(plan["Execution Time"]), plan };
    };
    const routeProductStaleness = await service.queryRouteProductStaleness({ ...input, staleDaysThreshold: 4 });
    const stalePlan = await executionMs(lastQuery!);
    const stockAlignment = await service.queryManagementStockAlignment(input);
    const alignmentPlan = await executionMs(lastQuery!);
    const vehicleProducts = await service.queryManagementVehicleProducts(input);
    const vehiclePlan = await executionMs(lastQuery!);
    const bundle = await service.queryManagementSmartLoadingBundle({ ...input, staleDaysThreshold: 4 });

    assert.deepEqual(bundle, { routeProductStaleness, stockAlignment, vehicleProducts });
    const bundlePlan = await executionMs(lastQuery!);
    const plan = bundlePlan.plan;
    const allNodes = (node: Record<string, unknown>): Record<string, unknown>[] => [node, ...((node.Plans ?? []) as Record<string, unknown>[]).flatMap(allNodes)];
    const nodes = allNodes(plan.Plan as Record<string, unknown>);
    assert.ok(nodes.every((node) => node["Parent Relationship"] !== "SubPlan"));
    assert.ok(nodes.every((node) => !(node["Node Type"] === "Nested Loop" && (node.Plans as Record<string, unknown>[] | undefined)?.some((child) => child["Node Type"] === "Seq Scan" && Number(child["Actual Loops"] ?? 0) > 1))));
    const legacyMilliseconds = stalePlan.milliseconds + alignmentPlan.milliseconds + vehiclePlan.milliseconds;
    t.diagnostic(`Smart Loading PostgreSQL fixture: legacySqlMs=${legacyMilliseconds.toFixed(3)}, bundleSqlMs=${bundlePlan.milliseconds.toFixed(3)}`);
  });

  await t.test("Smart Loading subtracts only scoped confirmed or approved returns after full-period aggregation", async () => {
    const companyId = "returns-company";
    let rowId = 0;
    const insertCurrent = async (entityName: string, entityKey: string, data: Record<string, unknown>, company = companyId) => {
      rowId += 1;
      await db.query(
        `INSERT INTO rie_canonical_entity_rows
          (id, company_id, entity_name, entity_key, precedence, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 1, $5::jsonb, now(), now())`,
        [`returns-current-${rowId}`, company, entityName, entityKey, JSON.stringify(data)],
      );
    };
    await insertCurrent("Invoices", "I-1", { InvoiceNo: "I-1", InvoiceDate: "2026-09-02", InvoiceStatus: "Confirmed", CustomerCode: "C-1", RouteID: "R-1" });
    for (const [line, productCode, quantity] of [
      [1, "P-0", 100], [2, "P-1", 100], [3, "P-2", 5], [4, "P-3", 10],
      [5, "P-4", 10], [6, "P-5", 10], [7, "P-6", 10],
    ] as const) {
      await insertCurrent("Invoice Items", `I-1|${line}`, { InvoiceNo: "I-1", LineNo: line, RouteID: "R-1", ProductCode: productCode, Quantity: quantity });
      await insertCurrent("Products", productCode, { ProductCode: productCode, ProductName: productCode, Category: "Fresh" });
      await insertCurrent("Van Inventory", `2026-09-07|R-1|${productCode}`, { ReportDate: "2026-09-07", RouteID: "R-1", ProductCode: productCode, Quantity: 0 });
    }
    for (const [returnNo, returnDate, status, customerCode, routeId] of [
      ["RET-1", "2026-09-03", "Confirmed", "C-1", "R-1"],
      ["RET-2", "2026-09-04", "Approved", "C-1", "R-1"],
      ["RET-OUTSIDE", "2026-08-31", "Confirmed", "C-1", "R-1"],
      ["RET-CUSTOMER", "2026-09-03", "Confirmed", "C-2", "R-1"],
      ["RET-PENDING", "2026-09-03", "Pending", "C-1", "R-1"],
      ["RET-OTHER-ROUTE", "2026-09-03", "Confirmed", "C-1", "R-2"],
    ] as const) {
      await insertCurrent("Returns", returnNo, { ReturnNo: returnNo, ReturnDate: returnDate, Status: status, CustomerCode: customerCode, RouteID: routeId });
    }
    await insertCurrent("Return Items", "RET-1|1", { ReturnNo: "RET-1", LineNo: 1, ProductCode: "P-1", Quantity: 10 });
    await insertCurrent("Return Items", "RET-1|2", { ReturnNo: "RET-1", LineNo: 2, ProductCode: "P-1", Quantity: 10 });
    await insertCurrent("Return Items", "RET-1|3", { ReturnNo: "RET-1", LineNo: 3, ProductCode: "P-2", Quantity: 10 });
    await insertCurrent("Return Items", "RET-2|1", { ReturnNo: "RET-2", LineNo: 1, ProductCode: "P-6", Quantity: 2 });
    await insertCurrent("Return Items", "RET-OUTSIDE|1", { ReturnNo: "RET-OUTSIDE", LineNo: 1, ProductCode: "P-3", Quantity: 5 });
    await insertCurrent("Return Items", "RET-CUSTOMER|1", { ReturnNo: "RET-CUSTOMER", LineNo: 1, ProductCode: "P-4", Quantity: 7 });
    await insertCurrent("Return Items", "RET-PENDING|1", { ReturnNo: "RET-PENDING", LineNo: 1, ProductCode: "P-5", Quantity: 7 });
    await insertCurrent("Return Items", "RET-OTHER-ROUTE|1", { ReturnNo: "RET-OTHER-ROUTE", LineNo: 1, ProductCode: "P-0", Quantity: 90 });
    await insertCurrent("Returns", "RET-OTHER-COMPANY", { ReturnNo: "RET-OTHER-COMPANY", ReturnDate: "2026-09-03", Status: "Confirmed", CustomerCode: "C-1", RouteID: "R-1" }, "returns-company-2");
    await insertCurrent("Return Items", "RET-OTHER-COMPANY|1", { ReturnNo: "RET-OTHER-COMPANY", LineNo: 1, ProductCode: "P-0", Quantity: 90 }, "returns-company-2");
    await insertCurrent("Routes", "R-1", { RouteID: "R-1", SalesRepID: "REP-1", SupervisorID: "SUP-1", ManagerID: "MGR-1" });
    await insertCurrent("Employees", "REP-1", { EmployeeID: "REP-1", EmployeeName: "Rep" });
    await insertCurrent("Employees", "SUP-1", { EmployeeID: "SUP-1", EmployeeName: "Supervisor" });
    await insertCurrent("Employees", "MGR-1", { EmployeeID: "MGR-1", EmployeeName: "Manager" });

    const returnsService = new RieScalableQueryService({
      $queryRaw: async (sql: Prisma.Sql) => (await db.query(sql.text, sql.values)).rows,
    } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
    const net = await returnsService.querySmartLoadingNetQuantities({
      companyId, requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" }, routeIds: ["r-1"],
      customerCodes: ["c-1"], fromDate: "2026-09-01", toDate: "2026-09-07",
    });
    assert.deepEqual(Object.fromEntries(net.map((row) => [row.productCode, row.netQuantity])), {
      "p-0": 100, "p-1": 80, "p-2": -5, "p-3": 10, "p-4": 10, "p-5": 10, "p-6": 8,
    });

    const managementInput = {
      companyId, routeIds: ["r-1"], customerCodes: ["c-1"], targetDate: "2026-09-08",
      salesFrom: "2026-09-01", salesTo: "2026-09-07",
    };
    const vehicleProducts = await returnsService.queryManagementVehicleProducts(managementInput);
    const vehicleByProduct = Object.fromEntries(vehicleProducts.map((row) => [row.productCode, row.weeklyAverageSales]));
    assert.equal(vehicleByProduct["p-0"], 100 / 12);
    assert.equal(vehicleByProduct["p-1"], 80 / 12);
    assert.equal(vehicleByProduct["p-2"], 0);
    assert.equal(vehicleByProduct["p-6"], 8 / 12);

    const bundle = await returnsService.queryManagementSmartLoadingBundle({ ...managementInput, staleDaysThreshold: 4 });
    assert.deepEqual(bundle.vehicleProducts, vehicleProducts);
    const risk = await returnsService.queryManagementLoadingRisk({
      companyId, requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" }, personLevel: "sales_rep",
      targetDate: "2026-09-08", salesFrom: "2026-09-01", salesTo: "2026-09-07",
    });
    const riskProducts = risk.people.flatMap((person) => person.routes).flatMap((route) => route.products);
    assert.equal(riskProducts.find((row) => row.productCode === "p-1")?.expectedDemand, 80 / 12);
    assert.equal(riskProducts.some((row) => row.productCode === "p-2"), false);
  });

  await t.test("management active vehicle routes preserve the generic scoped result", async () => {
    const generic = await service.query({
      companyId: "company-1",
      entityName: "Van Inventory",
      projection: [{ field: "RouteID", as: "routeId" }],
      groupBy: [{ field: "RouteID" }],
      aggregates: [{ op: "maxText", field: "ReportDate", as: "latestReportDate" }],
      scope: { route: { values: ["new"] }, date: { field: "ReportDate", to: "2026-08-10" } },
    });
    const coordinated = await service.queryManagementActiveVehicleRoutes({
      companyId: "company-1", routeIds: ["new"], targetDate: "2026-08-10",
    });

    assert.deepEqual(coordinated, generic.records.map((row) => ({
      routeId: String(row.routeId).toLowerCase(),
      latestReportDate: row.latestReportDate,
    })));
  });

  await t.test("representative high-cardinality Visits, Collections and Invoices plans stay set-based", async () => {
    const entities = [
      { entity: "Visits", key: "VisitID", date: "VisitDate", prefix: "VIS" },
      { entity: "Collections", key: "CollectionNo", date: "CollectionDate", prefix: "COL" },
      { entity: "Invoices", key: "InvoiceNo", date: "InvoiceDate", prefix: "INV" },
    ] as const;
    for (const { entity, key, date, prefix } of entities) {
      const slug = entity.toLowerCase();
      await db.query("INSERT INTO files VALUES ($1, $2, $3, true, 'READY', true), ($4, $2, $5, true, 'READY', true)", [`perf-${slug}-old`, "company-1", "2026-07-01", `perf-${slug}-new`, "2026-08-01"]);
      await db.query("INSERT INTO rie_dataset_versions VALUES ($1, $2, $3, $1, true), ($4, $2, $3, $4, true)", [`perf-${slug}-old`, "company-1", entity, `perf-${slug}-new`]);
      await db.query(`
        INSERT INTO rie_entity_rows (id, company_id, entity_name, dataset_version_id, entity_key, data)
        SELECT '${slug}-old-' || series, 'company-1', '${entity}', 'perf-${slug}-old', '${prefix}-' || series, jsonb_build_object('${key}', '${prefix}-' || series, '${date}', '2026-07-01', 'RouteID', 'R-' || (series % 5), 'Amount', 1, 'TotalAmount', 1)
        FROM generate_series(1, 15000) series
      `);
      await db.query(`
        INSERT INTO rie_entity_rows (id, company_id, entity_name, dataset_version_id, entity_key, data)
        SELECT '${slug}-new-' || series, 'company-1', '${entity}', 'perf-${slug}-new', '${prefix}-' || series, jsonb_build_object('${key}', '${prefix}-' || series, '${date}', '2026-08-01', 'RouteID', 'R-' || (series % 5), 'Amount', 2, 'TotalAmount', 2)
        FROM generate_series(1, 5000) series
      `);
      await db.query("SELECT rie_refresh_canonical_current_state($1, $2)", ["company-1", entity]);
    }

    for (const { entity } of entities) {
      const result = await service.query({
        companyId: "company-1", entityName: entity, projection: [],
        aggregates: [{ op: "count", as: "count" }],
        scope: { route: { values: ["R-1"] } }, pagination: { limit: 1 },
      });
      assert.deepEqual(result.records, [{ count: 3000 }]);
      const explained = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${lastQuery!.text}`, lastQuery!.values);
      const plan = (explained.rows[0]!["QUERY PLAN"] as Array<Record<string, unknown>>)[0]!;
      const allNodes = (node: Record<string, unknown>): Record<string, unknown>[] => [node, ...((node.Plans ?? []) as Record<string, unknown>[]).flatMap(allNodes)];
      const nodes = allNodes(plan.Plan as Record<string, unknown>);
      assert.ok(nodes.every((node) => node["Node Type"] !== "WindowAgg"));
      assert.doesNotMatch(lastQuery!.text, /rie_dataset_versions|rie_entity_rows|ROW_NUMBER\(\) OVER|newest_precedence/);
      assert.ok(nodes.every((node) => node["Parent Relationship"] !== "SubPlan"));
      assert.ok(nodes.every((node) => !(node["Node Type"] === "Nested Loop" && (node.Plans as Record<string, unknown>[] | undefined)?.some((child) => child["Node Type"] === "Seq Scan" && Number(child["Actual Loops"] ?? 0) > 1))));
      t.diagnostic(`${entity} 20k history rows (5k newer overlaps): executionMs=${plan["Execution Time"]}`);
    }
  });

  await t.test("representative single-version Visits, Collections and Invoices avoid newest-wins windowing", async () => {
    const entities = [
      { entity: "Visits", key: "VisitID", date: "VisitDate", prefix: "SVIS" },
      { entity: "Collections", key: "CollectionNo", date: "CollectionDate", prefix: "SCOL" },
      { entity: "Invoices", key: "InvoiceNo", date: "InvoiceDate", prefix: "SINV" },
    ] as const;
    for (const { entity, key, date, prefix } of entities) {
      const slug = `single-${entity.toLowerCase()}`;
      await db.query("INSERT INTO files VALUES ($1, $2, $3, true, 'READY', true)", [slug, "company-single", "2026-08-01"]);
      await db.query("INSERT INTO rie_dataset_versions VALUES ($1, $2, $3, $1, true)", [slug, "company-single", entity]);
      await db.query(`
        INSERT INTO rie_entity_rows (id, company_id, entity_name, dataset_version_id, entity_key, data)
        SELECT '${slug}-' || series, 'company-single', '${entity}', '${slug}', '${prefix}-' || series, jsonb_build_object('${key}', '${prefix}-' || series, '${date}', '2026-08-01', 'RouteID', 'R-' || (series % 5), 'Amount', 1, 'TotalAmount', 1)
        FROM generate_series(1, 20000) series
      `);
      await db.query("SELECT rie_refresh_canonical_current_state($1, $2)", ["company-single", entity]);
    }

    for (const { entity } of entities) {
      const result = await service.query({
        companyId: "company-single", entityName: entity, projection: [], aggregates: [{ op: "count", as: "count" }],
        scope: { route: { values: ["R-1"] } }, pagination: { limit: 1 },
      });
      assert.deepEqual(result.records, [{ count: 4000 }]);
      assert.doesNotMatch(lastQuery!.text, /base_candidates|base_versions AS|ROW_NUMBER\(\) OVER|MIN\(candidate_version\.precedence\) OVER/);
      const explained = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${lastQuery!.text}`, lastQuery!.values);
      const plan = (explained.rows[0]!["QUERY PLAN"] as Array<Record<string, unknown>>)[0]!;
      const allNodes = (node: Record<string, unknown>): Record<string, unknown>[] => [node, ...((node.Plans ?? []) as Record<string, unknown>[]).flatMap(allNodes)];
      const nodes = allNodes(plan.Plan as Record<string, unknown>);
      assert.ok(nodes.every((node) => node["Node Type"] !== "WindowAgg" && node["Parent Relationship"] !== "SubPlan"));
      t.diagnostic(`${entity} 20k single-version rows: executionMs=${plan["Execution Time"]}`);
    }
  });
});
test("Local Decision GetTotalSales uses one canonical PostgreSQL aggregate with legacy result parity", {
  skip: process.env.RIE_TEST_PGLITE_MODULE ? false : "Set RIE_TEST_PGLITE_MODULE to run PostgreSQL regression tests",
}, async (t) => {
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!) as { PGlite: new () => TestPostgres };
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE TEMP TABLE rie_canonical_entity_rows (
      id text PRIMARY KEY,
      company_id text NOT NULL,
      source_file_id text,
      entity_name text NOT NULL,
      entity_key text NOT NULL,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL
    );
    CREATE UNIQUE INDEX rie_canonical_entity_rows_company_id_entity_name_entity_key_key
      ON rie_canonical_entity_rows(company_id, entity_name, entity_key);
    CREATE INDEX rie_canonical_entity_rows_company_id_entity_name_idx
      ON rie_canonical_entity_rows(company_id, entity_name);
  `);

  const insert = (
    id: string,
    companyId: string,
    entityName: string,
    entityKey: string,
    data: Record<string, unknown>,
    createdAt: string,
  ) => db.query(
    "INSERT INTO rie_canonical_entity_rows VALUES ($1, $2, NULL, $3, $4, $5::jsonb, $6, $6)",
    [id, companyId, entityName, entityKey, JSON.stringify(data), createdAt],
  );

  const invoiceRows: Array<[string, string, Record<string, unknown>, string]> = [
    ["inv-start", "START", { InvoiceNo: "START", InvoiceDate: "2026-08-01", RouteID: "R-1" }, "2026-08-01T00:00:00Z"],
    ["inv-end", "END", { InvoiceNo: "END", InvoiceDate: "2026-08-31T12:30:00.000Z", RouteID: "R-1" }, "2026-08-01T00:00:01Z"],
    ["inv-middle", "MIDDLE", { InvoiceNo: "MIDDLE", InvoiceDate: "2026-08-15", RouteID: "R-1" }, "2026-08-01T00:00:02Z"],
    ["inv-duplicate-first", "DUP-A", { InvoiceNo: "DUP", InvoiceDate: "2026-07-31", RouteID: "R-1" }, "2026-08-01T00:00:03Z"],
    ["inv-duplicate-second", "DUP-B", { InvoiceNo: "DUP", InvoiceDate: "2026-08-10", RouteID: "R-1" }, "2026-08-01T00:00:04Z"],
    ["inv-other-route", "OTHER-ROUTE", { InvoiceNo: "OTHER-ROUTE", InvoiceDate: "2026-08-10", RouteID: "R-2" }, "2026-08-01T00:00:05Z"],
    ["inv-item-route-mismatch", "ITEM-ROUTE-MISMATCH", { InvoiceNo: "ITEM-ROUTE-MISMATCH", InvoiceDate: "2026-08-10", RouteID: "R-1" }, "2026-08-01T00:00:06Z"],
    ["inv-invalid-date", "INVALID-DATE", { InvoiceNo: "INVALID-DATE", InvoiceDate: "not-a-date", RouteID: "R-1" }, "2026-08-01T00:00:07Z"],
  ];
  for (const [id, key, data, createdAt] of invoiceRows) {
    await insert(id, "company-1", "Invoices", key, data, createdAt);
  }

  const itemRows: Array<[string, string, Record<string, unknown>]> = [
    ["item-start-1", "START-1", { InvoiceNo: "START", LineNo: 1, LineTotal: 10, RouteID: "R-1" }],
    ["item-start-2", "START-2", { InvoiceNo: "START", LineNo: 2, LineTotal: 20, RouteID: "R-1" }],
    ["item-end", "END-1", { InvoiceNo: "END", LineNo: 1, LineTotal: 30, RouteID: "R-1" }],
    ["item-middle-1", "MIDDLE-1", { InvoiceNo: "MIDDLE", LineNo: 1, LineTotal: 40, RouteID: "R-1" }],
    ["item-middle-2", "MIDDLE-2", { InvoiceNo: "MIDDLE", LineNo: 2, LineTotal: 50, RouteID: "R-1" }],
    ["item-duplicate-a", "MIDDLE-3-A", { InvoiceNo: "MIDDLE", LineNo: 3, LineTotal: 5, RouteID: "R-1" }],
    ["item-duplicate-b", "MIDDLE-3-B", { InvoiceNo: "MIDDLE", LineNo: 3, LineTotal: 7, RouteID: "R-1" }],
    ["item-null", "MIDDLE-4", { InvoiceNo: "MIDDLE", LineNo: 4, LineTotal: null, RouteID: "R-1" }],
    ["item-blank", "MIDDLE-5", { InvoiceNo: "MIDDLE", LineNo: 5, LineTotal: " ", RouteID: "R-1" }],
    ["item-invalid", "MIDDLE-6", { InvoiceNo: "MIDDLE", LineNo: 6, LineTotal: "not-a-number", RouteID: "R-1" }],
    ["item-duplicate-header", "DUP-1", { InvoiceNo: "DUP", LineNo: 1, LineTotal: 100, RouteID: "R-1" }],
    ["item-other-route", "OTHER-ROUTE-1", { InvoiceNo: "OTHER-ROUTE", LineNo: 1, LineTotal: 1000, RouteID: "R-2" }],
    ["item-route-mismatch", "ITEM-ROUTE-MISMATCH-1", { InvoiceNo: "ITEM-ROUTE-MISMATCH", LineNo: 1, LineTotal: 2000, RouteID: "R-2" }],
    ["item-invalid-date", "INVALID-DATE-1", { InvoiceNo: "INVALID-DATE", LineNo: 1, LineTotal: 8000, RouteID: "R-1" }],
  ];
  for (const [index, [id, key, data]] of itemRows.entries()) {
    await insert(id, "company-1", "Invoice Items", key, data, `2026-08-01T00:01:${String(index).padStart(2, "0")}Z`);
  }
  await insert("c2-invoice", "company-2", "Invoices", "START", { InvoiceNo: "START", InvoiceDate: "2026-08-10", RouteID: "R-1" }, "2026-08-01T00:02:00Z");
  await insert("c2-item", "company-2", "Invoice Items", "START-1", { InvoiceNo: "START", LineNo: 1, LineTotal: 9999, RouteID: "R-1" }, "2026-08-01T00:02:01Z");

  let finalAggregateRows = -1;
  let finalAggregateSql = "";
  const service = new RieScalableQueryService({
    $queryRaw: async (query: Prisma.Sql) => {
      const result = await db.query(query.text, query.values);
      finalAggregateSql = query.text;
      finalAggregateRows = result.rows.length;
      return result.rows;
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never);
  const context = {
    companyId: "company-1",
    requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" },
    start: "2026-08-01",
    end: "2026-08-31",
  };

  assert.equal(await service.queryLocalDecisionTotalSales(context as never), 162);
  assert.equal(finalAggregateRows, 1);
  assert.match(finalAggregateSql, /SELECT COALESCE\(SUM\(item\.line_total\), 0\)::double precision AS total/);
  assert.match(finalAggregateSql, /FROM "rie_canonical_entity_rows"/);
  assert.doesNotMatch(finalAggregateSql, /rie_dataset_versions|rie_entity_rows|SELECT\s+(?:invoice|item)\.\*/i);
  assert.equal(await service.queryLocalDecisionTotalSales({ ...context, start: "2025-01-01", end: "2025-01-31" } as never), 0);
  assert.equal(await service.queryLocalDecisionTotalSales({
    companyId: "company-2", start: "2026-08-01", end: "2026-08-31",
  } as never), 9999);
});
