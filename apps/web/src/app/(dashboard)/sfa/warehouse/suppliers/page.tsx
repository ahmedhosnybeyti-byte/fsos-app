import { SupplierScreen } from "@/components/suppliers/supplier-screen";

export default async function SupplierPage({ searchParams }: {
  searchParams: Promise<{ warehouseId?: string; tab?:string }>;
}) {
  const query = await searchParams;
  return <SupplierScreen initialWarehouseId={query.warehouseId} initialTab={query.tab === "returns" ? "returns" : "receipts"} />;
}
