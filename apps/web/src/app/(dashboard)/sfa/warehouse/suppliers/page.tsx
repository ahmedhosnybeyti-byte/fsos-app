import { SupplierScreen } from "@/components/suppliers/supplier-screen";

export default async function SupplierPage({ searchParams }: {
  searchParams: Promise<{ warehouseId?: string }>;
}) {
  const query = await searchParams;
  return <SupplierScreen initialWarehouseId={query.warehouseId} />;
}
