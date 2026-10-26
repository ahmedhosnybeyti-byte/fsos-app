import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { productCategory } from "../../common/queries/product-category";
import { Prisma } from "@field-sales-os/database";
import { SALES_DRAFT_PERMISSION, SALES_DRAFT_PRICE_BLOCKERS, SALES_DRAFT_CREDIT_BLOCKERS, salesDraftCreateSchema, salesDraftSaveSchema, salesDraftCancelSchema, salesDraftPageSchema, type SalesDraft, type SalesDraftProduct, type SalesDraftCheck } from "@field-sales-os/schemas";
import type { ZodType } from "zod";
import { PrismaService, type PrismaTx } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";
import { RieFacade } from "../rie/rie-facade.service";

function parse<T>(schema:ZodType<T,any,any>,input:unknown):T {
  const p=schema.safeParse(input);if(!p.success)throw new BadRequestException("DRAFT_INVALID_INPUT");return p.data;
}
type Visit={id:string;customerCode:string;status:string};
const header=Prisma.sql`d.id,d.visit_id AS "visitId",d.customer_code AS "customerCode",d.customer_name AS "customerName",d.rep_name AS "repName",d.status,d.version,d.warehouse_id AS "warehouseId",w.name AS "warehouseName",d.notes,
 to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",to_char(d.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",(v.status='OPEN' AND d.status='DRAFT') AS editable`;

@Injectable()
export class SalesDraftsService {
  constructor(private readonly prisma:PrismaService,private readonly rie:RieFacade,private readonly audit:AuditLogService){}
  private actor(u:AuthenticatedUser){
    if(!u.companyId||u.roleCode!=="SALES_REP"||!["sfa.access","visits.execute",SALES_DRAFT_PERMISSION].every(p=>u.permissions?.includes(p)))throw new ForbiddenException();
    return u.companyId;
  }
  private async admission(tx:PrismaTx,u:AuthenticatedUser,lock=false){
    const c=this.actor(u);
    const rows=await tx.$queryRaw(Prisma.sql`SELECT s.company_id FROM company_operating_settings s JOIN users u ON u.company_id=s.company_id AND u.id=${u.userId} AND u.status='ACTIVE'
      WHERE s.company_id=${c} AND s.operating_mode IN('SFA','FULL_ERP') ${lock?Prisma.sql`FOR SHARE OF s,u`:Prisma.empty}`);
    if(!(rows as unknown[]).length)throw new ForbiddenException();return c;
  }
  private async visit(tx:PrismaTx,u:AuthenticatedUser,id:string,lock=false):Promise<Visit>{
    const c=this.actor(u);
    const rows=await tx.$queryRaw<Visit[]>(Prisma.sql`SELECT id,customer_code AS "customerCode",status FROM visit_executions WHERE company_id=${c} AND rep_id=${u.userId} AND id=${id} ${lock?Prisma.sql`FOR UPDATE`:Prisma.empty}`);
    if(!rows[0])throw new NotFoundException();return rows[0];
  }
  private async authorize(u:AuthenticatedUser,id:string){
    await this.admission(this.prisma,u);const v=await this.visit(this.prisma,u,id);
    const r=await this.rie.queryCanonicalRecords({companyId:u.companyId!,requestingUser:{roleCode:u.roleCode,email:u.email},entityName:"Customers",
      projection:[{field:"CustomerCode"}],scope:{customer:{values:[v.customerCode]}},pagination:{limit:1}});
    if(!r.records[0])throw new NotFoundException();return v;
  }
  private async warehouse(tx:PrismaTx,u:AuthenticatedUser,id:string,lock=false){
    const c=this.actor(u);
    const rows=await tx.$queryRaw(Prisma.sql`SELECT w.id FROM warehouses w JOIN wms_warehouse_access a ON a.company_id=w.company_id AND a.warehouse_id=w.id AND a.user_id=${u.userId}
      WHERE w.company_id=${c} AND w.id=${id} AND w.is_active ${lock?Prisma.sql`FOR SHARE OF w,a`:Prisma.empty}`);
    if(!(rows as unknown[]).length)throw new NotFoundException("DRAFT_WAREHOUSE_UNAVAILABLE");
  }
  private async row(tx:PrismaTx,u:AuthenticatedUser,visitId:string,id:string):Promise<SalesDraft>{
    const rows=await tx.$queryRaw<SalesDraft[]>(Prisma.sql`SELECT ${header},coalesce((SELECT jsonb_agg(x ORDER BY x."lineNo") FROM (
      SELECT line_no AS "lineNo",product_id AS "productId",product_code AS "productCode",product_name AS "productName",${productCategory(Prisma.sql`d.company_id`,Prisma.sql`product_code`)} AS category,base_unit AS "baseUnit",quantity::text,unit,conversion_factor AS "conversionFactor",quantity_base::text AS "quantityBase"
      FROM sales_draft_lines WHERE company_id=d.company_id AND draft_id=d.id ORDER BY line_no LIMIT 20) x),'[]'::jsonb) AS lines
      FROM sales_drafts d JOIN visit_executions v ON v.company_id=d.company_id AND v.id=d.visit_id
      LEFT JOIN warehouses w ON w.company_id=d.company_id AND w.id=d.warehouse_id WHERE d.company_id=${u.companyId} AND d.rep_id=${u.userId} AND d.visit_id=${visitId} AND d.id=${id}`);
    if(!rows[0])throw new NotFoundException();
    return rows[0];
  }
  async list(u:AuthenticatedUser,visitId:string,input:unknown){
    const {page}=parse(salesDraftPageSchema,input);await this.authorize(u,visitId);
    const rows=await this.prisma.$queryRaw<SalesDraft[]>(Prisma.sql`SELECT ${header} FROM sales_drafts d JOIN visit_executions v ON v.company_id=d.company_id AND v.id=d.visit_id
      LEFT JOIN warehouses w ON w.company_id=d.company_id AND w.id=d.warehouse_id WHERE d.company_id=${u.companyId} AND d.rep_id=${u.userId} AND d.visit_id=${visitId}
      ORDER BY d.created_at DESC,d.id LIMIT 21 OFFSET ${(page-1)*20}`);
    return {items:rows.slice(0,20),hasMore:rows.length>20,page};
  }
  async read(u:AuthenticatedUser,visitId:string,id:string){await this.authorize(u,visitId);return this.row(this.prisma,u,visitId,id);}
  async warehouses(u:AuthenticatedUser,visitId:string,input:unknown){
    const {page,search}=parse(salesDraftPageSchema,input);await this.authorize(u,visitId);
    const rows=await this.prisma.$queryRaw<{id:string;name:string}[]>(Prisma.sql`SELECT w.id,w.name FROM warehouses w JOIN wms_warehouse_access a ON a.company_id=w.company_id AND a.warehouse_id=w.id AND a.user_id=${u.userId}
      WHERE w.company_id=${u.companyId} AND w.is_active AND position(lower(${search}) in lower(w.code||' '||w.name))>0 ORDER BY w.id LIMIT 21 OFFSET ${(page-1)*20}`);
    return {items:rows.slice(0,20),hasMore:rows.length>20,page};
  }
  async products(u:AuthenticatedUser,visitId:string,warehouseId:string,input:unknown){
    const {page,search}=parse(salesDraftPageSchema,input);await this.authorize(u,visitId);await this.warehouse(this.prisma,u,warehouseId);
    const rows=await this.prisma.$queryRaw<SalesDraftProduct[]>(Prisma.sql`SELECT id,code,name,${productCategory(Prisma.sql`wms_products.company_id`,Prisma.sql`wms_products.code`)} AS category,base_unit AS "baseUnit",pieces_per_carton AS "piecesPerCarton",(base_unit='PIECE' AND pieces_per_carton>0) AS "cartonAllowed"
      FROM wms_products WHERE company_id=${u.companyId} AND is_active AND position(lower(${search}) in lower(code||' '||name))>0 ORDER BY id LIMIT 21 OFFSET ${(page-1)*20}`);
    return {items:rows.slice(0,20),hasMore:rows.length>20,page};
  }
  async create(u:AuthenticatedUser,visitId:string,input:unknown){return this.command(u,visitId,null,"CREATE",parse(salesDraftCreateSchema,input));}
  async save(u:AuthenticatedUser,visitId:string,id:string,input:unknown){return this.command(u,visitId,id,"SAVE",parse(salesDraftSaveSchema,input));}
  async cancel(u:AuthenticatedUser,visitId:string,id:string,input:unknown){return this.command(u,visitId,id,"CANCEL",parse(salesDraftCancelSchema,input));}
  private async command(u:AuthenticatedUser,visitId:string,id:string|null,action:"CREATE"|"SAVE"|"CANCEL",body:any):Promise<SalesDraft>{
    await this.authorize(u,visitId);
    const digest=createHash("sha256").update(JSON.stringify({visitId,id,action,body})).digest("hex");
    try{return await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)`;
      await this.admission(tx,u,true);
      // Same visit row as Foundation 001 finish: close and draft writes serialize.
      const v=await this.visit(tx,u,visitId,true);
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([u.companyId,u.userId,body.commandKey])},0))`);
      const prior=await tx.$queryRaw<{payload_hash:string;result:SalesDraft}[]>(Prisma.sql`SELECT payload_hash,result FROM sales_draft_commands WHERE company_id=${u.companyId} AND rep_id=${u.userId} AND command_key=${body.commandKey}`);
      if(prior[0]){if(prior[0].payload_hash!==digest)throw new ConflictException("DRAFT_COMMAND_CONFLICT");return prior[0].result;}
      if(v.status!=="OPEN")throw new ConflictException("DRAFT_VISIT_CLOSED");
      let draftId=id;let changed=true;
      if(action==="CREATE"){
        const active=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM sales_drafts WHERE company_id=${u.companyId} AND visit_id=${visitId} AND status='DRAFT' LIMIT 1`);
        draftId=active[0]?.id??randomUUID();changed=!active.length;
        if(changed)await tx.$executeRaw(Prisma.sql`INSERT INTO sales_drafts(id,company_id,visit_id,rep_id,customer_code,customer_name,rep_name)
          SELECT ${draftId},company_id,id,rep_id,customer_code,customer_name,rep_name FROM visit_executions WHERE company_id=${u.companyId} AND rep_id=${u.userId} AND id=${visitId}`);
      }else{
        const d=await this.row(tx,u,visitId,id!);
        if(d.status!=="DRAFT"||d.version!==body.version)throw new ConflictException("DRAFT_STALE");
        if(action==="SAVE"){
          if(body.warehouseId)await this.warehouse(tx,u,body.warehouseId,true);
          // Stable product locks preserve the approved conversion during save.
          if(body.lines.length){
            const ids=body.lines.map((l:any)=>l.productId);
            const products=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM wms_products WHERE company_id=${u.companyId} AND is_active AND id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`);
            if(products.length!==ids.length)throw new BadRequestException("DRAFT_PRODUCT_UNAVAILABLE");
          }
          await tx.$executeRaw(Prisma.sql`DELETE FROM sales_draft_lines WHERE company_id=${u.companyId} AND draft_id=${id}`);
          await tx.$executeRaw(Prisma.sql`UPDATE sales_drafts SET warehouse_id=${body.warehouseId},notes=${body.notes},version=version+1,updated_at=now() WHERE company_id=${u.companyId} AND id=${id}`);
          if(body.lines.length)await tx.$executeRaw(Prisma.sql`INSERT INTO sales_draft_lines(company_id,draft_id,line_no,product_id,product_code,product_name,base_unit,quantity,unit,conversion_factor,quantity_base)
            SELECT ${u.companyId},${id},input.n::integer,p.id,p.code,p.name,p.base_unit,(input.x->>'quantity')::numeric,input.x->>'unit',CASE WHEN input.x->>'unit'='CARTON' THEN p.pieces_per_carton ELSE 1 END,
              wms_quantity(${u.companyId},p.id,(input.x->>'quantity')::numeric,input.x->>'unit')
            FROM jsonb_array_elements(${JSON.stringify(body.lines)}::jsonb) WITH ORDINALITY input(x,n) JOIN wms_products p ON p.company_id=${u.companyId} AND p.id=input.x->>'productId' AND p.is_active`);
        }else await tx.$executeRaw(Prisma.sql`UPDATE sales_drafts SET status='CANCELLED',version=version+1,updated_at=now() WHERE company_id=${u.companyId} AND id=${id}`);
      }
      const result=await this.row(tx,u,visitId,draftId!);
      await tx.$executeRaw(Prisma.sql`INSERT INTO sales_draft_commands(company_id,rep_id,command_key,payload_hash,draft_id,result) VALUES(${u.companyId},${u.userId},${body.commandKey},${digest},${draftId},${JSON.stringify(result)}::jsonb)`);
      if(changed)await this.audit.record({companyId:u.companyId,userId:u.userId,action:`sales_draft.${action.toLowerCase()}`,entityType:"SalesDraft",entityId:draftId!,eventKey:`sales-draft:${u.companyId}:${u.userId}:${body.commandKey}`,metadata:{visitId,version:result.version,status:result.status,lineCount:result.lines.length}},tx);
      return result;
    },{timeout:15000,maxWait:5000});}catch(error){
      if(error instanceof HttpException)throw error;
      const e=error as {message?:string;meta?:{message?:string;code?:string};code?:string};
      const code=`${e.message??""} ${e.meta?.message??""}`.match(/(?:DRAFT|WMS)_[A-Z_]+/)?.[0];
      if(code)throw new ConflictException(code);
      if(e.code==="P2002"||e.meta?.code==="23505")throw new ConflictException("DRAFT_CONFLICT");
      throw error;
    }
  }
  async check(u:AuthenticatedUser,visitId:string,id:string):Promise<SalesDraftCheck>{
    await this.authorize(u,visitId);
    // One read snapshot keeps saved lines and selected warehouse consistent
    // during a concurrent draft edit. This never locks or changes stock.
    return this.prisma.$transaction(async tx=>{
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$queryRaw`SELECT set_config('statement_timeout','10s',true)`;
    await this.admission(tx,u);const d=await this.row(tx,u,visitId,id);
    // Imported values and analytical precedence are not operational approval.
    // Fail closed without exposing GL data or selecting a speculative price.
    const result:SalesDraftCheck={checkedAt:new Date().toISOString(),pricing:"REQUIRES_SETUP",priceSource:null,tax:null,discount:null,credit:null,
      draftId:d.id,draftVersion:d.version,warehouseId:d.warehouseId,nonbinding:true,approvalAllowed:false,
      commercial:{pricing:{state:"NEEDS_REVIEW",reason:"REQUIRES_SETUP",blockers:SALES_DRAFT_PRICE_BLOCKERS},
        credit:{state:"NEEDS_REVIEW",reason:"REQUIRES_SETUP",blockers:SALES_DRAFT_CREDIT_BLOCKERS}},lines:[]};
    if(!d.warehouseId)return result;
    await this.warehouse(tx,u,d.warehouseId);
    // Materialize the two scoped aggregates once: inlining them can re-scan lots
    // for every selected line under fresh/stale PostgreSQL statistics.
    result.lines=await tx.$queryRaw<SalesDraftCheck["lines"]>(Prisma.sql`WITH policy AS MATERIALIZED (
      SELECT wms_min_days(${u.companyId},${d.customerCode}) AS min_days,CURRENT_DATE AS stock_date,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS utc_date,
        GREATEST(CURRENT_DATE,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) AS custody_date
    ), selected AS MATERIALIZED (
      SELECT l.line_no,l.product_id,l.quantity_base,l.conversion_factor,l.unit,l.base_unit,p.is_active,p.track_expiry,p.base_unit AS current_unit,p.pieces_per_carton
      FROM sales_draft_lines l JOIN wms_products p ON p.company_id=l.company_id AND p.id=l.product_id WHERE l.company_id=${u.companyId} AND l.draft_id=${id}
    ), lots AS MATERIALIZED (
      SELECT id,product_id,expiry_date,is_quarantined FROM wms_batches
      WHERE company_id=${u.companyId} AND product_id IN (SELECT product_id FROM selected)
    ), inventory AS MATERIALIZED (
      SELECT product_id,batch_id,available,quality_blocked,days_remaining FROM wms_inventory_state
      WHERE company_id=${u.companyId} AND warehouse_id=${d.warehouseId} AND batch_id IN (SELECT id FROM lots)
    ), own_custody AS MATERIALIZED (
      SELECT batch_id,quantity FROM wms_custody_positions
      WHERE company_id=${u.companyId} AND recipient_id=${u.userId} AND warehouse_id=${d.warehouseId} AND batch_id IN (SELECT id FROM lots)
    ), stock_eligibility AS MATERIALIZED (
      SELECT s.product_id,s.available,(policy.utc_date+s.days_remaining) AS expiry_date,
        (s.days_remaining IS NOT NULL OR NOT l.track_expiry) AND
        (s.days_remaining IS NULL AND policy.min_days=0 OR s.days_remaining>=policy.stock_date+policy.min_days-policy.utc_date) AS eligible
      FROM inventory s JOIN selected l ON l.product_id=s.product_id CROSS JOIN policy
    ), stock AS MATERIALIZED (
      SELECT product_id,sum(CASE WHEN eligible THEN available ELSE 0 END) AS q,
        count(*) FILTER(WHERE eligible AND available>0)::int AS eligible_lots,
        min(expiry_date) FILTER(WHERE eligible AND available>0)::text AS nearest_expiry
      FROM stock_eligibility GROUP BY product_id
    ), custody_eligibility AS MATERIALIZED (
      SELECT b.product_id,s.quantity,b.expiry_date,l.is_active AND NOT b.is_quarantined AND NOT coalesce(pos.quality_blocked,true)
        AND (b.expiry_date IS NOT NULL OR NOT l.track_expiry)
        AND ((b.expiry_date IS NULL AND policy.min_days=0) OR
          (b.expiry_date>policy.custody_date AND b.expiry_date>=policy.custody_date+policy.min_days)) AS eligible
      FROM own_custody s JOIN lots b ON b.id=s.batch_id JOIN selected l ON l.product_id=b.product_id
      LEFT JOIN inventory pos ON pos.batch_id=s.batch_id CROSS JOIN policy
    ), custody AS MATERIALIZED (
      SELECT product_id,sum(quantity) AS q,sum(CASE WHEN eligible THEN quantity ELSE 0 END) AS eligible,
        count(*) FILTER(WHERE eligible AND quantity>0)::int AS eligible_lots,
        min(expiry_date) FILTER(WHERE eligible AND quantity>0)::text AS nearest_expiry
      FROM custody_eligibility GROUP BY product_id
    ), checked AS MATERIALIZED (
      SELECT l.*,NOT l.is_active OR l.base_unit<>l.current_unit OR l.conversion_factor<>CASE WHEN l.unit='CARTON' THEN l.pieces_per_carton ELSE 1 END AS changed FROM selected l
    ) SELECT l.line_no AS "lineNo",l.product_id AS "productId",l.quantity_base::text AS "requestedBase",s.q::text AS "warehouseAvailable",c.q::text AS "ownCustody",c.eligible::text AS "eligibleCustody",
      (s.q<l.quantity_base) AS "warehouseShort",(c.eligible<l.quantity_base) AS "custodyShort",
      CASE WHEN l.changed THEN 'PRODUCT_CHANGED' ELSE 'CHECKED' END AS state,
      CASE WHEN l.changed THEN 'NEEDS_REVIEW' ELSE 'AVAILABLE' END AS "unitState",
      CASE WHEN l.changed OR s.q IS NULL THEN 'NEEDS_REVIEW' WHEN s.q<l.quantity_base THEN 'UNAVAILABLE' ELSE 'AVAILABLE' END AS "warehouseState",
      CASE WHEN l.changed OR c.eligible IS NULL THEN 'NEEDS_REVIEW' WHEN c.eligible<l.quantity_base THEN 'UNAVAILABLE' ELSE 'AVAILABLE' END AS "custodyState",
      'NEEDS_REVIEW' AS "pricingState",'REQUIRES_SETUP' AS "priceReason",policy.min_days AS "minShelfLifeDays",
      coalesce(s.eligible_lots,0) AS "warehouseEligibleLots",coalesce(c.eligible_lots,0) AS "custodyEligibleLots",
      s.nearest_expiry AS "warehouseNearestExpiry",c.nearest_expiry AS "custodyNearestExpiry"
      FROM checked l LEFT JOIN stock s ON s.product_id=l.product_id LEFT JOIN custody c ON c.product_id=l.product_id CROSS JOIN policy ORDER BY l.line_no LIMIT 20`);
    return result;
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000,maxWait:5000});
  }
}
