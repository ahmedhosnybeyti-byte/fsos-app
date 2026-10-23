import { BadRequestException,Injectable,NotFoundException } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { wmsPageSchema,type WmsReturnKind,type WmsReturnSource,type WmsReturnSummary,type WmsReturnDocument,type WmsReturnSourceLine } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PrismaService } from "../../common/prisma";
import { WmsService } from "./wms.service";
@Injectable()
export class WmsCoreService {
 constructor(private readonly prisma:PrismaService,private readonly access:WmsService){}
 private query(input:unknown){const r=wmsPageSchema.safeParse(input);if(!r.success)throw new BadRequestException("WMS_INVALID_INPUT");return r.data;}
 private kind(value:string):WmsReturnKind{if(value!=="SUPPLIER"&&value!=="REP")throw new BadRequestException("WMS_INVALID_INPUT");return value;}
 async sources(user:AuthenticatedUser,w:string,kind:string,input:unknown){const k=this.kind(kind),{page,search}=this.query(input),c=await this.access.authorizedRead(user,w);
  const rows=await this.prisma.$queryRaw<{id:string;reference:string;partyName:string}[]>(k==="SUPPLIER"?Prisma.sql`SELECT id,reference,supplier_name AS "partyName" FROM wms_receipts WHERE company_id=${c} AND warehouse_id=${w} AND status='POSTED' AND position(lower(${search}) in lower(reference))>0 ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ${(page-1)*20}`:
   Prisma.sql`SELECT d.id,d.reference,u.full_name AS "partyName" FROM wms_load_requests d JOIN users u ON u.company_id=${c} AND u.id=d.recipient_id WHERE d.company_id=${c} AND d.warehouse_id=${w} AND d.status='ACCEPTED' AND position(lower(${search}) in lower(d.reference))>0 ORDER BY d.created_at DESC,d.id DESC LIMIT 21 OFFSET ${(page-1)*20}`);
  return {items:rows.slice(0,20),page,hasMore:rows.length>20};
 }
 async source(user:AuthenticatedUser,w:string,kind:string,id:string):Promise<WmsReturnSource>{const k=this.kind(kind),c=await this.access.authorizedRead(user,w);
  const headers=await this.prisma.$queryRaw<Omit<WmsReturnSource,"lines">[]>(k==="SUPPLIER"?Prisma.sql`SELECT id,reference,supplier_name AS "partyName" FROM wms_receipts WHERE company_id=${c} AND warehouse_id=${w} AND id=${id} AND status='POSTED'`:
   Prisma.sql`SELECT d.id,d.reference,u.full_name AS "partyName" FROM wms_load_requests d JOIN users u ON u.company_id=${c} AND u.id=d.recipient_id WHERE d.company_id=${c} AND d.warehouse_id=${w} AND d.id=${id} AND d.status='ACCEPTED'`);
  if(!headers[0])throw new NotFoundException("WMS_RETURN_SOURCE_NOT_FOUND");
  const supplier=k==="SUPPLIER",table=supplier?Prisma.sql`wms_receipt_lines`:Prisma.sql`wms_allocations`,parent=supplier?Prisma.sql`l.receipt_id`:Prisma.sql`l.load_id`,sourceQty=supplier?Prisma.sql`l.accepted_base+l.quarantined_base`:Prisma.sql`l.dispatched_quantity`,ref=supplier?Prisma.sql`r.receipt_line_id`:Prisma.sql`r.allocation_id`,statuses=supplier?Prisma.sql`('DISPATCHED','COMPLETED')`:Prisma.sql`('POSTED')`;
  const lines=await this.prisma.$queryRaw<WmsReturnSourceLine[]>(Prisma.sql`SELECT l.id AS "sourceLineId",l.product_id AS "productId",p.name AS "productName",p.sensitive_handling AS "sensitiveHandling",p.handling_notes AS "handlingNotes",b.id AS "batchId",b.code AS "batchCode",to_char(b.expiry_date,'YYYY-MM-DD') AS "expiryDate",p.base_unit AS "baseUnit",p.pieces_per_carton AS "piecesPerCarton",(${sourceQty})::text AS "sourceBase",((${sourceQty})-COALESCE(done.q,0))::text AS "remainingBase",s.physical::text,s.available::text,s.quarantined::text,COALESCE(cust.quantity,0)::text AS custody
   FROM ${table} l JOIN wms_products p ON p.company_id=${c} AND p.id=l.product_id JOIN wms_batches b ON b.company_id=${c} AND b.id=l.batch_id JOIN wms_inventory_state s ON s.company_id=${c} AND s.warehouse_id=${w} AND s.batch_id=l.batch_id
   LEFT JOIN LATERAL(SELECT sum(r.quantity_base) q FROM wms_return_lines r JOIN wms_returns h ON h.company_id=${c} AND h.id=r.return_id WHERE r.company_id=${c} AND ${ref}=l.id AND h.status IN ${statuses}) done ON true
   LEFT JOIN wms_custody_positions cust ON cust.company_id=${c} AND cust.warehouse_id=${w} AND cust.batch_id=l.batch_id AND cust.recipient_id=(SELECT recipient_id FROM wms_load_requests WHERE company_id=${c} AND id=${id})
   WHERE l.company_id=${c} AND ${parent}=${id} AND (${sourceQty})>0 ORDER BY l.id LIMIT 100`);
  return {...headers[0],lines};
 }
 private fields=Prisma.sql`d.id,d.reference,d.kind,d.status,d.version,d.reason,COALESCE(d.receipt_id,d.load_id) AS "sourceId",COALESCE(r.reference,l.reference) AS "sourceReference",COALESCE(r.supplier_name,u.full_name) AS "partyName",d.handover_reference AS "handoverReference"`;
 async list(user:AuthenticatedUser,w:string,kind:string,input:unknown){const k=this.kind(kind),{page,search}=this.query(input),c=await this.access.authorizedRead(user,w);
  const rows=await this.prisma.$queryRaw<WmsReturnSummary[]>(Prisma.sql`SELECT ${this.fields} FROM wms_returns d LEFT JOIN wms_receipts r ON r.company_id=${c} AND r.id=d.receipt_id LEFT JOIN wms_load_requests l ON l.company_id=${c} AND l.id=d.load_id LEFT JOIN users u ON u.company_id=${c} AND u.id=l.recipient_id
   WHERE d.company_id=${c} AND d.warehouse_id=${w} AND d.kind=${k} AND position(lower(${search}) in lower(d.reference))>0 ORDER BY d.created_at DESC,d.id DESC LIMIT 21 OFFSET ${(page-1)*20}`);
  return {items:rows.slice(0,20),page,hasMore:rows.length>20};
 }
 async detail(user:AuthenticatedUser,w:string,id:string):Promise<WmsReturnDocument>{const c=await this.access.authorizedRead(user,w);
  const rows=await this.prisma.$queryRaw<WmsReturnSummary[]>(Prisma.sql`SELECT ${this.fields} FROM wms_returns d LEFT JOIN wms_receipts r ON r.company_id=${c} AND r.id=d.receipt_id LEFT JOIN wms_load_requests l ON l.company_id=${c} AND l.id=d.load_id LEFT JOIN users u ON u.company_id=${c} AND u.id=l.recipient_id WHERE d.company_id=${c} AND d.warehouse_id=${w} AND d.id=${id}`);
  if(!rows[0])throw new NotFoundException("WMS_DOCUMENT_NOT_FOUND");
  const lines=await this.prisma.$queryRaw<WmsReturnDocument["lines"]>(Prisma.sql`SELECT l.id,COALESCE(l.receipt_line_id,l.allocation_id) AS "sourceLineId",p.name AS "productName",p.sensitive_handling AS "sensitiveHandling",p.handling_notes AS "handlingNotes",b.code AS "batchCode",p.base_unit AS "baseUnit",p.pieces_per_carton AS "piecesPerCarton",l.input_unit AS unit,l.conversion_factor AS "conversionFactor",l.declared_quantity::text AS "declaredQuantity",l.actual_quantity::text AS "actualQuantity",l.quantity_base::text AS "quantityBase",l.quality,l.from_quarantine AS "fromQuarantine",l.discrepancy_reason AS "discrepancyReason",l.destination FROM wms_return_lines l JOIN wms_products p ON p.company_id=${c} AND p.id=l.product_id JOIN wms_batches b ON b.company_id=${c} AND b.id=l.batch_id WHERE l.company_id=${c} AND l.return_id=${id} ORDER BY l.id LIMIT 20`);
  const events=await this.prisma.$queryRaw<WmsReturnDocument["events"]>(Prisma.sql`SELECT e.id,e.operation,u.full_name AS "actorName",e.note,to_char(e.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM wms_operation_events e JOIN users u ON u.company_id=${c} AND u.id=e.actor_id WHERE e.company_id=${c} AND e.return_id=${id} ORDER BY e.created_at DESC,e.id DESC LIMIT 20`);
  return {...rows[0],lines,events};
 }
 async custody(user:AuthenticatedUser,w:string,input:unknown){const {page}=this.query(input),c=await this.access.authorizedRead(user,w);
  const rows=await this.prisma.$queryRaw<{recipientId:string;recipientName:string;productName:string;batchCode:string;baseUnit:string;quantity:string}[]>(Prisma.sql`SELECT s.recipient_id AS "recipientId",u.full_name AS "recipientName",p.name AS "productName",p.sensitive_handling AS "sensitiveHandling",p.handling_notes AS "handlingNotes",b.code AS "batchCode",p.base_unit AS "baseUnit",p.pieces_per_carton AS "piecesPerCarton",s.quantity::text FROM wms_custody_positions s JOIN users u ON u.company_id=${c} AND u.id=s.recipient_id JOIN wms_batches b ON b.company_id=${c} AND b.id=s.batch_id JOIN wms_products p ON p.company_id=${c} AND p.id=b.product_id WHERE s.company_id=${c} AND s.warehouse_id=${w} AND s.quantity>0 ORDER BY s.recipient_id,s.batch_id LIMIT 21 OFFSET ${(page-1)*20}`);
  return {items:rows.slice(0,20),page,hasMore:rows.length>20};
 }
}
