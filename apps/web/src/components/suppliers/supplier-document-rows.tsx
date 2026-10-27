"use client";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Text } from "../wms/shared";

// This is a local DOM window, never a document/input/business limit.
export const SUPPLIER_DOCUMENT_VISIBLE_ROWS = 25;
export function supplierDocumentRowPage<T>(items: T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / SUPPLIER_DOCUMENT_VISIBLE_ROWS));
  const page = Math.max(1, Math.min(pages, requestedPage));
  const start = (page - 1) * SUPPLIER_DOCUMENT_VISIBLE_ROWS;
  return { page, pages, start, rows: items.slice(start, start + SUPPLIER_DOCUMENT_VISIBLE_ROWS) };
}
export function SupplierDocumentRows<T>({ items, page, onPageChange, renderItem, t }: {
  items: T[]; page: number; onPageChange: (page: number) => void; renderItem: (item: T, index: number) => ReactNode; t: Text;
}) {
  const view = supplierDocumentRowPage(items, page);
  return <div className="space-y-4">
    {view.rows.map((item, index) => renderItem(item, view.start + index))}
    {items.length > SUPPLIER_DOCUMENT_VISIBLE_ROWS && <nav className="space-y-2" aria-label={t("suppliers.selectedProducts")}>
      <p className="text-xs text-muted-foreground">{t("suppliers.documentRows", { from: view.start + 1, to: Math.min(items.length, view.start + SUPPLIER_DOCUMENT_VISIBLE_ROWS), total: items.length })}</p>
      <div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" size="sm" disabled={view.page === 1} onClick={() => onPageChange(view.page - 1)}>{t("wms.previous")}</Button>
        <span className="text-xs text-muted-foreground">{t("wms.page")} <bdi>{view.page} / {view.pages}</bdi></span>
        <Button type="button" variant="outline" size="sm" disabled={view.page === view.pages} onClick={() => onPageChange(view.page + 1)}>{t("wms.next")}</Button></div>
    </nav>}
  </div>;
}
