import { PhysicalCountScreen } from "@/components/wms/physical-count-screen";
export default async function Page({ searchParams }: { searchParams: Promise<{ warehouseCode?: string }> }) {
  const params = await searchParams;
  return <PhysicalCountScreen initialCode={typeof params.warehouseCode === "string" ? params.warehouseCode.slice(0, 80) : undefined} />;
}
