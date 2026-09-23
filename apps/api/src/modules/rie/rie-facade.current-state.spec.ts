import { strict as assert } from "node:assert";
import test from "node:test";
import { RieFacade } from "./rie-facade.service";

test("direct invoice-sales RIE SQL reads canonical current-state without historical reconstruction", async () => {
  let captured: { strings?: readonly string[]; values?: readonly unknown[] } | undefined;
  const prisma = {
    $queryRaw: async (statement: typeof captured) => {
      captured = statement;
      return [{ invoiceNo: "INV-1", lineNo: 1, time: new Date("2026-09-01T00:00:00Z"), customerCode: "C-1", productCode: "P-1", amount: 25 }];
    },
  };
  const facade = new RieFacade(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    prisma as never,
    {} as never,
    { resolveAllowedRouteIds: async () => new Set(["r-1"]) } as never,
    {} as never,
  );

  const result = await facade.getInvoiceSalesRows(
    { companyId: "company-1", requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" } },
    { fromTime: Date.parse("2026-09-01"), toTime: Date.parse("2026-09-30") },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.time, Date.parse("2026-09-01T00:00:00Z"));
  const sql = captured?.strings?.join(" ") ?? "";
  assert.match(sql, /rie_canonical_entity_rows/);
  assert.doesNotMatch(sql, /rie_dataset_versions|rie_entity_rows|ROW_NUMBER\(\) OVER|MIN\(precedence\) OVER/);
  assert.match(sql, /inv\."company_id"/);
  assert.match(sql, /item\."company_id"/);
  assert.match(sql, /InvoiceDate/);
  assert.match(sql, /RouteID/);
});
