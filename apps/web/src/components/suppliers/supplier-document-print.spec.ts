import assert from "node:assert/strict";
import test from "node:test";
import type { WmsReceipt, WmsReturnDocument } from "@field-sales-os/schemas";
import type { Text } from "../wms/shared";
import { buildSupplierPrintHtml, printSupplierDocument } from "./supplier-document-print";

const t: Text = key => key;
const receipt = {
  id: "r", reference: '<script>alert("ref")</script>', supplierName: "Water & <Supplier>", supplierReference: "INV-1", status: "DRAFT", version: 1, createdAt: "2026-10-27T10:00:00Z", events: [],
  lines: [{ id: "l", productId: "p", productName: "Water", productCode: "W12", baseUnit: "PIECE", piecesPerCarton: 12, trackBatches: true, trackExpiry: true, batchId: "b", batchCode: "LOT-1", expiryDate: "2027-10-27", productionDate: null, unit: "CARTON", conversionFactor: 12, expectedQuantity: "2.000000", acceptedQuantity: "1.000000", quarantinedQuantity: "1", rejectedQuantity: "0", rejectionReason: 'Check <img onerror="x">' }],
} as WmsReceipt;
const returned = { id: "rt", reference: "RET-1", kind: "SUPPLIER", status: "DRAFT", version: 1, sourceId: "r", sourceReference: "ORIGINAL-1", partyName: "Supplier", reason: "Damaged & held", handoverReference: null, events: [],
  lines: [{ id: "rl", sourceLineId: "l", productName: "Water", batchCode: "LOT-1", baseUnit: "PIECE", unit: "BASE", conversionFactor: 1, declaredQuantity: "3", actualQuantity: "2", quantityBase: "2", quality: "DAMAGED", fromQuarantine: false, discrepancyReason: "One missing", destination: null }],
} as WmsReturnDocument;

test("receipt print escapes all document and warehouse content and preserves recorded carton units", () => {
  const html = buildSupplierPrintHtml(receipt, "receipt", '<Warehouse "A">', t, "ar");
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;ref&quot;)&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Water &amp; &lt;Supplier&gt;"));
  assert.ok(html.includes("&lt;Warehouse &quot;A&quot;&gt;"));
  assert.ok(html.includes("wms.carton"));
  assert.ok(html.includes("2026-10-27"));
  assert.ok(html.includes("&lt;img onerror=&quot;x&quot;&gt;"));
  assert.ok(!html.includes("2.000000"));
});
test("return print uses original receipt, piece quantities, condition and reason without financial fields", () => {
  const html = buildSupplierPrintHtml(returned, "return", "Warehouse", t, "en");
  assert.ok(html.includes('dir="ltr"'));
  for (const expected of ["ORIGINAL-1", "wms.piece", "wms.damaged", "Damaged &amp; held", "One missing", "wms.actual_returned_quantity"]) assert.ok(html.includes(expected), expected);
  assert.ok(!html.includes("wms.supplier_reference"));
  assert.ok(!html.includes("wms.accepted"));
});
test("print reports blocked popups and prints only the escaped locally held document", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "window");
  let printed = 0, written = "";
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { open: () => null } });
    assert.equal(printSupplierDocument(receipt, "receipt", "Warehouse", t, "ar"), false);
    const popup = { opener: {}, document: { open() {}, write(html: string) { written = html; }, close() {} }, focus() {}, print() { printed++; }, close() {} };
    Object.defineProperty(globalThis, "window", { configurable: true, value: { open: () => popup } });
    assert.equal(printSupplierDocument(receipt, "receipt", "Warehouse", t, "ar"), true);
    assert.equal(printed, 1);
    assert.equal(popup.opener, null);
    assert.ok(written.includes("&lt;script&gt;"));
  } finally {
    if (old) Object.defineProperty(globalThis, "window", old); else Reflect.deleteProperty(globalThis, "window");
  }
});
