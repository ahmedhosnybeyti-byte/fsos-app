import { strict as assert } from "node:assert";
import test from "node:test";
import {
  fsos360CapabilitiesResponseSchema,
  fsos360FilterOptionsResponseSchema,
  fsos360QueryResponseSchema,
} from "@field-sales-os/schemas";
import { Fsos360WorkspaceService } from "./fsos-360-workspace.service";

const available = (records: Record<string, unknown>[] = []) => ({ available: true, records });
const unavailable = () => ({ available: false, records: [] });

function context(overrides: Record<string, unknown> = {}) {
  const datasets = {
    Companies: available(), Regions: available(), Branches: available(), Employees: available(),
    Routes: available(), "Route Assignments": available(), Customers: available(), Products: available(),
    Invoices: available(), "Invoice Items": available(), Collections: available(), Returns: available(),
    Visits: available(), Targets: unavailable(),
  };
  return {
    filters: { companyId: "company-1", salesRepIds: ["rep-1"] },
    removedSelections: {},
    activeAnalysisLevel: "sales-rep",
    customers: new Map([["customer-1", { code: "customer-1", name: "Customer", city: "City", branchId: "branch-1", routeId: "route-a" }]]),
    products: new Map([["product-1", { code: "product-1", name: "Product", brand: "Brand", category: "Category" }]]),
    routes: new Map([
      ["route-a", { id: "route-a", name: "Route A", branchId: "branch-1", salesRepId: "current-rep" }],
      ["route-b", { id: "route-b", name: "Route B", branchId: "branch-1", salesRepId: "current-rep" }],
    ]),
    employees: new Map([["rep-1", { id: "rep-1", name: "Rep", managerId: null, branchId: "branch-1" }]]),
    routeAssignments: [],
    branches: new Map(), regions: new Map(), datasets,
    smallFilterOptions: { company: [], regionCity: [], branch: [], manager: [], supervisor: [], route: [] },
    capabilities: {
      routeAssignments: { availability: "available", available: true, reason: null },
      manager: { availability: "unavailable", available: false, reason: "manager-supervisor-role-ambiguous" },
      supervisor: { availability: "unavailable", available: false, reason: "manager-supervisor-role-ambiguous" },
    },
    ...overrides,
  } as any;
}

function workspace(resolvedContext: any) {
  return new Fsos360WorkspaceService({ resolve: async () => resolvedContext } as any);
}

const periods = {
  currentPeriod: { from: "2026-01-01", to: "2026-01-31" },
  comparisonPeriod: { from: "2026-02-01", to: "2026-02-28" },
  filters: { salesRepIds: ["rep-1"] },
  analysisFocus: "sales-rep" as const,
};

test("sales-rep analysis uses the route assignment valid on each operation date", async () => {
  const resolved = context({
    routeAssignments: [
      { routeId: "route-a", employeeId: "rep-1", role: "SalesRep", startAt: Date.parse("2026-01-01"), endAt: Date.parse("2026-01-31T23:59:59Z") },
      { routeId: "route-b", employeeId: "rep-1", role: "SalesRep", startAt: Date.parse("2026-02-01"), endAt: null },
    ],
    datasets: {
      ...context().datasets,
      Invoices: available([
        { InvoiceNo: "inv-jan", CustomerCode: "customer-1", RouteID: "route-a", InvoiceDate: "2026-01-15" },
        { InvoiceNo: "inv-feb", CustomerCode: "customer-1", RouteID: "route-b", InvoiceDate: "2026-02-15" },
      ]),
      "Invoice Items": available([
        { InvoiceNo: "inv-jan", ProductCode: "product-1", LineTotal: 100 },
        { InvoiceNo: "inv-feb", ProductCode: "product-1", LineTotal: 200 },
      ]),
    },
  });
  const response = await workspace(resolved).query({} as any, periods);
  const sales = response.kpis.find((item: any) => item.id === "sales");
  assert.ok(sales);
  assert.equal(sales.currentValue, 100);
  assert.equal(sales.previousValue, 200);
});

test("sales-rep analysis is unavailable without route assignment history", async () => {
  const resolved = context({
    routeAssignments: [],
    capabilities: { ...context().capabilities, routeAssignments: { availability: "unavailable", available: false, reason: "route-assignment-history-unavailable" } },
  });
  const response = await workspace(resolved).query({} as any, periods);
  assert.deepEqual(response.capabilities.analysis, { availability: "unavailable", reason: "route-assignment-history-unavailable" });
});

test("route analysis remains based on operation RouteID snapshots", async () => {
  const resolved = context({
    filters: { companyId: "company-1", routeIds: ["route-a"] },
    activeAnalysisLevel: "route",
    routeAssignments: [],
    datasets: {
      ...context().datasets,
      Invoices: available([{ InvoiceNo: "invoice-a", CustomerCode: "customer-1", RouteID: "route-a", InvoiceDate: "2026-01-15" }]),
      "Invoice Items": available([{ InvoiceNo: "invoice-a", ProductCode: "product-1", LineTotal: 125 }]),
    },
  });
  const response = await workspace(resolved).query({} as any, {
    currentPeriod: { from: "2026-01-01", to: "2026-01-31" },
    comparisonPeriod: { from: "2025-12-01", to: "2025-12-31" },
    filters: { routeIds: ["route-a"] },
    analysisFocus: "route",
  });
  assert.equal(response.capabilities.analysis.availability, "available");
  assert.equal(response.kpis.find((item: any) => item.id === "sales")?.currentValue, 125);
});

test("FSOS 360 response schemas accept live workspace response shapes", async () => {
  const resolved = context({
    routeAssignments: [{ routeId: "route-a", employeeId: "rep-1", role: "SalesRep", startAt: Date.parse("2026-01-01"), endAt: null }],
  });
  const service = workspace(resolved);
  const query = await service.query({} as any, periods);
  fsos360QueryResponseSchema.parse(query);
  fsos360FilterOptionsResponseSchema.parse(await service.filterOptions({} as any, { field: "sales-rep", query: "", page: 1, pageSize: 10, context: periods }));
  fsos360CapabilitiesResponseSchema.parse(await service.capabilities({} as any));
});
