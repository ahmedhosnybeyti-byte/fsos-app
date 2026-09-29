import { strict as assert } from "node:assert";
import test from "node:test";
import { AssistantService } from "./assistant.service";

const user = {
  userId: "user-1",
  companyId: "company-1",
  email: "rep@example.com",
  roleCode: "SALES_REP",
  permissions: [],
  mustChangePassword: false,
  orgUnitId: null,
} as const;

function serviceWith(rieFacade: Record<string, unknown>): AssistantService {
  return new AssistantService(rieFacade as never, {} as never, {} as never, {} as never, {} as never);
}

async function query(service: AssistantService, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  return (await (service as unknown as {
    queryDataset(userInput: typeof user, raw: unknown): Promise<unknown>;
  }).queryDataset(user, input)) as Record<string, unknown>;
}

test("query_dataset sends exact/in filters, projection and pagination to PostgreSQL without a full read", async () => {
  let received: Record<string, unknown> | undefined;
  let fullReads = 0;
  const service = serviceWith({
    hasCanonicalEntitySources: async () => true,
    queryAssistantDataset: async (input: Record<string, unknown>) => {
      received = input;
      return {
        totalMatchingRows: 3,
        records: [{ InvoiceNo: "INV-2", CustomerCode: "C-1" }],
        noMatchHint: {},
      };
    },
    getEntityRecords: async () => {
      fullReads++;
      throw new Error("full read must not run");
    },
  });

  const result = await query(service, {
    entityName: "Invoices",
    customerId: " c-1 ",
    filters: { RouteID: { in: ["R-1", "R-2"] } },
    columns: ["invoiceno", "CustomerCode"],
    limit: 1,
    offset: 1,
  });

  assert.equal(fullReads, 0);
  assert.deepEqual(received?.filters, [
    { field: "CustomerCode", values: [" c-1 "] },
    { field: "RouteID", values: ["R-1", "R-2"] },
  ]);
  assert.deepEqual(received?.projection, ["InvoiceNo", "CustomerCode"]);
  assert.deepEqual(received?.pagination, { limit: 1, offset: 1 });
  assert.deepEqual(result, {
    totalMatchingRows: 3,
    returnedRows: 1,
    limit: 1,
    offset: 1,
    hasMore: true,
    rows: [{ InvoiceNo: "INV-2", CustomerCode: "C-1" }],
  });
});

test("query_dataset count and zero-match hints preserve the established response shape", async () => {
  const service = serviceWith({
    hasCanonicalEntitySources: async () => true,
    queryAssistantDataset: async () => ({
      totalMatchingRows: 0,
      records: [],
      noMatchHint: { RouteID: ["R-1", "R-2"] },
    }),
  });

  const result = await query(service, {
    entityName: "Invoices",
    filters: { routeid: { in: ["missing"] } },
    aggregate: { op: "count", column: "InvoiceNo" },
  });
  assert.deepEqual(result, {
    totalMatchingRows: 0,
    aggregate: {
      op: "count",
      column: "InvoiceNo",
      value: 0,
      rowsAggregated: 0,
      skippedNonNumericRows: 0,
    },
    noMatchHint: { RouteID: ["R-1", "R-2"] },
  });
});

test("query_dataset leaves search, rich operators, grouping, explicit sort and non-count aggregates on the legacy path", async () => {
  for (const unsafe of [
    { search: "needle" },
    { filters: { TotalAmount: { greaterThan: 10 } } },
    { groupBy: "RouteID", aggregate: { op: "count" } },
    { sortBy: "InvoiceNo" },
    { aggregate: { op: "sum", column: "TotalAmount" } },
  ]) {
    let postgresCalls = 0;
    let fullReads = 0;
    const service = serviceWith({
      hasCanonicalEntitySources: async () => true,
      queryAssistantDataset: async () => { postgresCalls++; },
      getEntityRecords: async () => {
        fullReads++;
        return { available: true, records: [], fields: ["InvoiceNo", "RouteID", "TotalAmount"] };
      },
    });
    await query(service, { entityName: "Invoices", ...unsafe });
    assert.equal(postgresCalls, 0);
    assert.equal(fullReads, 1);
  }
});

test("query_dataset preserves unavailable-entity and validation errors before issuing SQL", async () => {
  let sqlCalls = 0;
  const unavailable = serviceWith({
    hasCanonicalEntitySources: async () => false,
    queryAssistantDataset: async () => { sqlCalls++; },
  });
  assert.deepEqual(await query(unavailable, { entityName: "Invoices" }), {
    error: 'الكيان "Invoices" غير متاح لهذه الشركة. استخدم list_datasets للحصول على قائمة صحيحة.',
  });
  assert.equal(sqlCalls, 0);

  const invalid = serviceWith({
    hasCanonicalEntitySources: async () => true,
    queryAssistantDataset: async () => { sqlCalls++; },
  });
  const result = await query(invalid, { entityName: "Invoices", filters: { Missing: "x" } });
  assert.match(String(result.error), /filters column "Missing" was not found/);
  assert.equal(sqlCalls, 0);
});
