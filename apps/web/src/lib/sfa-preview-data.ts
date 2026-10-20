import type { CompanySetupChecklist, SfaWarehousePage } from "@field-sales-os/schemas";

// Fixed synthetic examples only. Never seeded into a company or database.
export const previewChecklist: CompanySetupChecklist = { items: [
  { key: "products", status: "NOT_AVAILABLE" },
  { key: "customers", status: "NOT_AVAILABLE" },
  { key: "prices", status: "NOT_AVAILABLE" },
  { key: "employees", status: "PRESENT" },
  { key: "warehouses", status: "PRESENT" },
  { key: "openingBalances", status: "NOT_AVAILABLE" },
] };
export function previewWarehouses(page: number, search: string): SfaWarehousePage {
  const rows = [
    { id: "preview-main", code: "DEMO-MAIN", name: "المستودع التجريبي الرئيسي", address: "عنوان تجريبي — لا يمثل شركة حقيقية", isActive: true },
    { id: "preview-secondary", code: "DEMO-SECONDARY", name: "المستودع التجريبي الفرعي", address: null, isActive: false },
  ];
  const query = search.toLocaleLowerCase();
  return { items: page === 1 ? rows.filter((row) => `${row.code} ${row.name}`.toLocaleLowerCase().includes(query)) : [], page, pageSize: 20, hasMore: false };
}
