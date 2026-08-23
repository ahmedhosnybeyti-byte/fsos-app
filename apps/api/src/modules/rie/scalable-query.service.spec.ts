import { strict as assert } from "node:assert";
import test from "node:test";
import { RieScalableQueryService } from "./scalable-query.service";

test("scalable query sends scoped joins, grouping, aggregation, and pagination to PostgreSQL", async () => {
  let captured: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
  const service = new RieScalableQueryService({ $queryRaw: async (query: typeof captured) => { captured = query; return [{ customer: "C-1", sales: 10 }, { customer: "C-2", sales: 9 }]; } } as never, { resolveAllowedRouteIds: async () => new Set(["rt-1"]) } as never);
  const result = await service.query({ companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" }, entityName: "Invoice Items", projection: [{ field: "CustomerCode", as: "customer" }], joins: [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }], aggregates: [{ op: "sum", field: "LineTotal", as: "sales" }], groupBy: [{ field: "CustomerCode" }], scope: { date: { field: "InvoiceDate", source: "invoice", from: "2026-08-01", to: "2026-08-31" }, customer: { values: ["C-1"] } }, pagination: { limit: 1 } });
  assert.equal(result.records.length, 1);
  assert.equal(result.page.hasMore, true);
  const sql = captured?.strings?.join(" ") ?? "";
  assert.ok(sql.includes('"rie_entity_rows"'));
  assert.ok(sql.includes('base_version."is_active" = TRUE'));
  assert.ok(sql.includes('invoice_version."is_active" = TRUE'));
  assert.ok(captured?.values?.includes("company-1"));
  assert.ok(captured?.values?.includes("rt-1"));
});
test("scalable query rejects unsafe identifiers and empty scopes fail closed", async () => {
  const service = new RieScalableQueryService({ $queryRaw: async () => [] } as never, { resolveAllowedRouteIds: async () => null } as never);
  await assert.rejects(() => service.query({ companyId: "c", entityName: "Customers", projection: [{ field: "CustomerCode; DROP" }] }));
  assert.deepEqual((await service.query({ companyId: "c", entityName: "Customers", projection: [{ field: "CustomerCode" }], scope: { customer: { values: [] } } })).records, []);
});
