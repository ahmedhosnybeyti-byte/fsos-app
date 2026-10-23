import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";
import { randomUUID } from "node:crypto";
import { Prisma } from "@field-sales-os/database";
import { wmsAccessSchema, wmsBatchSchema, wmsCreateProductSchema, wmsOpeningSchema, wmsPageSchema, wmsReversalSchema, wmsStockQuerySchema, wmsUpdateProductSchema, type WmsAccessUser, type WmsBatch, type WmsMovement, type WmsProduct, type WmsSummary, type WmsWarehouse } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";

const productFields = Prisma.sql`p.id,p.code,p.barcode,p.name,p.base_unit AS "baseUnit",p.pieces_per_carton AS "piecesPerCarton",
  p.track_batches AS "trackBatches",p.track_expiry AS "trackExpiry",p.sensitive_handling AS "sensitiveHandling",
  p.handling_notes AS "handlingNotes",p.is_active AS "isActive",p.version`;
const movementFields = Prisma.sql`m.id,p.name AS "productName",b.code AS "batchCode",m.kind,m.quantity::text,
  p.base_unit AS "baseUnit",m.input_quantity::text AS "inputQuantity",m.input_unit AS "inputUnit",m.conversion_factor AS "conversionFactor",
  m.reserved_delta::text AS "reservedDelta",m.in_transit_delta::text AS "inTransitDelta",m.reference,m.reason,to_char(m.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",m.reversal_of AS "reversalOf",
  EXISTS(SELECT 1 FROM wms_movements r WHERE r.company_id=m.company_id AND r.reversal_of=m.id) AS reversed`;
function parse<T>(schema: ZodType<T,ZodTypeDef,unknown>, input: unknown): T {
  const result=schema.safeParse(input);
  if (!result.success) throw new BadRequestException({message:"WMS_INVALID_INPUT",errors:result.error.flatten()});
  return result.data;
}
const pageSize = 20;
function page<T>(items: T[], value: number) { return { items: items.slice(0,pageSize), page: value, hasMore: items.length>pageSize }; }

@Injectable()
export class WmsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  /** Shared server boundary for operational modules; never accept tenant from input. */
  authorizedRead(user: AuthenticatedUser, warehouse: string) { return this.scope(this.prisma,user,warehouse); }
  authorizedTransaction<T>(user: AuthenticatedUser,warehouse: string,permission: string,work:(tx:Prisma.TransactionClient,company:string)=>Promise<T>) {
    this.company(user,permission);
    return this.mutation(async tx=>work(tx,await this.scope(tx,user,warehouse,true)));
  }

  private company(user: AuthenticatedUser, permission = "wms.read") {
    if (!user.companyId || user.roleCode === "SUPER_ADMIN" || !["sfa.access","wms.read",permission].every(p => user.permissions?.includes(p)))
      throw new ForbiddenException("Warehouse company context and explicit permissions required");
    return user.companyId;
  }
  private async scope(tx: PrismaTx, user: AuthenticatedUser, warehouseId: string, lock = false) {
    const company = this.company(user);
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT w.id FROM warehouses w WHERE w.company_id=${company} AND w.id=${warehouseId} AND w.is_active
      AND (${user.roleCode === "COMPANY_ADMIN"} OR EXISTS(SELECT 1 FROM wms_warehouse_access a
        WHERE a.company_id=${company} AND a.warehouse_id=w.id AND a.user_id=${user.userId})) ${lock ? Prisma.sql`FOR SHARE OF w` : Prisma.empty}`);
    if (!rows.length) throw new NotFoundException("Authorized warehouse not found");
    if (lock && user.roleCode !== "COMPANY_ADMIN") {
      const access = await tx.$queryRaw<{ user_id: string }[]>(Prisma.sql`SELECT user_id FROM wms_warehouse_access
        WHERE company_id=${company} AND warehouse_id=${warehouseId} AND user_id=${user.userId} FOR SHARE`);
      if (!access.length) throw new NotFoundException("Authorized warehouse not found");
    }
    return company;
  }
  private async mutation<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)`;
        return work(tx);
      }, { maxWait: 5000, timeout: 15000 });
    } catch (error) {
      // Expose only our stable business codes, never driver SQL/parameters.
      const e = error as { code?: string; meta?: { code?: string; message?: string }; message?: string };
      const code = `${e.meta?.message ?? ""} ${e.message ?? ""}`.match(/WMS_[A-Z_]+/)?.[0];
      if (code) throw new ConflictException(code);
      if (e.code === "P2002" || e.meta?.code === "23505") throw new ConflictException("WMS_DUPLICATE_REFERENCE");
      throw error;
    }
  }
  async warehouses(user: AuthenticatedUser, input: unknown) {
    const company = this.company(user); const { page: n,search }=parse(wmsPageSchema,input);
    return page(await this.prisma.$queryRaw<WmsWarehouse[]>(Prisma.sql`SELECT w.id,w.code,w.name FROM warehouses w
      WHERE w.company_id=${company} AND w.is_active AND (${user.roleCode === "COMPANY_ADMIN"} OR EXISTS(
        SELECT 1 FROM wms_warehouse_access a WHERE a.company_id=${company} AND a.warehouse_id=w.id AND a.user_id=${user.userId}))
      AND (position(lower(${search}) in lower(w.name))>0 OR position(lower(${search}) in lower(w.code))>0)
      ORDER BY w.id LIMIT ${pageSize+1} OFFSET ${(n-1)*pageSize}`),n);
  }
  async summary(user: AuthenticatedUser, warehouse: string, input: unknown) {
    const { horizon }=parse(wmsStockQuerySchema,input); const company=await this.scope(this.prisma,user,warehouse);
    const rows=await this.prisma.$queryRaw<WmsSummary[]>(Prisma.sql`WITH stock AS MATERIALIZED (
      SELECT s.physical,s.available,s.reserved,s.quarantined,s.in_transit,s.expired,s.days_remaining,s.product_id,s.base_unit
      FROM wms_inventory_state s
      WHERE s.company_id=${company} AND s.warehouse_id=${warehouse} AND (s.physical>0 OR s.in_transit>0)
    ), units AS (SELECT base_unit AS "baseUnit",sum(physical)::text AS physical,sum(available)::text AS available,
      sum(reserved)::text AS reserved,sum(quarantined)::text AS quarantined,sum(expired)::text AS expired,sum(in_transit)::text AS "inTransit" FROM stock GROUP BY base_unit)
    SELECT COALESCE((SELECT jsonb_agg(units ORDER BY "baseUnit") FROM units),'[]'::jsonb) AS units,
      count(*) FILTER(WHERE physical>0 AND days_remaining>0 AND days_remaining<=${horizon})::int AS "nearExpiryBatches",
      count(*) FILTER(WHERE physical>0 AND days_remaining<=0)::int AS "expiredBatches",count(DISTINCT product_id) FILTER(WHERE physical>0)::int AS "stockedProducts",
      to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf" FROM stock`);
    return rows[0]!;
  }
  async products(user: AuthenticatedUser, warehouse: string, input: unknown) {
    const { page:n,search }=parse(wmsPageSchema,input); const company=await this.scope(this.prisma,user,warehouse);
    return page(await this.prisma.$queryRaw<WmsProduct[]>(Prisma.sql`WITH products AS MATERIALIZED (
      SELECT ${productFields} FROM wms_products p WHERE p.company_id=${company}
      AND (position(lower(${search}) in lower(p.name))>0 OR position(lower(${search}) in lower(p.code))>0 OR p.barcode=${search})
      ORDER BY p.id LIMIT ${pageSize+1} OFFSET ${(n-1)*pageSize}
    ) SELECT p.*,COALESCE(s.physical,0)::text AS physical,COALESCE(s.available,0)::text AS available,
      COALESCE(s.reserved,0)::text AS reserved,COALESCE(s.quarantined,0)::text AS quarantined,COALESCE(s.in_transit,0)::text AS "inTransit"
      FROM products p LEFT JOIN (
        SELECT s.product_id,sum(s.physical) AS physical,sum(s.available) AS available,sum(s.reserved) AS reserved,sum(s.quarantined) AS quarantined,sum(s.in_transit) AS in_transit
        FROM wms_inventory_state s WHERE s.company_id=${company} AND s.warehouse_id=${warehouse}
        AND s.product_id IN (SELECT id FROM products) GROUP BY s.product_id
      ) s ON s.product_id=p.id ORDER BY p.id`),n);
  }
  async batches(user: AuthenticatedUser, warehouse: string, input: unknown) {
    const { page:n,productId,nearExpiry,horizon }=parse(wmsStockQuerySchema,input); const company=await this.scope(this.prisma,user,warehouse);
    return page(await this.prisma.$queryRaw<WmsBatch[]>(Prisma.sql`WITH lots AS MATERIALIZED (
      SELECT b.id,b.product_id,b.code,b.production_date,b.expiry_date,b.is_quarantined,
        COALESCE(s.physical,0) AS physical,COALESCE(s.reserved,0) AS reserved,COALESCE(s.quarantined,0) AS quarantined,COALESCE(s.in_transit,0) AS in_transit,COALESCE(s.quality_blocked,false) AS quality_blocked
      FROM wms_batches b LEFT JOIN wms_positions s ON s.company_id=${company} AND s.warehouse_id=${warehouse} AND s.batch_id=b.id
      WHERE b.company_id=${company} ${productId ? Prisma.sql`AND b.product_id=${productId}` : Prisma.sql`AND (s.physical>0 OR s.in_transit>0)`}
      ${nearExpiry === "true" ? Prisma.sql`AND s.physical>0 AND b.expiry_date>(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
        AND b.expiry_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date+${horizon}::int` : Prisma.empty}
      ORDER BY b.expiry_date ASC NULLS LAST,b.id LIMIT ${pageSize+1} OFFSET ${(n-1)*pageSize}
    ) SELECT b.id,b.product_id AS "productId",p.name AS "productName",p.base_unit AS "baseUnit",b.code,
      to_char(b.production_date,'YYYY-MM-DD') AS "productionDate",to_char(b.expiry_date,'YYYY-MM-DD') AS "expiryDate",b.is_quarantined AS "isQuarantined",b.quality_blocked AS "qualityBlocked",
      b.physical::text, b.reserved::text,b.quarantined::text,b.in_transit::text AS "inTransit",
      (CASE WHEN b.expiry_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date OR b.is_quarantined OR b.quality_blocked OR NOT p.is_active THEN 0
        ELSE b.physical-b.reserved-b.quarantined END)::text AS available,
      b.expiry_date-(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS "daysRemaining",
      CASE WHEN b.production_date IS NOT NULL AND b.expiry_date IS NOT NULL THEN
        LEAST(100::numeric,GREATEST(0::numeric,ROUND(100.0*((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date-b.production_date)/(b.expiry_date-b.production_date),2)))::text END AS "lifeConsumedPct"
      FROM lots b JOIN wms_products p ON p.company_id=${company} AND p.id=b.product_id
      ORDER BY b.expiry_date ASC NULLS LAST,b.id`),n);
  }
  async movements(user: AuthenticatedUser, warehouse: string, input: unknown) {
    const { page:n }=parse(wmsPageSchema,input); const company=await this.scope(this.prisma,user,warehouse);
    return page(await this.prisma.$queryRaw<WmsMovement[]>(Prisma.sql`WITH movements AS MATERIALIZED (
      SELECT id,company_id,batch_id,kind,quantity,input_quantity,input_unit,conversion_factor,reference,reason,created_at,reversal_of,reserved_delta,in_transit_delta
      FROM wms_movements WHERE company_id=${company} AND warehouse_id=${warehouse}
      ORDER BY created_at DESC,id DESC LIMIT ${pageSize+1} OFFSET ${(n-1)*pageSize}
    ) SELECT ${movementFields} FROM movements m
      JOIN wms_batches b ON b.company_id=m.company_id AND b.id=m.batch_id JOIN wms_products p ON p.company_id=b.company_id AND p.id=b.product_id
      ORDER BY m.created_at DESC,m.id DESC`),n);
  }
  async saveProduct(user: AuthenticatedUser, warehouse: string, input: unknown, id?: string) {
    this.company(user,"wms.products.manage"); const data=id?parse(wmsUpdateProductSchema,input):parse(wmsCreateProductSchema,input);
    return this.mutation(async tx => {
      const company=await this.scope(tx,user,warehouse,true); const productId=id??randomUUID();
      if (id) {
        const locked=await tx.$queryRaw<{version:number}[]>(Prisma.sql`SELECT version FROM wms_products WHERE company_id=${company} AND id=${id} FOR UPDATE`);
        if (!locked.length) throw new NotFoundException("Product not found");
        if (locked[0]!.version!==("version" in data?data.version:0)) throw new ConflictException("WMS_PRODUCT_STALE");
        await tx.$executeRaw(Prisma.sql`UPDATE wms_products SET code=${data.code},barcode=${data.barcode},name=${data.name},base_unit=${data.baseUnit},
          pieces_per_carton=${data.piecesPerCarton},track_batches=${data.trackBatches},track_expiry=${data.trackExpiry},sensitive_handling=${data.sensitiveHandling},
          handling_notes=${data.handlingNotes},is_active=${data.isActive},version=version+1,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE company_id=${company} AND id=${id}`);
      } else {
        await tx.$executeRaw(Prisma.sql`INSERT INTO wms_products(id,company_id,code,barcode,name,base_unit,pieces_per_carton,track_batches,track_expiry,sensitive_handling,handling_notes,is_active)
          VALUES(${productId},${company},${data.code},${data.barcode},${data.name},${data.baseUnit},${data.piecesPerCarton},${data.trackBatches},${data.trackExpiry},${data.sensitiveHandling},${data.handlingNotes},${data.isActive})`);
      }
      await this.audit.record({companyId:company,userId:user.userId,action:id?"wms.product.updated":"wms.product.created",entityType:"WmsProduct",entityId:productId},tx);
      return {id:productId};
    });
  }
  async createBatch(user: AuthenticatedUser, warehouse: string, input: unknown) {
    this.company(user,"wms.products.manage"); const data=parse(wmsBatchSchema,input);
    return this.mutation(async tx => {
      const company=await this.scope(tx,user,warehouse,true);
      const rows=await tx.$queryRaw<{trackExpiry:boolean}[]>(Prisma.sql`SELECT track_expiry AS "trackExpiry" FROM wms_products
        WHERE company_id=${company} AND id=${data.productId} AND is_active AND track_batches FOR UPDATE`);
      if (!rows.length) throw new NotFoundException("Batch-tracked active product not found");
      if (rows[0]!.trackExpiry&&!data.expiryDate) throw new ConflictException("WMS_EXPIRY_REQUIRED");
      const id=randomUUID();
      await tx.$executeRaw(Prisma.sql`INSERT INTO wms_batches(id,company_id,product_id,code,production_date,expiry_date,is_quarantined)
        VALUES(${id},${company},${data.productId},${data.code},${data.productionDate}::date,${data.expiryDate}::date,${data.isQuarantined})`);
      await this.audit.record({companyId:company,userId:user.userId,action:"wms.batch.created",entityType:"WmsBatch",entityId:id},tx);
      return {id};
    });
  }
  async postOpening(user: AuthenticatedUser, warehouse: string, input: unknown) {
    this.company(user,"wms.opening.post"); const data=parse(wmsOpeningSchema,input);
    return this.mutation(async tx => {
      const company=await this.scope(tx,user,warehouse,true);
      const rows=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT wms_post_opening(${company},${warehouse},${data.productId},${data.batchId},${data.quantity}::numeric,
        ${data.unit},${data.quarantined},${data.reference},${data.idempotencyKey},${data.reason},${user.userId},${randomUUID()}) AS id`);
      await this.audit.record({companyId:company,userId:user.userId,action:"wms.opening.posted",entityType:"WmsMovement",entityId:rows[0]!.id,eventKey:`wms:${company}:${rows[0]!.id}`},tx);
      return rows[0]!;
    });
  }
  async reverseOpening(user: AuthenticatedUser, warehouse: string, movement: string, input: unknown) {
    this.company(user,"wms.opening.post"); const data=parse(wmsReversalSchema,input);
    return this.mutation(async tx => {
      const company=await this.scope(tx,user,warehouse,true);
      const rows=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT wms_reverse_opening(${company},${warehouse},${movement},${data.idempotencyKey},${data.reason},${user.userId},${randomUUID()}) AS id`);
      await this.audit.record({companyId:company,userId:user.userId,action:"wms.opening.reversed",entityType:"WmsMovement",entityId:rows[0]!.id,eventKey:`wms:${company}:${rows[0]!.id}`},tx);
      return rows[0]!;
    });
  }
  private accessAdmin(user: AuthenticatedUser) {
    this.company(user,"wms.access.manage");
    if (user.roleCode!=="COMPANY_ADMIN") throw new ForbiddenException("Company administrator required");
  }
  async accessUsers(user: AuthenticatedUser, warehouse: string, input: unknown) {
    this.accessAdmin(user); const {page:n,search}=parse(wmsPageSchema,input); const company=await this.scope(this.prisma,user,warehouse);
    return page(await this.prisma.$queryRaw<WmsAccessUser[]>(Prisma.sql`SELECT u.id,u.full_name AS "fullName",EXISTS(SELECT 1 FROM wms_warehouse_access a
      WHERE a.company_id=${company} AND a.warehouse_id=${warehouse} AND a.user_id=u.id) AS granted
      FROM users u WHERE u.company_id=${company} AND u.status='ACTIVE' AND position(lower(${search}) in lower(u.full_name))>0
      ORDER BY u.id LIMIT ${pageSize+1} OFFSET ${(n-1)*pageSize}`),n);
  }
  async setAccess(user: AuthenticatedUser, warehouse: string, input: unknown) {
    this.accessAdmin(user); const data=parse(wmsAccessSchema,input);
    return this.mutation(async tx => {
      const company=await this.scope(tx,user,warehouse,true);
      const target=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM users WHERE company_id=${company} AND id=${data.userId} AND status='ACTIVE' FOR SHARE`);
      if (!target.length) throw new NotFoundException("Company user not found");
      if (data.granted) await tx.$executeRaw(Prisma.sql`INSERT INTO wms_warehouse_access(company_id,warehouse_id,user_id) VALUES(${company},${warehouse},${data.userId}) ON CONFLICT DO NOTHING`);
      else await tx.$executeRaw(Prisma.sql`DELETE FROM wms_warehouse_access WHERE company_id=${company} AND warehouse_id=${warehouse} AND user_id=${data.userId}`);
      await this.audit.record({companyId:company,userId:user.userId,action:data.granted?"wms.access.granted":"wms.access.revoked",entityType:"Warehouse",entityId:warehouse,metadata:{userId:data.userId}},tx);
      return {granted:data.granted};
    });
  }
}
