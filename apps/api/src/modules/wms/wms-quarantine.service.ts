import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@field-sales-os/database";
import { wmsPageSchema, wmsQuarantineHoldSchema, wmsQuarantineStepSchema, type WmsQuarantineCandidate, type WmsQuarantineDocument, type WmsQuarantineEvent } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PrismaService } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";
import { WmsService } from "./wms.service";
const fields = Prisma.sql`d.id,d.reference,d.reason,d.status,d.version,d.batch_id AS "batchId",p.code AS "productCode",p.name AS "productName",
 b.code AS "batchCode",p.base_unit AS "baseUnit",p.pieces_per_carton AS "piecesPerCarton",d.input_unit AS unit,d.conversion_factor AS "conversionFactor",
 round(d.held_base/d.conversion_factor,6)::text AS held,round(d.released_base/d.conversion_factor,6)::text AS released,
 round(d.written_off_base/d.conversion_factor,6)::text AS "writtenOff",round((d.held_base-d.released_base-d.written_off_base)/d.conversion_factor,6)::text AS remaining,
 round(s.physical/d.conversion_factor,6)::text AS physical,round(s.available/d.conversion_factor,6)::text AS available,
 round(s.quarantined/d.conversion_factor,6)::text AS quarantined,
 (p.is_active AND NOT b.is_quarantined AND NOT s.quality_blocked AND (b.expiry_date IS NULL OR b.expiry_date>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)) AS "releaseAllowed",
 to_char(d.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;
@Injectable()
export class WmsQuarantineService {
 constructor(private readonly prisma: PrismaService, private readonly access: WmsService, private readonly audit: AuditLogService) {}
 private page(input: unknown) { const r=wmsPageSchema.safeParse(input);if(!r.success)throw new BadRequestException("WMS_INVALID_INPUT");return r.data; }
 async candidates(user:AuthenticatedUser,w:string,input:unknown){const {page,search}=this.page(input),c=await this.access.authorizedRead(user,w);
  const rows=await this.prisma.$queryRaw<WmsQuarantineCandidate[]>(Prisma.sql`SELECT s.batch_id AS "batchId",p.code AS "productCode",p.name AS "productName",b.code AS "batchCode",p.base_unit AS "baseUnit",p.pieces_per_carton AS "piecesPerCarton",s.physical::text,s.available::text,s.quarantined::text,(s.physical-s.reserved-s.quarantined)::text AS holdable
   FROM wms_inventory_state s JOIN wms_batches b ON b.company_id=${c} AND b.id=s.batch_id JOIN wms_products p ON p.company_id=${c} AND p.id=b.product_id
   WHERE s.company_id=${c} AND s.warehouse_id=${w} AND s.physical>s.reserved+s.quarantined
   AND position(lower(${search}) in lower(p.code||' '||p.name||' '||b.code))>0 ORDER BY p.code,b.code,s.batch_id LIMIT 21 OFFSET ${(page-1)*20}`);
  return {items:rows.slice(0,20),page,hasMore:rows.length>20};
 }
 async list(user:AuthenticatedUser,w:string,input:unknown,id?:string){const {page,search}=this.page(input),c=await this.access.authorizedRead(user,w);
  const rows=await this.prisma.$queryRaw<WmsQuarantineDocument[]>(Prisma.sql`SELECT ${fields} FROM wms_quarantines d
   JOIN wms_batches b ON b.company_id=${c} AND b.id=d.batch_id JOIN wms_products p ON p.company_id=${c} AND p.id=b.product_id
   JOIN wms_inventory_state s ON s.company_id=${c} AND s.warehouse_id=${w} AND s.batch_id=d.batch_id
   WHERE d.company_id=${c} AND d.warehouse_id=${w} ${id?Prisma.sql`AND d.id=${id}`:Prisma.empty}
   AND position(lower(${search}) in lower(d.reference||' '||p.code||' '||p.name))>0
   ORDER BY d.created_at DESC,d.id DESC LIMIT 21 OFFSET ${(page-1)*20}`);
  return {items:rows.slice(0,20),page,hasMore:rows.length>20};
 }
 async detail(user:AuthenticatedUser,w:string,id:string){const rows=await this.list(user,w,{},id);if(!rows.items[0])throw new NotFoundException("WMS_DOCUMENT_NOT_FOUND");return rows.items[0];}
 async events(user:AuthenticatedUser,w:string,id:string,input:unknown){const {page}=this.page(input);await this.detail(user,w,id);const c=user.companyId!;
  const rows=await this.prisma.$queryRaw<WmsQuarantineEvent[]>(Prisma.sql`SELECT e.id,e.operation,round(e.quantity_base/d.conversion_factor,6)::text AS quantity,e.reason,u.full_name AS "actorName",to_char(e.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",m.id AS "movementId"
   FROM wms_quarantine_events e JOIN wms_quarantines d ON d.company_id=${c} AND d.warehouse_id=${w} AND d.id=e.quarantine_id
   JOIN users u ON u.company_id=${c} AND u.id=e.actor_id JOIN wms_movements m ON m.company_id=${c} AND m.quarantine_event_id=e.id
   WHERE e.company_id=${c} AND e.quarantine_id=${id} ORDER BY e.created_at DESC,e.id DESC LIMIT 21 OFFSET ${(page-1)*20}`);
  return {items:rows.slice(0,20),page,hasMore:rows.length>20};
 }
 async command(user:AuthenticatedUser,w:string,op:"HOLD"|"RELEASE"|"WRITE_OFF",input:unknown,id?:string){
  const parsed=(op==="HOLD"?wmsQuarantineHoldSchema:wmsQuarantineStepSchema).safeParse(input);if(!parsed.success)throw new BadRequestException("WMS_INVALID_INPUT");
  const {idempotencyKey,...data}=parsed.data,payload=op==="HOLD"?data:{...data,id};
  const permission=op==="HOLD"?"wms.quarantine.hold":op==="RELEASE"?"wms.quarantine.release":"wms.quarantine.writeoff";
  return this.access.authorizedTransaction(user,w,permission,async(tx,c)=>{
   const rows=await tx.$queryRaw<{result:{id:string;status:string;eventId:string}}[]>(Prisma.sql`SELECT wms_quarantine_execute(${c},${w},${op},${JSON.stringify(payload)}::jsonb,${user.userId},${idempotencyKey},${randomUUID()}) AS result`);
   const result=rows[0]!.result;await this.audit.record({companyId:c,userId:user.userId,action:`wms.quarantine.${op.toLowerCase()}`,entityType:"WmsQuarantine",entityId:result.id,eventKey:`wms-quarantine:${c}:${result.eventId}`},tx);return result;
  });
 }
}
