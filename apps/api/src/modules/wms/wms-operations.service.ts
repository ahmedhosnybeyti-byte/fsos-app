import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@field-sales-os/database";
import { WMS_OPERATION_PERMISSIONS,wmsCommandSchema,wmsInputSchema,wmsPageSchema,wmsFefoSchema,wmsPolicySchema,type WmsDocumentSummary,type WmsReceipt,type WmsLoad,type WmsWorkflowEvent,type WmsFefoResult,type WmsCustomerPolicy } from "@field-sales-os/schemas";
import type { ZodType,ZodTypeDef } from "zod";
import { PrismaService } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";
import { WmsService } from "./wms.service";
function parse<T>(schema:ZodType<T,ZodTypeDef,unknown>,input:unknown):T {const r=schema.safeParse(input);if(!r.success)throw new BadRequestException({message:"WMS_INVALID_INPUT",errors:r.error.flatten()});return r.data;}
const time=(column:Prisma.Sql)=>Prisma.sql`to_char(${column},'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const pageSize=20;

@Injectable()
export class WmsOperationsService {
  constructor(private readonly prisma:PrismaService,private readonly access:WmsService,private readonly audit:AuditLogService){}
  async command(user:AuthenticatedUser,warehouse:string,input:unknown) {
    const {operation,input:raw}=parse(wmsCommandSchema,input);
    // Union schema is validated by selected operation; no client permission or tenant flags.
    const data=wmsInputSchema(operation).safeParse(raw);
    if(!data.success)throw new BadRequestException({message:"WMS_INVALID_INPUT",errors:data.error.flatten()});
    const {idempotencyKey,...payload}=data.data;
    return this.access.authorizedTransaction(user,warehouse,WMS_OPERATION_PERMISSIONS[operation],async(tx,company)=>{
      const rows=await tx.$queryRaw<{result:{id:string;status:string;eventId:string}}[]>(Prisma.sql`SELECT wms_core_execute(${company},${warehouse},${operation},${JSON.stringify(payload)}::jsonb,${user.userId},${idempotencyKey},${randomUUID()}) AS result`);
      const result=rows[0]!.result;
      const entityType=operation.startsWith("receipt.")?"WmsReceipt":operation.startsWith("supplier.")||operation.startsWith("rep-return.")?"WmsReturn":operation.startsWith("quality.")?"WmsBatchQuality":operation==="proposal.create"?"WmsLoadingProposal":"WmsLoadRequest";
      await this.audit.record({companyId:company,userId:user.userId,action:`wms.${operation}`,entityType,entityId:result.id,eventKey:`wms:${company}:${result.eventId}`},tx);
      return result;
    });
  }
  async list(user:AuthenticatedUser,warehouse:string,kind:"receipt"|"load",input:unknown) {
    const {page,search}=parse(wmsPageSchema,input);const c=await this.access.authorizedRead(user,warehouse);
    const fields=kind==="receipt"?Prisma.sql`d.supplier_name AS "supplierName",EXISTS(SELECT 1 FROM wms_receipt_lines l WHERE l.company_id=${c} AND l.receipt_id=d.id AND l.accepted_quantity+l.quarantined_quantity+l.rejected_quantity<l.expected_quantity) AS partial`
      :Prisma.sql`d.recipient_id AS "recipientId",(SELECT full_name FROM users WHERE company_id=${c} AND id=d.recipient_id) AS "recipientName",d.source`;
    const table=kind==="receipt"?Prisma.sql`wms_receipts`:Prisma.sql`wms_load_requests`;
    const rows=await this.prisma.$queryRaw<WmsDocumentSummary[]>(Prisma.sql`SELECT d.id,d.reference,d.status,d.version,${time(Prisma.sql`d.created_at`)} AS "createdAt",${fields}
      FROM ${table} d WHERE d.company_id=${c} AND d.warehouse_id=${warehouse} AND position(lower(${search}) in lower(d.reference))>0
      ORDER BY d.created_at DESC,d.id DESC LIMIT ${pageSize+1} OFFSET ${(page-1)*pageSize}`);
    return {items:rows.slice(0,pageSize),page,hasMore:rows.length>pageSize};
  }
  private async events(company:string,id:string,kind:"receipt"|"load") {
    const field=kind==="receipt"?Prisma.sql`e.receipt_id`:Prisma.sql`e.load_id`;
    return this.prisma.$queryRaw<WmsWorkflowEvent[]>(Prisma.sql`SELECT e.id,e.operation,e.from_status AS "fromStatus",e.to_status AS "toStatus",e.note,
      u.full_name AS "actorName",${time(Prisma.sql`e.created_at`)} AS "createdAt" FROM wms_operation_events e JOIN users u ON u.company_id=${company} AND u.id=e.actor_id
      WHERE e.company_id=${company} AND ${field}=${id} ORDER BY e.created_at DESC,e.id DESC LIMIT 20`);
  }
  async receipt(user:AuthenticatedUser,warehouse:string,id:string):Promise<WmsReceipt> {
    const c=await this.access.authorizedRead(user,warehouse);
    const rows=await this.prisma.$queryRaw<Omit<WmsReceipt,"lines"|"events">[]>(Prisma.sql`SELECT d.id,d.reference,d.supplier_name AS "supplierName",d.supplier_reference AS "supplierReference",d.status,d.version,
      ${time(Prisma.sql`d.created_at`)} AS "createdAt",EXISTS(SELECT 1 FROM wms_receipt_lines l WHERE l.company_id=${c} AND l.receipt_id=d.id AND l.accepted_quantity+l.quarantined_quantity+l.rejected_quantity<l.expected_quantity) AS partial
      FROM wms_receipts d WHERE d.company_id=${c} AND d.warehouse_id=${warehouse} AND d.id=${id}`);
    if(!rows[0])throw new NotFoundException("Receipt not found");
    const lines=await this.prisma.$queryRaw<WmsReceipt["lines"]>(Prisma.sql`SELECT l.id,l.product_id AS "productId",p.name AS "productName",p.sensitive_handling AS "sensitiveHandling",p.handling_notes AS "handlingNotes",p.code AS "productCode",p.base_unit AS "baseUnit",p.track_batches AS "trackBatches",p.track_expiry AS "trackExpiry",p.pieces_per_carton AS "piecesPerCarton",l.batch_id AS "batchId",COALESCE(b.code,l.batch_code) AS "batchCode",
      to_char(COALESCE(b.production_date,l.production_date),'YYYY-MM-DD') AS "productionDate",to_char(COALESCE(b.expiry_date,l.expiry_date),'YYYY-MM-DD') AS "expiryDate",
      l.input_unit AS unit,l.conversion_factor AS "conversionFactor",l.expected_quantity::text AS "expectedQuantity",l.accepted_quantity::text AS "acceptedQuantity",l.quarantined_quantity::text AS "quarantinedQuantity",l.rejected_quantity::text AS "rejectedQuantity",l.rejection_reason AS "rejectionReason"
      FROM wms_receipt_lines l JOIN wms_products p ON p.company_id=${c} AND p.id=l.product_id LEFT JOIN wms_batches b ON b.company_id=${c} AND b.id=l.batch_id
      WHERE l.company_id=${c} AND l.receipt_id=${id} ORDER BY l.id LIMIT 20`);
    return {...rows[0],lines,events:await this.events(c,id,"receipt")};
  }
  async load(user:AuthenticatedUser,warehouse:string,id:string):Promise<WmsLoad> {
    const c=await this.access.authorizedRead(user,warehouse);
    const rows=await this.prisma.$queryRaw<Omit<WmsLoad,"lines"|"allocations"|"events">[]>(Prisma.sql`SELECT d.id,d.reference,d.status,d.version,d.source,d.recipient_id AS "recipientId",u.full_name AS "recipientName",d.customer_code AS "customerCode",
      to_char(d.target_date,'YYYY-MM-DD') AS "targetDate",d.discrepancy_reason AS "discrepancyReason",wms_min_days(${c},d.customer_code) AS "minShelfLifeDays",${time(Prisma.sql`d.created_at`)} AS "createdAt"
      FROM wms_load_requests d JOIN users u ON u.company_id=${c} AND u.id=d.recipient_id WHERE d.company_id=${c} AND d.warehouse_id=${warehouse} AND d.id=${id}`);
    if(!rows[0])throw new NotFoundException("Loading request not found");
    const lines=await this.prisma.$queryRaw<WmsLoad["lines"]>(Prisma.sql`SELECT l.id,l.product_id AS "productId",p.name AS "productName",p.sensitive_handling AS "sensitiveHandling",p.handling_notes AS "handlingNotes",p.base_unit AS "baseUnit",l.input_quantity::text AS quantity,l.input_unit AS unit,
      l.conversion_factor AS "conversionFactor",l.requested_base::text AS "requestedBase" FROM wms_load_lines l JOIN wms_products p ON p.company_id=${c} AND p.id=l.product_id WHERE l.company_id=${c} AND l.load_id=${id} ORDER BY l.id LIMIT 20`);
    const allocations=await this.prisma.$queryRaw<WmsLoad["allocations"]>(Prisma.sql`SELECT a.id,p.name AS "productName",p.sensitive_handling AS "sensitiveHandling",p.handling_notes AS "handlingNotes",p.base_unit AS "baseUnit",a.batch_id AS "batchId",b.code AS "batchCode",to_char(b.expiry_date,'YYYY-MM-DD') AS "expiryDate",
      a.allocated_quantity::text AS "allocatedQuantity",a.reserved_quantity::text AS "reservedQuantity",a.picked_quantity::text AS "pickedQuantity",a.dispatched_quantity::text AS "dispatchedQuantity",a.reason,a.policy_min_days AS "policyMinDays"
      FROM wms_allocations a JOIN wms_products p ON p.company_id=${c} AND p.id=a.product_id JOIN wms_batches b ON b.company_id=${c} AND b.id=a.batch_id WHERE a.company_id=${c} AND a.load_id=${id} ORDER BY a.product_id,b.expiry_date NULLS LAST,b.id LIMIT 100`);
    return {...rows[0],lines,allocations,events:await this.events(c,id,"load")};
  }
  async fefo(user:AuthenticatedUser,warehouse:string,input:unknown) {
    const data=parse(wmsFefoSchema,input);
    return this.access.authorizedTransaction(user,warehouse,"wms.read",async(tx,c)=>{
    const rows=await tx.$queryRaw<WmsFefoResult[]>(Prisma.sql`WITH params AS (SELECT wms_quantity(${c},${data.productId},${data.quantity}::numeric,${data.unit}) AS q,wms_min_days(${c},${data.customerCode??null}) AS days),
      choices AS MATERIALIZED (SELECT f.batch_id AS "batchId",b.code AS "batchCode",f.quantity::text,f.available::text,to_char(f.expiry_date,'YYYY-MM-DD') AS "expiryDate",f.reason
        FROM params CROSS JOIN LATERAL wms_fefo(${c},${warehouse},${data.productId},params.q,${data.targetDate}::date,params.days) f JOIN wms_batches b ON b.company_id=${c} AND b.id=f.batch_id)
      SELECT COALESCE((SELECT jsonb_agg(choices) FROM choices),'[]'::jsonb) AS choices,params.q::text AS "requestedBase",COALESCE((SELECT sum(quantity::numeric) FROM choices),0)::text AS "allocatedBase",
      (SELECT COALESCE(sum(quantity::numeric),0)>=params.q AND count(*)<=100 FROM choices) AS fulfillable,params.days AS "minShelfLifeDays",${data.targetDate} AS "targetDate",
      to_char(GREATEST(${data.targetDate}::date,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)+params.days,'YYYY-MM-DD') AS "cutoffDate",(SELECT count(*)>100 FROM choices) AS "limitExceeded" FROM params`);
    return rows[0]!;
    });
  }
  async recipients(user:AuthenticatedUser,warehouse:string,input:unknown) {
    const {page,search}=parse(wmsPageSchema,input);const c=await this.access.authorizedRead(user,warehouse);
    const rows=await this.prisma.$queryRaw<{id:string;fullName:string}[]>(Prisma.sql`SELECT u.id,u.full_name AS "fullName" FROM users u JOIN roles r ON r.id=u.role_id
      WHERE u.company_id=${c} AND u.status='ACTIVE' AND r.code='SALES_REP' AND position(lower(${search}) in lower(u.full_name))>0 ORDER BY u.id LIMIT 21 OFFSET ${(page-1)*20}`);
    return {items:rows.slice(0,20),page,hasMore:rows.length>20};
  }
  async policies(user:AuthenticatedUser,warehouse:string,input:unknown) {
    const {page,search}=parse(wmsPageSchema,input);const c=await this.access.authorizedRead(user,warehouse);
    const rows=await this.prisma.$queryRaw<WmsCustomerPolicy[]>(Prisma.sql`SELECT customer_code AS "customerCode",min_shelf_life_days AS "minShelfLifeDays",version FROM wms_customer_policies
      WHERE company_id=${c} AND position(lower(${search}) in lower(customer_code))>0 ORDER BY customer_code LIMIT 21 OFFSET ${(page-1)*20}`);
    return {items:rows.slice(0,20),page,hasMore:rows.length>20};
  }
  async setPolicy(user:AuthenticatedUser,warehouse:string,input:unknown) {
    const data=parse(wmsPolicySchema,input);
    return this.access.authorizedTransaction(user,warehouse,"wms.policy.manage",async(tx,c)=>{
      // Serialize missing-row creation too, using the same key for the same customer.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c+":policy:"+data.customerCode},0))::text`;
      const current=await tx.$queryRaw<{version:number}[]>(Prisma.sql`SELECT version FROM wms_customer_policies WHERE company_id=${c} AND customer_code=${data.customerCode} FOR UPDATE`);
      if((current[0]?.version??0)!==data.version)throw new ConflictException("WMS_DOCUMENT_STALE");
      await tx.$executeRaw(Prisma.sql`INSERT INTO wms_customer_policies(company_id,customer_code,min_shelf_life_days) VALUES(${c},${data.customerCode},${data.minShelfLifeDays})
        ON CONFLICT(company_id,customer_code) DO UPDATE SET min_shelf_life_days=EXCLUDED.min_shelf_life_days,version=wms_customer_policies.version+1,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`);
      await this.audit.record({companyId:c,userId:user.userId,action:"wms.policy.updated",entityType:"WmsCustomerPolicy",entityId:data.customerCode,metadata:{minimumDays:data.minShelfLifeDays,version:data.version+1}},tx);
      return {version:data.version+1};
    });
  }
}
