import { strict as assert } from "node:assert";
import test from "node:test";
import { VisitCopilotService } from "./visit-copilot.service";

test("Visit Copilot retains canonical management identities and Sales Rep restrictions", async () => {
  const service = new VisitCopilotService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const scopedActor = (service as unknown as { scopedActor: (user: { companyId: string; userId: string; roleCode: string; email: string }, salesRepId?: string) => Promise<unknown> }).scopedActor;
  const companyAdmin = { companyId: "company", userId: "admin", roleCode: "COMPANY_ADMIN", email: "admin@example.com" };
  const manager = { companyId: "company", userId: "manager", roleCode: "MANAGER", email: "manager@example.com" };
  const salesRep = { companyId: "company", userId: "rep", roleCode: "SALES_REP", email: "rep@example.com" };

  assert.equal(await scopedActor(companyAdmin), companyAdmin);
  assert.equal(await scopedActor(manager), manager);
  assert.equal(await scopedActor(salesRep), salesRep);
  await assert.rejects(() => scopedActor(companyAdmin, "REP-1"));
  await assert.rejects(() => scopedActor(manager, "REP-1"));
  await assert.rejects(() => scopedActor(salesRep, "REP-1"));
});

test("Visit Copilot enters a bounded RIE request plan for its direct and fan-out reads", async () => {
  const plans: Array<{ name: string; maxConcurrentOperations: number; maxOperations: number }> = [];
  const rieFacade = {
    runPlannedRequest: async <T>(options: { name: string; maxConcurrentOperations: number; maxOperations: number }, execute: () => Promise<T>) => {
      plans.push(options);
      return execute();
    },
    queryCanonicalRecords: async () => ({ records: [], page: { hasMore: false } }),
  };
  const prisma = {
    salesCalendar: { findMany: async () => [] },
    prospectVisitIntent: { findMany: async () => [] },
  };
  const service = new VisitCopilotService(
    rieFacade as never,
    {} as never,
    prisma as never,
    {} as never,
    { detect: async () => ({ opportunities: [] }) } as never,
    {} as never,
    {} as never,
  );
  const user = { companyId: "company", userId: "user", roleCode: "SALES_REP", email: "rep@example.com" };

  await service.dailyBrief(user as never, { period: "3m" } as never);
  await service.supervisedSalesReps({ ...user, roleCode: "SUPERVISOR" } as never);

  assert.deepEqual(plans, [
    { name: "visit_copilot.daily_brief", maxConcurrentOperations: 3, maxOperations: 24 },
    { name: "visit_copilot.supervised_sales_reps", maxConcurrentOperations: 3, maxOperations: 24 },
  ]);
});

test("discovery reuses the daily-route aggregates instead of repeating full entity reads", async () => {
  const canonicalQueries: string[] = [];
  let postgresExecutions = 0;
  let fullEntityReads = 0;
  const rieFacade = {
    runPlannedRequest: async <T>(_options: unknown, execute: () => Promise<T>) => execute(),
    getEntityRecords: async () => {
      fullEntityReads++;
      throw new Error("discovery must not repeat Customers/Invoices/Invoice Items reads");
    },
    queryCanonicalRecords: async (query: { entityName: string; aggregates?: Array<{ as: string }> }) => {
      postgresExecutions++;
      canonicalQueries.push(query.entityName);
      const aliases = new Set((query.aggregates ?? []).map((aggregate) => aggregate.as));
      if (query.entityName === "Customers") {
        return { records: [
          { CustomerCode: "C-1", CustomerName: "Customer 1", Latitude: 24.7, Longitude: 46.7, VisitSequence: 1, Channel: "Traditional Trade" },
          { CustomerCode: "C-2", CustomerName: "Customer 2", Latitude: 24.7005, Longitude: 46.7005, VisitSequence: 2, Channel: "Traditional Trade" },
        ], page: { hasMore: false } };
      }
      if (query.entityName === "Invoices" && aliases.has("invoiceCount")) {
        return { records: [{ customerCode: "C-1", invoiceCount: 2 }, { customerCode: "C-2", invoiceCount: 1 }], page: { hasMore: false } };
      }
      if (query.entityName === "Invoices") {
        return { records: [{ customerCode: "C-1", lastInvoiceDate: "2026-09-30" }], page: { hasMore: false } };
      }
      if (query.entityName === "Invoice Items") {
        if (aliases.has("lines")) return { records: [
          { customerCode: "C-1", productCode: "P-1", lines: 2, qty: 4 },
          { customerCode: "C-2", productCode: "P-1", lines: 1, qty: 2 },
        ], page: { hasMore: false } };
        return { records: [{ customerCode: "C-1", sales: 300 }, { customerCode: "C-2", sales: 100 }], page: { hasMore: false } };
      }
      if (query.entityName === "Products") return { records: [{ productCode: "P-1", productName: "Product 1" }], page: { hasMore: false } };
      if (query.entityName === "Visits") {
        return { records: [{ customerCode: "C-1", lastVisitDate: "2026-09-29" }], page: { hasMore: false } };
      }
      if (query.entityName === "Targets") {
        return { records: [{ targetRows: 0, salesTarget: 0 }], page: { hasMore: false } };
      }
      return { records: [], page: { hasMore: false } };
    },
  };
  const prisma = {
    salesCalendar: { findMany: async () => [] },
    prospectVisitIntent: { findMany: async () => [] },
    prospect: { findMany: async () => [{ id: "prospect-1", source: "OSM", externalKey: "place-1", name: "Prospect 1", address: null, phone: null, lat: 24.7002, lon: 46.7002, channel: "Traditional Trade", status: "NEW", scoreTotal: null, businessType: null, scoreConfidence: null, intelligenceProfile: null }] },
  };
  const service = new VisitCopilotService(
    rieFacade as never,
    {} as never,
    prisma as never,
    {} as never,
    { detect: async () => ({ opportunities: [], status: "no-lost-opportunities" }) } as never,
    {} as never,
    {} as never,
  );
  const user = { companyId: "company", userId: "user", roleCode: "SALES_REP", email: "rep@example.com" };

  const result = await service.discovery(user as never, { period: "3m", date: "2026-10-03" } as never);

  assert.equal(fullEntityReads, 0);
  assert.deepEqual(canonicalQueries, ["Customers", "Invoices", "Invoices", "Invoice Items", "Collections", "Collections", "Visits", "Targets", "Customers", "Invoice Items", "Products"]);
  assert.equal(postgresExecutions, 11);
  assert.ok(postgresExecutions < 24);
  assert.equal(result.customers.length, 2);
  assert.equal(result.customers[0]?.customerCode, "C-1");
  assert.equal(result.repChannel, "Traditional Trade");
  assert.deepEqual(result.prospects[0]?.nearbyBestSellers, [{ productCode: "P-1", productName: "Product 1", nearbyCustomerCount: 2 }]);
  assert.equal(result.prospects[0]?.nearbySalesCustomerCount, 2);
});
