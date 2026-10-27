import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WmsReceipt, WmsReturnSourceLine } from "@field-sales-os/schemas";
import type { Text } from "../wms/shared";

const ts = require("typescript");
require.extensions[".tsx"] = (module: NodeModule, filename: string) => (module as any)._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const ownSchemas = { ...require("../../../../../packages/schemas/src/wms-operations.schemas"), ...require("../../../../../packages/schemas/src/wms-core.schemas") };
const react = require("react"), jsx = require("react/jsx-runtime"), moduleLoader = require("node:module");
const query = require("@tanstack/react-query"), originalLoad = moduleLoader._load;
// Keep real query context/rendering; only intercept the mutation boundary so a
// real editor submit can be inspected without any network or stock command.
moduleLoader._load = function (this: any, request: string, parent: unknown, ...args: unknown[]) {
  const result = originalLoad.call(this, request, parent, ...args);
  if (request === "@field-sales-os/schemas") return { ...result, ...ownSchemas };
  if (request === "@tanstack/react-query") return { ...query, useMutation: (options: any) => ({ mutate: () => options.mutationFn(), isPending: false, isError: false }) };
  return result;
};
let editors: any;
try { editors = require("./supplier-editors"); } finally { moduleLoader._load = originalLoad; }
const { SupplierDocumentRows, supplierDocumentRowPage, SUPPLIER_DOCUMENT_VISIBLE_ROWS } = require("./supplier-document-rows");
const translations = require(resolve("apps/web/src/components/translation-provider"));
const buttons = require(resolve("apps/web/src/components/ui/button"));
const { wmsOperationsApi } = require(resolve("apps/web/src/lib/api/wms-operations"));
const t: Text = (key, params) => key + (params ? " " + JSON.stringify(params) : "");
const baseLine = { productId: "p", productName: "Water", productCode: "W", baseUnit: "PIECE", trackBatches: false, trackExpiry: false, piecesPerCarton: 12, batchId: null, batchCode: null, productionDate: null, expiryDate: null, unit: "BASE", conversionFactor: 1, expectedQuantity: "27", acceptedQuantity: "27", quarantinedQuantity: "0", rejectedQuantity: "0", rejectionReason: "" };
function receipt(count: number): WmsReceipt {
  return { id: "r", reference: "R", supplierName: "Supplier", supplierReference: "INV", createdAt: "2026-10-27T00:00:00Z", status: "DRAFT", version: 1, events: [], lines: Array.from({ length: count }, (_, i) => ({ ...baseLine, id: `line-${i}`, productId: `product-${i}`, productName: `PRODUCT-${i}`, productCode: `P-${i}` })) } as WmsReceipt;
}
function text(node: any): string {
  return typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
}
function renderReceipt(count: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false, staleTime: Infinity, gcTime: Infinity } } });
  client.setQueryData(["auth", "me"], { id: "keeper", role: { code: "WAREHOUSE_KEEPER" }, permissions: ["sfa.access", "wms.read", "wms.receiving.create"] });
  client.setQueryData(["wms", "c", "w", "supplier-master", 1, ""], { items: [], page: 1, hasMore: false });
  client.setQueryData(["wms", "c", "w", "supplier-products", 1, ""], { items: [{ ...baseLine, id: "new-product", name: "NEW-CANDIDATE", code: "NEW", isActive: true }], page: 1, hasMore: false });
  const originals = { state: react.useState, jsxs: jsx.jsxs, Button: buttons.Button, useTranslation: translations.useTranslation, command: wmsOperationsApi.command };
  let submit: ((event: any) => void) | undefined, add: (() => void) | undefined, payload: any, appended: any[] | undefined;
  const selectedPages: number[] = [];
  react.useState = (initial: any) => {
    const [value, setter] = originals.state(initial);
    if (Array.isArray(value) && value.length === count && value[0]?.product) return [value, (next: any) => { appended = typeof next === "function" ? next(value) : next; }];
    return [value, (next: any) => { if (typeof next === "number") selectedPages.push(next); setter(next); }];
  };
  jsx.jsxs = (type: any, props: any, ...args: any[]) => { if (type === "form") submit = props.onSubmit; return originals.jsxs(type, props, ...args); };
  buttons.Button = (props: any) => { if (text(props.children).includes("NEW-CANDIDATE")) { assert.equal(props.disabled, false); add = props.onClick; } return createElement("button", { type: props.type, disabled: props.disabled }, props.children); };
  translations.useTranslation = () => ({ locale: "en", t });
  wmsOperationsApi.command = (_warehouse: string, _operation: string, body: unknown) => { payload = body; return Promise.resolve({ id: "r" }); };
  try {
    const start = performance.now();
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(editors.SupplierReceiptEditor, { receipt: receipt(count), warehouse: "w", company: "c", t, onSaved() {}, onClose() {} })));
    const renderMs = performance.now() - start;
    assert.ok(submit); submit!({ preventDefault() {} });
    assert.ok(add); add!();
    return { html, renderMs, payload, appended, selectedPages };
  } finally {
    react.useState = originals.state; jsx.jsxs = originals.jsxs; buttons.Button = originals.Button; translations.useTranslation = originals.useTranslation; wmsOperationsApi.command = originals.command; client.clear();
  }
}

for (const count of [21, 83, 1000]) {
  test(`receipt editor keeps all ${count} lines in summary/submit and admits the next product with bounded DOM`, context => {
    const result = renderReceipt(count);
    assert.equal((result.html.match(/<article\b/g) ?? []).length, Math.min(count, SUPPLIER_DOCUMENT_VISIBLE_ROWS));
    assert.ok(result.html.includes(`(${count})`));
    assert.ok(result.html.includes(String(count * 27)), "summary covers complete document");
    assert.equal(result.payload.lines.length, count);
    assert.equal(result.payload.lines.at(-1).productId, `product-${count - 1}`);
    assert.equal(result.appended!.length, count + 1);
    assert.equal(result.appended!.at(-1).product.id, "new-product");
    assert.ok(result.selectedPages.includes(Math.floor(count / SUPPLIER_DOCUMENT_VISIBLE_ROWS) + 1), "new line becomes visible");
    context.diagnostic(`synthetic lines=${count}; renderedArticles=${Math.min(count, SUPPLIER_DOCUMENT_VISIBLE_ROWS)}; SSRms=${result.renderMs.toFixed(2)}; htmlBytes=${Buffer.byteLength(result.html)}`);
  });
}
test("document row windows expose every row and the final partial page without mutating/trimming saved state", () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
  const seen: number[] = [];
  for (let page = 1; page <= 40; page++) seen.push(...supplierDocumentRowPage(items, page).rows.map((row: { id: number }) => row.id));
  assert.deepEqual(seen, items.map(row => row.id));
  assert.equal(items.length, 1000);
  const html = renderToStaticMarkup(createElement(SupplierDocumentRows, { items, page: 40, onPageChange() {}, t, renderItem: (row: { id: number }) => createElement("p", { key: row.id }, `ROW-${row.id}`) }));
  assert.ok(html.includes("ROW-999")); assert.ok(!html.includes("ROW-974"));
  assert.equal(supplierDocumentRowPage(items.slice(0, 83), 99).page, 4);
});
test("supplier source picker admits a new line after 1000 selections and still blocks duplicates and legacy REP overflow", () => {
  const sourceLine = (id: string): WmsReturnSourceLine => ({ sourceLineId: id, productId: id, productName: id, batchId: id, batchCode: id, expiryDate: null, baseUnit: "PIECE", piecesPerCarton: 12, sourceBase: "27", remainingBase: "27", physical: "27", available: "27", quarantined: "0", custody: "0" });
  const lines = Array.from({ length: 1000 }, (_, i) => ({ source: sourceLine(`selected-${i}`) }));
  for (const [kind, id, disabled] of [["SUPPLIER", "new-source", false], ["SUPPLIER", "selected-999", true], ["REP", "new-source", true]] as const) {
    const html = renderToStaticMarkup(createElement(editors.SupplierReturnSourceLines, { source: { id: "r", reference: "R", partyName: "Supplier", lines: [sourceLine(id)] }, kind, lines, add() {}, t }));
    assert.equal(/<button[^>]* disabled=""/.test(html), disabled);
  }
});
