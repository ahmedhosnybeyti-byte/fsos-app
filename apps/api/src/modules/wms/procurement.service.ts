import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {Prisma} from "@field-sales-os/database";
import {procurementCommandSchema,procurementPermissions,wmsPageSchema,type ProcurementDocument,type ProcurementDetail,type ProcurementSummary,type ProcurementSupplier} from "@field-sales-os/schemas";
import {PrismaService,type PrismaTx} from "../../common/prisma";
import type {AuthenticatedUser} from "../../common/types/authenticated-user";
import {WmsService} from "./wms.service";
import {AuditLogService} from "../audit-log/audit-log.service";
const fields=Prisma.sql`d.id,d.reference,d.document_status AS status,d.document_version AS version,d.creator_id AS "creatorId",d.reason,d.order_id AS "orderId",d.supplier_name AS "supplierName"`;
@Injectable()
export class ProcurementService {
 constructor(private readonly prisma:PrismaService,private readonly access:WmsService,private readonly audit:AuditLogService){}
 private async scope(tx:PrismaTx,u:AuthenticatedUser,lock=false){
  if(!u.companyId||!["COMPANY_ADMIN","MANAGER","SUPERVISOR","SALES_REP","PROCUREMENT"].includes(u.roleCode)||!u.permissions?.includes("procurement.read"))throw new ForbiddenException("Procurement permission required");
  const rows=await tx.$queryRaw(Prisma.sql`SELECT s.company_id FROM company_operating_settings s JOIN users u ON u.company_id=s.company_id AND u.id=${u.userId} AND u.status='ACTIVE'
   WHERE s.company_id=${u.companyId} AND s.operating_mode='FULL_ERP' ${lock?Prisma.sql`FOR SHARE OF s,u`:Prisma.empty}`);
  if(!(rows as unknown[]).length)throw new ForbiddenException("Full ERP required");
 }
 async command(u:AuthenticatedUser,w:string,input:unknown){
  const parsed=procurementCommandSchema.safeParse(input);if(!parsed.success)throw new BadRequestException("WMS_INVALID_INPUT");const b=parsed.data;
  return this.access.authorizedTransaction(u,w,procurementPermissions[b.operation],async(tx,c)=>{
   await this.scope(tx,u,true);
   const rows=await tx.$queryRaw<{result:{id:string;requestId:string;eventId:string}}[]>(Prisma.sql`SELECT procurement_execute(${c},${w},${u.userId},${JSON.stringify(b)}::jsonb,${randomUUID()}) AS result`);
   const result=rows[0]!.result;
   await this.audit.record({companyId:c,userId:u.userId,action:`procurement.${b.operation.toLowerCase()}`,entityType:"ProcurementRequest",entityId:result.requestId,eventKey:`procurement:${c}:${result.eventId}`},tx);
   return result;
  });
 }
 private async read(u:AuthenticatedUser,w:string){await this.scope(this.prisma,u);return this.access.authorizedRead(u,w);}
 async summary(u:AuthenticatedUser,w:string):Promise<ProcurementSummary>{
  const c=await this.read(u,w);
  const rows=await this.prisma.$queryRaw<ProcurementSummary[]>(Prisma.sql`WITH requests AS MATERIALIZED (
   SELECT r.id,r.status,o.id AS order_id,o.cancelled FROM procurement_requests r LEFT JOIN procurement_orders o ON o.company_id=${c} AND o.request_id=r.id
   WHERE r.company_id=${c} AND r.warehouse_id=${w}
  ), progress AS MATERIALIZED (
   SELECT p.request_id,p.received,p.remaining,CASE WHEN p.unit='CARTON' THEN 'CARTON' ELSE m.base_unit END AS unit
   FROM requests r JOIN procurement_progress p ON p.company_id=${c} AND p.request_id=r.id
   JOIN wms_products m ON m.company_id=${c} AND m.id=p.product_id
  ), scoped AS MATERIALIZED (
   SELECT r.id,CASE WHEN r.cancelled THEN 'CANCELLED' WHEN r.order_id IS NULL THEN r.status
    WHEN bool_and(p.remaining=0) THEN 'COMPLETED' WHEN bool_or(p.received>0) THEN 'PARTIAL' ELSE 'OPEN' END AS document_status
   FROM requests r JOIN progress p ON p.request_id=r.id GROUP BY r.id,r.cancelled,r.order_id,r.status
  ), totals AS(SELECT p.unit,sum(p.remaining)::text AS quantity FROM scoped s JOIN progress p ON p.request_id=s.id
   WHERE s.document_status IN('OPEN','PARTIAL') GROUP BY p.unit)
  SELECT count(*) FILTER(WHERE document_status='PENDING')::int AS pending,count(*) FILTER(WHERE document_status='OPEN')::int AS open,
   count(*) FILTER(WHERE document_status='PARTIAL')::int AS partial,COALESCE((SELECT jsonb_agg(totals) FROM totals),'[]') AS remaining FROM scoped`);
  return rows[0]!;
 }
 async list(u:AuthenticatedUser,w:string,input:unknown){
  const parsed=wmsPageSchema.extend({kind:z.enum(["all","requests","orders"]).default("all")}).safeParse(input);if(!parsed.success)throw new BadRequestException("WMS_INVALID_INPUT");const {page,search,kind}=parsed.data,c=await this.read(u,w);
  const rows=await this.prisma.$queryRaw<ProcurementDocument[]>(Prisma.sql`SELECT ${fields} FROM procurement_documents d WHERE d.company_id=${c} AND d.warehouse_id=${w}
   AND (${kind} <> 'orders' OR d.order_id IS NOT NULL) AND position(lower(${search}) in lower(d.reference))>0 ORDER BY d.created_at DESC,d.id DESC LIMIT 21 OFFSET ${(page-1)*20}`);
  return {items:rows.slice(0,20),page,hasMore:rows.length>20};
 }
 async detail(u:AuthenticatedUser,w:string,id:string):Promise<ProcurementDetail>{
  const c=await this.read(u,w);
  const docs=await this.prisma.$queryRaw<ProcurementDocument[]>(Prisma.sql`SELECT ${fields} FROM procurement_documents d WHERE d.company_id=${c} AND d.warehouse_id=${w} AND d.id=${id}`);
  if(!docs[0])throw new NotFoundException("WMS_PROCUREMENT_NOT_FOUND");
  const lines=await this.prisma.$queryRaw<ProcurementDetail["lines"]>(Prisma.sql`SELECT p.product_id AS "productId",m.code AS "productCode",m.name AS "productName",p.quantity::text,p.unit,p.factor,m.pieces_per_carton AS "piecesPerCarton",m.base_unit AS "baseUnit",m.track_batches AS "trackBatches",m.track_expiry AS "trackExpiry",p.price::text,p.received::numeric(24,6)::text,p.remaining::numeric(24,6)::text
   FROM procurement_progress p JOIN wms_products m ON m.company_id=${c} AND m.id=p.product_id WHERE p.company_id=${c} AND p.request_id=${id} ORDER BY m.code LIMIT 20`);
  const receipts=await this.prisma.$queryRaw<ProcurementDetail["receipts"]>(Prisma.sql`SELECT d.id,d.reference,d.status FROM procurement_orders o JOIN procurement_receipts pr ON pr.company_id=${c} AND pr.order_id=o.id
   JOIN wms_receipts d ON d.company_id=${c} AND d.id=pr.receipt_id WHERE o.company_id=${c} AND o.request_id=${id} ORDER BY d.created_at DESC,d.id LIMIT 100`);
  const events=await this.prisma.$queryRaw<ProcurementDetail["events"]>(Prisma.sql`SELECT e.operation,e.reason,u.full_name AS "actorName" FROM procurement_events e JOIN users u ON u.company_id=${c} AND u.id=e.actor_id
   WHERE e.company_id=${c} AND e.request_id=${id} ORDER BY e.created_at DESC,e.id DESC LIMIT 20`);
  return {...docs[0],lines,receipts,events};
 }
 async suppliers(u:AuthenticatedUser,w:string,input:unknown){
  const p=wmsPageSchema.safeParse(input);if(!p.success)throw new BadRequestException("WMS_INVALID_INPUT");const {page,search}=p.data,c=await this.read(u,w);
  const rows=await this.prisma.$queryRaw<ProcurementSupplier[]>(Prisma.sql`SELECT id,code,name FROM accounting_parties WHERE company_id=${c} AND kind='SUPPLIER'
   AND (position(lower(${search}) in lower(name))>0 OR position(lower(${search}) in lower(code))>0) ORDER BY code LIMIT 21 OFFSET ${(page-1)*20}`);
  return {items:rows.slice(0,20),page,hasMore:rows.length>20};
 }
}
