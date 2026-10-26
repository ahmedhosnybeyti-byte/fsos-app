import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dictionaries, type Locale, type TranslationKey } from "../../lib/i18n/dictionaries";

// Focused server rendering only: no browser, network or database.
const ts = require("typescript");
require.extensions[".tsx"] = (module: NodeModule, filename: string) => {
  (module as NodeModule & { _compile: (source: string, file: string) => void })._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename,
  );
};
const translations = require("../translation-provider");
const { WarehouseScreen } = require("./warehouse-screen");

function render(locale: Locale, role = "WAREHOUSE_KEEPER", receipt = false, registry = false) {
  const original = translations.useTranslation;
  translations.useTranslation = () => ({ locale, t: (key: TranslationKey) => dictionaries[locale][key] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const warehouse = "warehouse";
  client.setQueryData(["auth", "me"], {
    id: "user", companyId: "company", role: { code: role },
    permissions: ["sfa.access", "wms.read", "wms.receiving.review", ...(registry ? ["company.manage"] : [])],
    featureAccess: { "warehouse-core": "ENABLED", "sfa-setup": registry ? "ENABLED" : "DISABLED" },
  });
  client.setQueryData(["sfa-mode", "company"], { operatingMode: "FULL_ERP" });
  const page = { items: [], page: 1, hasMore: false };
  client.setQueryData(["wms", "company", "warehouses", 1, ""], page);
  const totals = { physical: "24", available: "20", reserved: "4", quarantined: "0", expired: "0", inTransit: "0" };
  client.setQueryData(["wms", "company", warehouse, "summary", 30], {
    units: [{ baseUnit: "PIECE", ...totals }], cartons: totals,
    stockedProducts: 7, nearExpiryBatches: 2, expiredBatches: 0, asOf: "2026-10-26T00:00:00Z",
  });
  for (const key of [
    ["products", 1, ""], ["batches", 1, undefined, false, 30], ["ledger", 1],
    ["coverage", 1, ""], ["quarantines", 1], ["returns", "SUPPLIER", 1, ""],
    ["custody", 1], ["documents", "receipts", 1, ""],
  ]) client.setQueryData(["wms", "company", warehouse, ...key], page);
  if (receipt) client.setQueryData(["wms", "company", warehouse, "receipt", "receipt"], {
    id: "receipt", reference: "RECEIPT-DEEP-LINK", supplierName: "Supplier", supplierReference: "SUP-REF",
    status: "POSTED", version: 1, lines: [], events: [],
  });
  try {
    return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(WarehouseScreen, {
      initialWarehouseId: warehouse, ...(receipt ? { initialReceiptId: "receipt" } : {}),
    })));
  } finally { client.clear(); translations.useTranslation = original; }
}

for (const locale of ["ar", "en"] as const) {
  test(`warehouse navigation and home use existing translations and actual balances (${locale})`, () => {
    const html = render(locale).replaceAll("&amp;", "&");
    assert.ok(html.includes(`dir="${locale === "ar" ? "rtl" : "ltr"}"`));
    const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? "";
    for (const id of ["home", "receiving", "loading", "transfers", "inventory", "ledger"] as const) {
      assert.ok(nav.includes(dictionaries[locale][`warehouseLayout.${id}`]));
    }
    assert.match(nav, /aria-current="page"/);
    assert.ok(html.includes(dictionaries[locale]["warehouseLayout.keeperHint"]));
    assert.match(html, />20</);
    assert.match(html, />7</);
    assert.doesNotMatch(html, /warehouseLayout\.|1,248|125,680|2,450,000|\/sfa\/setup/);
    assert.ok(html.includes(dictionaries[locale]["warehouseLayout.transfersPending"]));
  });

  test(`receipt deep links retain the receiving destination and original document (${locale})`, () => {
    const html = render(locale, "MANAGER", true).replaceAll("&amp;", "&");
    const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.ok(new RegExp(`aria-current="page"[^>]*>[\\s\\S]*?${dictionaries[locale]["warehouseLayout.receiving"]}</button>`).test(nav));
    assert.match(html, /RECEIPT-DEEP-LINK/);
    assert.ok(html.includes(dictionaries[locale]["warehouseLayout.managerHint"]));
    assert.doesNotMatch(html, /href="\/sfa\/setup"/);
  });
}

test("warehouse registry link follows the server's existing company-admin boundary", () => {
  assert.doesNotMatch(render("ar", "MANAGER", false, true), /href="\/sfa\/setup"/);
  assert.match(render("ar", "COMPANY_ADMIN", false, true), /href="\/sfa\/setup"/);
});
