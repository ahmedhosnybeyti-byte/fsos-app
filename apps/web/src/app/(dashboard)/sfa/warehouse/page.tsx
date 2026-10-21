import { WarehouseScreen } from "@/components/wms/warehouse-screen";
export default async function WarehousePage({searchParams}:{searchParams:Promise<{warehouseId?:string;receiptId?:string}>}) { const q=await searchParams; return <WarehouseScreen initialWarehouseId={q.warehouseId} initialReceiptId={q.receiptId}/>; }
