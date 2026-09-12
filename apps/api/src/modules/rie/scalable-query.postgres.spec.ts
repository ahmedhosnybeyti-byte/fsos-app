import { strict as assert } from "node:assert";
import test from "node:test";
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

  let lastQuery: Prisma.Sql | undefined;
  const service = new RieScalableQueryService({
    $queryRaw: async (sql: Prisma.Sql) => {
      lastQuery = sql;
      return (await db.query(sql.text, sql.values)).rows;
    },
  } as never, { resolveAllowedRouteIds: async () => new Set(["old"]) } as never);
  const invoices = { companyId: "company-1", entityName: "Invoices", projection: [{ field: "InvoiceNo" }, { field: "InvoiceStatus" }], pagination: { limit: 10 } };

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
    assert.deepEqual(result.records, [{ count: 2, total: 175 }]);
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
  await t.test("single-upload data retains parity and SQL returns a bounded result", async () => {
    const result = await service.query({ ...invoices, scope: { fields: [{ field: "InvoiceNo", values: ["HIST"] }] }, pagination: { limit: 1 } });
    assert.deepEqual(result.records, [{ InvoiceNo: "HIST", InvoiceStatus: "Historical" }]);
    const explained = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${lastQuery!.text}`, lastQuery!.values);
    const plan = (explained.rows[0]!["QUERY PLAN"] as Array<Record<string, unknown>>)[0]!;
    const root = plan.Plan as Record<string, unknown>;
    const allNodes = (node: Record<string, unknown>): Record<string, unknown>[] => [node, ...((node.Plans ?? []) as Record<string, unknown>[]).flatMap(allNodes)];
    const nodes = allNodes(root);
    assert.ok(nodes.some((node) => node["Node Type"] === "WindowAgg"));
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
      assert.ok(nodes.some((node) => node["Node Type"] === "WindowAgg"));
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
