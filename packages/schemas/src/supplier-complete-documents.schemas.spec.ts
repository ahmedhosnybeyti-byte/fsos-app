import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { wmsReceiptInputSchema, wmsReceiptEditSchema, wmsInputSchema } from "./wms-operations.schemas";
import { wmsReturnInputSchema, wmsSupplierReturnInputSchema } from "./wms-core.schemas";

for (const count of [21, 83, 1000]) {
  test(`supplier receipt/edit and return admit every one of ${count} lines without trimming`, () => {
    const receiptLines = Array.from({ length: count }, (_, i) => ({ productId: `product-${i}`, batchCode: `LOT-${i}`, unit: "BASE" as const, expectedQuantity: "27", acceptedQuantity: "24", quarantinedQuantity: "3", rejectedQuantity: "0", rejectionReason: "Inspection" }));
    const receipt = { reference: "RECEIPT", supplierName: "Test supplier", supplierReference: "INV-1", idempotencyKey: randomUUID(), lines: receiptLines };
    for (const parsed of [wmsReceiptInputSchema.parse(receipt), wmsReceiptEditSchema.parse({ ...receipt, id: "receipt", version: 1 })]) {
      assert.equal(parsed.lines.length, count);
      assert.deepEqual(parsed.lines.map(line => line.productId), receiptLines.map(line => line.productId));
      assert.equal(parsed.lines.at(-1)!.acceptedQuantity, "24");
    }
    assert.equal(wmsReceiptInputSchema.safeParse({ ...receipt, lines: receiptLines.map((line, i) => i === count - 1 ? { ...line, acceptedQuantity: "-1" } : line) }).success, false);
    const lines = Array.from({ length: count }, (_, i) => ({ sourceLineId: `receipt-line-${i}`, declaredQuantity: "3", actualQuantity: "3", unit: "BASE" as const, quality: "GOOD" as const, fromQuarantine: false, discrepancyReason: "" }));
    const returned = { reference: "RETURN", sourceId: "receipt", note: "Test return", idempotencyKey: randomUUID(), lines };
    assert.deepEqual(wmsSupplierReturnInputSchema.parse(returned).lines, lines);
    assert.deepEqual((wmsInputSchema("supplier.create").parse(returned) as { lines: unknown[] }).lines, lines);
    assert.equal(wmsSupplierReturnInputSchema.safeParse({ ...returned, lines: lines.map((line, i) => i === count - 1 ? { ...line, actualQuantity: "-1" } : line) }).success, false);
    assert.equal(wmsReturnInputSchema.safeParse(returned).success, false, "existing REP contract remains bounded");
    assert.equal(wmsInputSchema("rep-return.create").safeParse(returned).success, false);
  });
}
test("supplier complete documents retain nonempty, tenant, quantity and unchanged REP admission", () => {
  const base = { reference: "RETURN", sourceId: "receipt", note: "Test return", idempotencyKey: randomUUID() };
  const line = { sourceLineId: "l", declaredQuantity: "1", actualQuantity: "1", unit: "BASE", quality: "GOOD" };
  assert.equal(wmsSupplierReturnInputSchema.safeParse({ ...base, lines: [] }).success, false);
  assert.equal(wmsSupplierReturnInputSchema.safeParse({ ...base, lines: [line], companyId: "other" }).success, false);
  assert.equal(wmsReturnInputSchema.safeParse({ ...base, lines: Array.from({ length: 20 }, () => line) }).success, true);
  assert.equal(wmsReturnInputSchema.safeParse({ ...base, lines: Array.from({ length: 21 }, () => line) }).success, false);
});
