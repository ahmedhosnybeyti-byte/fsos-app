import { strict as assert } from "node:assert";
import test from "node:test";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { HeatmapService } from "./heatmap.service";

const user: AuthenticatedUser = {
  userId: "u", companyId: "company-1", email: "rep@example.test", roleCode: "SALES_REP",
  permissions: [], mustChangePassword: false, orgUnitId: null,
};

test("Heatmap query preserves point/result shape while Node receives customer-grain rows", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const facade = { hasCanonicalEntitySources: async () => true };
  const scalable = {
    queryHeatmapCustomerPoints: async (input: Record<string, unknown>) => {
      calls.push({ name: "customers", input });
      return [
        { id: "C-1", label: "One", lat: 24.7, lon: 46.7, totalRows: 3 },
        { id: "C-2", label: "Two", lat: null, lon: 46.8, totalRows: 3 },
        { id: "C-3", label: "Three", lat: 24.9, lon: 46.9, totalRows: 3 },
      ];
    },
    queryHeatmapSales: async (input: Record<string, unknown>) => {
      calls.push({ name: "sales", input });
      return [{ customerCode: "C-1", total: 125 }, { customerCode: "C-3", total: 75 }];
    },
  };
  const service = new HeatmapService(facade as never, {} as never, scalable as never);
  const result = await service.query(user, {
    metric: "sales", scopeField: "Channel", scopeValues: ["Retail"], dateFrom: "2026-01-01", dateTo: "2026-01-31",
  });

  assert.deepEqual(result, {
    metric: "sales",
    excludedBadCoordinates: 1,
    totalRows: 3,
    usedRows: 2,
    maxValue: 125,
    totalValue: 200,
    points: [
      { id: "C-1", label: "One", lat: 24.7, lon: 46.7, value: 125 },
      { id: "C-3", label: "Three", lat: 24.9, lon: 46.9, value: 75 },
    ],
  });
  assert.deepEqual(calls.find((call) => call.name === "customers")?.input.scopeValues, ["Retail"]);
  assert.deepEqual(calls.find((call) => call.name === "sales")?.input.customerCodes, ["C-1", "C-2", "C-3"]);
});

test("Heatmap keeps the exact over-limit and empty-City errors without loading all customers", async () => {
  let rows: Array<Record<string, unknown>> = [{ id: "C-1", label: "One", lat: 24, lon: 46, totalRows: 5_001 }];
  const facade = { hasCanonicalEntitySources: async () => true };
  const scalable = { queryHeatmapCustomerPoints: async () => rows };
  const service = new HeatmapService(facade as never, {} as never, scalable as never);

  await assert.rejects(() => service.query(user, { metric: "customerCount" }), /5001 customers match this scope/);
  rows = [];
  await assert.rejects(
    () => service.query(user, { metric: "customerCount", scopeField: "City", scopeValues: ["Missing"] }),
    /لا توجد بيانات مطابقة لـ City/,
  );
});

test("Heatmap dropdowns preserve trim, dedupe and locale ordering with compact grouped reads", async () => {
  const calls: Record<string, unknown>[] = [];
  const facade = {
    hasCanonicalEntitySources: async () => true,
    queryCanonicalRecords: async (input: Record<string, unknown>) => {
      calls.push(input);
      return { records: [{ value: " Retail " }, { value: "Retail" }, { value: "" }, { value: "Wholesale" }], page: { limit: 0, offset: 0, hasMore: false } };
    },
  };
  const service = new HeatmapService(facade as never, {} as never, {} as never);

  assert.deepEqual(await service.scopeValues(user, "Channel"), { values: ["Retail", "Wholesale"] });
  assert.deepEqual(await service.categoryValues(user), { values: ["Retail", "Wholesale"] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.entityName, "Customers");
  assert.equal(calls[1]?.entityName, "Products");
});
