import { strict as assert } from "node:assert";
import test from "node:test";
import { LostOpportunityService } from "./lost-opportunity.service";

type Row = Record<string, unknown>;
const ok = (records: Row[]) => ({
  entityName: "test",
  available: true,
  records,
  fields: [...new Set(records.flatMap((record) => Object.keys(record)))],
  warnings: [],
});

const products = ok([
  { ProductCode: "P1", ProductName: "Product 1", Category: "Drinks" },
  { ProductCode: "P2", ProductName: "Product 2", Category: "Snacks" },
]);
const confirmedHeader = { "Invoice No": "I1", "Customer Code": "C1", "Invoice Date": "2026-04-10", "Invoice Status": " Confirmed " };
const base = (overrides: Record<string, ReturnType<typeof ok>> = {}) => ({
  Products: products,
  Invoices: ok([confirmedHeader]),
  "Invoice Items": ok([{ "Invoice No": "I1", "Product Code": "P1", Quantity: 9 }]),
  Returns: ok([]),
  "Return Items": ok([]),
  ...overrides,
});
const input = {
  companyId: "company",
  requestingUser: { roleCode: "SALES_REP", email: "rep@example.com" },
  selectedDate: "2026-07-31",
  customerCodes: ["C1"],
  customerNames: new Map([["C1", "Customer"]]),
};
const service = (sets = base()) => new LostOpportunityService({
  getEntityRecords: async (name: string) => sets[name as keyof typeof sets] ?? ok([]),
} as any);

test("joins a confirmed invoice header to its item using canonical normalized fields", async () => {
  const result = await service().detect(input);
  assert.equal(result.status, "available");
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0]!.baselineNetQuantity, 9);
  assert.equal(result.opportunities[0]!.suggestedQuantity, 3);
  assert.equal(result.opportunities[0]!.category, "Drinks");
});

test("maps each Products.Category to the matching opportunity by ProductCode", async () => {
  const sets = base({
    "Invoice Items": ok([
      { "Invoice No": "I1", "Product Code": "P1", Quantity: 9 },
      { "Invoice No": "I1", "Product Code": "P2", Quantity: 6 },
    ]),
  });
  const result = await service(sets).detect(input);
  assert.equal(result.opportunities.find((item) => item.productCode === "P1")!.category, "Drinks");
  assert.equal(result.opportunities.find((item) => item.productCode === "P2")!.category, "Snacks");
});

test("returns null category when a matching product has no Category", async () => {
  const sets = base({ Products: ok([{ ProductCode: "P1", ProductName: "Product 1" }]) });
  const result = await service(sets).detect(input);
  assert.equal(result.opportunities[0]!.category, null);
});

test("keeps detecting an opportunity when no matching Products row exists", async () => {
  const sets = base({ Products: ok([{ ProductCode: "P2", ProductName: "Product 2", Category: "Snacks" }]) });
  const result = await service(sets).detect(input);
  assert.equal(result.status, "available");
  assert.equal(result.opportunities[0]!.productName, "P1");
  assert.equal(result.opportunities[0]!.category, null);
});

test("ignores an item whose invoice header is not confirmed", async () => {
  const sets = base({ Invoices: ok([{ ...confirmedHeader, "Invoice Status": "Cancelled" }]) });
  const result = await service(sets).detect(input);
  assert.equal(result.status, "no-baseline-sales");
  assert.deepEqual(result.opportunities, []);
});

test("accepts a posted invoice header", async () => {
  const sets = base({ Invoices: ok([{ ...confirmedHeader, "Invoice Status": " posted " }]) });
  const result = await service(sets).detect(input);
  assert.equal(result.status, "available");
  assert.equal(result.opportunities[0]!.baselineNetQuantity, 9);
});

test("aggregates multiple items from the same invoice", async () => {
  const sets = base({
    "Invoice Items": ok([
      { "Invoice No": "I1", "Product Code": "P1", Quantity: 4 },
      { "Invoice No": "I1", "Product Code": "P1", Quantity: 5 },
      { "Invoice No": "I1", "Product Code": "P2", Quantity: 2 },
    ]),
  });
  const result = await service(sets).detect(input);
  assert.equal(result.opportunities.length, 2);
  assert.equal(result.opportunities.find((item) => item.productCode === "P1")!.baselineNetQuantity, 9);
  assert.equal(result.opportunities.find((item) => item.productCode === "P2")!.baselineNetQuantity, 2);
});

test("ignores an invoice item without a matching header", async () => {
  const sets = base({ "Invoice Items": ok([{ "Invoice No": "missing", "Product Code": "P1", Quantity: 9 }]) });
  const result = await service(sets).detect(input);
  assert.equal(result.status, "no-baseline-sales");
  assert.deepEqual(result.opportunities, []);
});

test("joins return items to confirmed return headers and subtracts quantity", async () => {
  const sets = base({
    Returns: ok([{ "Return No": "R1", "Customer Code": "C1", "Return Date": "2026-04-11", Status: "Confirmed" }]),
    "Return Items": ok([{ "Return No": "R1", "Product Code": "P1", Quantity: 4 }]),
  });
  const result = await service(sets).detect(input);
  assert.equal(result.opportunities[0]!.baselineNetQuantity, 5);
  assert.equal(result.opportunities[0]!.suggestedQuantity, 2);
});

test("accepts approved returns and rejects pending returns", async () => {
  const returns = (status: string) => base({
    Returns: ok([{ "Return No": "R1", "Customer Code": "C1", "Return Date": "2026-04-11", Status: status }]),
    "Return Items": ok([{ "Return No": "R1", "Product Code": "P1", Quantity: 4 }]),
  });
  assert.equal((await service(returns("Approved")).detect(input)).opportunities[0]!.baselineNetQuantity, 5);
  assert.equal((await service(returns("Pending")).detect(input)).opportunities[0]!.baselineNetQuantity, 9);
});

test("produces the same shared-engine result for Smart Loading and Visit Copilot inputs", async () => {
  const smartLoadingResult = await service().detect(input);
  const visitCopilotResult = await service().detect({ ...input, customerNames: new Map([["C1", "Same Customer"]]) });
  assert.deepEqual(
    smartLoadingResult.opportunities.map(({ customerName: _customerName, ...item }) => item),
    visitCopilotResult.opportunities.map(({ customerName: _customerName, ...item }) => item),
  );
  assert.equal(smartLoadingResult.status, visitCopilotResult.status);
});

test("keeps the recent window exclusion unchanged", async () => {
  const sets = base({
    Invoices: ok([
      confirmedHeader,
      { ...confirmedHeader, "Invoice No": "I2", "Invoice Date": "2026-07-10" },
    ]),
    "Invoice Items": ok([
      { "Invoice No": "I1", "Product Code": "P1", Quantity: 9 },
      { "Invoice No": "I2", "Product Code": "P1", Quantity: 1 },
    ]),
  });
  assert.equal((await service(sets).detect(input)).opportunities.length, 0);
});

test("returns no-customers for an empty scope", async () => {
  assert.equal((await service().detect({ ...input, customerCodes: [] })).status, "no-customers");
});