import type { WmsReceipt, WmsReturnDocument } from "@field-sales-os/schemas";
import type { Text } from "../wms/shared";
import { operationText } from "../wms/operation-labels";

type DocumentKind = "receipt" | "return";
function escapeHtml(value: unknown): string {
  return String(value ?? "—").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
function printUnit(unit: string, baseUnit: string, t: Text): string {
  return t(unit === "CARTON" ? "wms.carton" : baseUnit === "PIECE" ? "wms.piece" : baseUnit === "KG" ? "wms.kg" : "wms.litre");
}
function numeric(value: string): string { return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1"); }

/** Prints the already authorized, bounded document; performs no data access. */
export function buildSupplierPrintHtml(doc: WmsReceipt | WmsReturnDocument, kind: DocumentKind, warehouseName: string, t: Text, locale: string): string {
  const receipt = kind === "receipt" ? doc as WmsReceipt & { documentDate?: string } : null;
  const returned = kind === "return" ? doc as WmsReturnDocument : null;
  const title = t(kind === "receipt" ? "suppliers.receipts" : "suppliers.returns");
  const date = receipt ? receipt.documentDate ?? receipt.createdAt?.slice(0, 10)
    : returned?.events.find(event => event.operation === "supplier.create" || event.operation === "rep-return.create")?.createdAt.slice(0, 10);
  const field = (label: string, value: unknown) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  const headers = receipt ? [t("suppliers.print.product"), t("wms.lot_code"), t("wms.unit"), t("wms.expected_quantity"), t("wms.accepted"), t("wms.quarantined"), t("wms.rejected"), t("wms.quarantine_rejection_reason")]
    : [t("suppliers.print.product"), t("wms.lot_code"), t("wms.unit"), t("wms.declared_quantity"), t("wms.actual_returned_quantity"), t("wms.quality_condition"), t("wms.reason_for_any_declared_actual_difference")];
  const quality = (value: string) => t(value === "GOOD" ? "wms.good_eligibility_checked" : value === "DAMAGED" ? "wms.damaged" : value === "EXPIRED" ? "wms.expired" : "wms.quarantined");
  const cells = (values: unknown[]) => `<tr>${values.map(value => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`;
  const rows = receipt ? receipt.lines.map(line => cells([
    `${line.productName} · ${line.productCode}`, `${line.batchCode ?? "—"}${line.expiryDate ? " · " + line.expiryDate : ""}`,
    printUnit(line.unit, line.baseUnit, t), numeric(line.expectedQuantity), numeric(line.acceptedQuantity), numeric(line.quarantinedQuantity), numeric(line.rejectedQuantity), line.rejectionReason,
  ])).join("") : returned!.lines.map(line => cells([
    line.productName, line.batchCode, printUnit(line.unit, line.baseUnit, t), numeric(line.declaredQuantity), numeric(line.actualQuantity), quality(line.quality), line.discrepancyReason,
  ])).join("");
  return `<!DOCTYPE html><html lang="${locale === "ar" ? "ar" : "en"}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${escapeHtml(title)} · ${escapeHtml(doc.reference)}</title>
<style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#111827;margin:0;font-size:12px;line-height:1.6}h1{font-size:22px;margin:0 0 12px}dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 20px}dt{font-size:11px;color:#4b5563}dd{margin:0;font-weight:600;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #cbd5e1;padding:7px;text-align:start;vertical-align:top;overflow-wrap:anywhere}th{background:#f1f5f9;font-weight:600}thead{display:table-header-group}tr{break-inside:avoid}p{overflow-wrap:anywhere}.reason{margin-top:16px;white-space:pre-wrap}.count{font-weight:600;margin-top:16px}</style></head><body>
<h1>${escapeHtml(title)}</h1><dl>${field(t(receipt ? "wms.receipt_reference" : "wms.return_reference"), doc.reference)}${field(t("wms.supplier"), receipt?.supplierName ?? returned?.partyName)}${field(t("wms.warehouse_scope"), warehouseName)}${field(t("suppliers.documentDate"), date)}${field(t("suppliers.status"), operationText(doc.status, t))}${field(t(receipt ? "wms.supplier_reference" : "wms.source_document"), receipt?.supplierReference ?? returned?.sourceReference)}</dl>
<table><thead><tr>${headers.map(header => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
<p class="count">${escapeHtml(t("suppliers.selectedProducts"))}: ${doc.lines.length}</p>${returned ? `<p class="reason"><strong>${escapeHtml(t("wms.return_reason"))}: </strong>${escapeHtml(returned.reason)}</p>${returned.handoverReference ? `<p>${escapeHtml(t("wms.supplier_handover_reference"))}: ${escapeHtml(returned.handoverReference)}</p>` : ""}` : ""}</body></html>`;
}

export function printSupplierDocument(doc: WmsReceipt | WmsReturnDocument, kind: DocumentKind, warehouseName: string, t: Text, locale: string): boolean {
  if (typeof window === "undefined") return false;
  let popup: Window | null = null;
  try {
    popup = window.open("", "_blank");
    if (!popup) return false;
    popup.opener = null;
    popup.document.open();
    popup.document.write(buildSupplierPrintHtml(doc, kind, warehouseName, t, locale));
    popup.document.close();
    popup.focus();
    popup.print();
    return true;
  } catch {
    try { popup?.close(); } catch { /* Popup failure remains a local UI error. */ }
    return false;
  }
}
