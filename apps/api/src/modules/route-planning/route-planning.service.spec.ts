import { strict as assert } from "node:assert";
import test from "node:test";
import { RoutePlanningService } from "./route-planning.service";

function legacySales(invoices: Array<{ InvoiceNo: string; CustomerCode: string }>, items: Array<{ InvoiceNo: string; LineTotal: unknown }>) {
  const invoiceCustomer = new Map(invoices.map((invoice) => [invoice.InvoiceNo.trim(), invoice.CustomerCode.trim()]));
  const totals = new Map<string, number>();
  for (const item of items) {
    const customer = invoiceCustomer.get(item.InvoiceNo.trim());
    const amount = typeof item.LineTotal === "number" ? item.LineTotal : Number(item.LineTotal);
    if (customer) totals.set(customer, (totals.get(customer) ?? 0) + (Number.isFinite(amount) ? amount : 0));
  }
  return totals;
}

test("computes route-planning sales with a scoped PostgreSQL join/group aggregate", async () => {
  let query: Record<string, unknown> | undefined;
  const service = new RoutePlanningService(
    {} as never,
    {
      hasCanonicalEntitySources: async () => true,
      queryCanonicalRecords: async (input: Record<string, unknown>) => {
        query = input;
        return { records: [{ customerCode: "C-1", sales: 150 }, { customerCode: "C-2", sales: 25 }], page: { limit: 5000, offset: 0, hasMore: false } };
      },
    } as never,
    { resolveAllowedRouteIds: async () => null } as never,
  );
  const ctx = { companyId: "company-1", requestingUser: { roleCode: "COMPANY_ADMIN", email: "admin@example.test" } };
  const actual = await (service as unknown as { computeSalesByCustomer: (context: typeof ctx, customerCodes: string[]) => Promise<Map<string, number>> }).computeSalesByCustomer(ctx, ["C-1", "C-2"]);
  const expected = legacySales(
    [{ InvoiceNo: "INV-1", CustomerCode: "C-1" }, { InvoiceNo: "INV-2", CustomerCode: "C-2" }],
    [{ InvoiceNo: "INV-1", LineTotal: 100 }, { InvoiceNo: "INV-1", LineTotal: "50" }, { InvoiceNo: "INV-2", LineTotal: 25 }],
  );

  assert.deepEqual(actual, expected);
  assert.deepEqual(query?.entityName, "Invoice Items");
  assert.deepEqual(query?.joins, [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }]);
  assert.deepEqual(query?.groupBy, [{ field: "CustomerCode", source: "invoice" }]);
  assert.deepEqual(query?.aggregates, [{ op: "sum", field: "LineTotal", as: "sales" }]);
  assert.deepEqual((query?.scope as { customer: { values: string[] } }).customer.values, ["C-1", "C-2"]);
});
