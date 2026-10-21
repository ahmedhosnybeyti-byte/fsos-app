import {ProcurementScreen} from "@/components/procurement/procurement-screen";
export default function Page({searchParams}:{searchParams:{warehouseId?:string;search?:string}}){return <ProcurementScreen initialWarehouse={searchParams.warehouseId} initialSearch={searchParams.search}/>;}
