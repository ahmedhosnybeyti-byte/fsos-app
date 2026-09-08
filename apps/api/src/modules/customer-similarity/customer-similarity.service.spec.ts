import { strict as assert } from "node:assert";
import test from "node:test";
import { CustomerSimilarityService } from "./customer-similarity.service";

const page = (records: Record<string, unknown>[]) => ({ records, page: { limit: 0, offset: 0, hasMore: false } });
const user = { companyId: "company-1", roleCode: "ADMIN", email: "admin@example.com" } as any;

test("customer similarity keeps sales features and clustering parity while RIE aggregates the fact join", async () => {
  const calls: any[] = [];
  const rie = {
    hasCanonicalEntitySources: async () => true,
    getEntityRecords: async () => { throw new Error("Customer Similarity must not read raw entities"); },
    queryCanonicalRecords: async (query: any) => {
      calls.push(query);
      if (query.entityName === "Customers") return page([
        { CustomerCode: "C-1", CustomerName: "One", Latitude: "24.7", Longitude: "46.7" },
        { CustomerCode: "C-2", CustomerName: "Two", Latitude: 25, Longitude: 47 },
        { CustomerCode: "C-3", CustomerName: "Bad coordinates", Latitude: 0, Longitude: 0 },
        { CustomerCode: "C-4", CustomerName: "No sales", Latitude: 26, Longitude: 48 },
      ]);
      return page([
        // Same values as the former Invoice Items -> Invoice map/join loop:
        // C-1 has two lines and one SKU; C-2 has one line and one SKU.
        { customerCode: "C-1", totalValue: 125, orderCount: 2, distinctSkus: 1 },
        { customerCode: "C-2", totalValue: 20, orderCount: 1, distinctSkus: 1 },
        { customerCode: "C-3", totalValue: 99, orderCount: 1, distinctSkus: 1 },
      ]);
    },
  };

  const result = await new CustomerSimilarityService(rie as any).query(user, { clusterCount: 2, similarityBasis: "sales" });

  assert.equal(result.totalScopedRows, 3); // C-3 remains excluded for invalid coordinates.
  assert.equal(result.excludedNoSalesData, 1); // C-4 only.
  assert.deepEqual(result.records.map(({ id, sales }) => ({ id, sales })), [{ id: "C-1", sales: 125 }, { id: "C-2", sales: 20 }]);
  assert.deepEqual(result.clusterProfiles.map((profile) => ({ ...profile, avgDistinctSkus: profile.avgDistinctSkus })), [
    { avgTotalValue: 125, avgOrderCount: 2, avgDistinctSkus: 1 },
    { avgTotalValue: 20, avgOrderCount: 1, avgDistinctSkus: 1 },
  ]);

  const sales = calls.find((query) => query.entityName === "Invoice Items");
  assert.ok(sales);
  assert.deepEqual(sales.joins, [{ entityName: "Invoices", alias: "invoice", on: { left: { field: "InvoiceNo" }, rightField: "InvoiceNo" } }]);
  assert.deepEqual(sales.groupBy, [{ field: "CustomerCode", source: "invoice" }]);
  assert.deepEqual(sales.aggregates.map((aggregate: any) => aggregate.op), ["sum", "count", "countDistinct"]);
  assert.equal(sales.unboundedFinalResult, true);
});

test("customer similarity scopes the Customer join before grouping sales", async () => {
  const calls: any[] = [];
  const rie = {
    hasCanonicalEntitySources: async () => true,
    queryCanonicalRecords: async (query: any) => {
      calls.push(query);
      return query.entityName === "Customers"
        ? page([{ CustomerCode: "C-1", CustomerName: "One", Latitude: 24, Longitude: 46 }])
        : page([{ customerCode: "C-1", totalValue: 10, orderCount: 1, distinctSkus: 1 }]);
    },
  };
  await assert.rejects(() => new CustomerSimilarityService(rie as any).query(user, { clusterCount: 2, similarityBasis: "sales", scopeField: "City", scopeValues: ["Riyadh"] }));
  const sales = calls.find((query) => query.entityName === "Invoice Items");
  // Query construction occurs before the minimum-cluster validation.
  assert.ok(sales);
  assert.ok(sales.joins.some((join: any) => join.alias === "customer"));
  assert.deepEqual(sales.scope.fields, [{ field: "City", source: "customer", values: ["Riyadh"] }]);
});
