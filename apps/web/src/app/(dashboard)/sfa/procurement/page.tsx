import {ProcurementScreen} from "@/components/procurement/procurement-screen";
export default async function Page({searchParams}:{searchParams:Promise<{warehouseId?:string;search?:string}>}){const params=await searchParams;return <ProcurementScreen initialWarehouse={params.warehouseId} initialSearch={params.search}/>;}
