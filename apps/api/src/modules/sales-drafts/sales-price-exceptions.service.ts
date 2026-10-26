import {BadRequestException,ConflictException,ForbiddenException,HttpException,Injectable,NotFoundException} from "@nestjs/common";
import {createHash,randomUUID} from "node:crypto";
import {Prisma} from "@field-sales-os/database";
import {PRICE_EXCEPTION_PERMISSIONS,priceExceptionCreateSchema,priceExceptionDecisionSchema,priceExceptionListSchema,type PriceExceptionCreate,type PriceExceptionDecision,type PriceExceptionRequest} from "@field-sales-os/schemas";
import {PrismaService,type PrismaTx} from "../../common/prisma";
import type {AuthenticatedUser} from "../../common/types/authenticated-user";
import {AuditLogService} from "../audit-log/audit-log.service";
import {RieFacade} from "../rie/rie-facade.service";
import {CanonicalHierarchyResolverService} from "../rie/canonical-hierarchy-resolver.service";
import type {ZodType} from "zod";

const P=PRICE_EXCEPTION_PERMISSIONS;
function parse<T>(schema:ZodType<T,any,any>,input:unknown):T{const r=schema.safeParse(input);if(!r.success)throw new BadRequestException("PRICE_INVALID_INPUT");return r.data;}
const fields=Prisma.sql`r.id,r.draft_id AS "draftId",r.draft_version AS "draftVersion",r.requester_id AS "requesterId",r.customer_code AS "customerCode",r.customer_name AS "customerName",r.channel,r.route_id AS "routeId",
 r.product_id AS "productId",r.product_code AS "productCode",r.product_name AS "productName",r.unit,r.conversion_factor AS "conversionFactor",r.kind,r.proposed_value::text AS value,r.currency,r.reason,
 r.desired_from::text AS "desiredFrom",r.desired_to::text AS "desiredTo",r.status,r.version,r.reviewed_by AS "reviewedBy",r.decided_by AS "decidedBy",
 to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",NULL AS "priceBefore",'REQUIRES_SETUP' AS activation,'UNAVAILABLE' AS attachments`;

@Injectable()
export class SalesPriceExceptionsService{
 constructor(private readonly prisma:PrismaService,private readonly rie:RieFacade,private readonly hierarchy:CanonicalHierarchyResolverService,private readonly audit:AuditLogService){}
 private stage(u:AuthenticatedUser){
  const permission=u.roleCode==="SALES_REP"?P.request:u.roleCode==="SUPERVISOR"?P.review:u.roleCode==="MANAGER"?P.approve:u.roleCode==="ACCOUNTANT"?P.accounting:null;
  if(!u.companyId||!permission||!["sfa.access",permission,...(u.roleCode==="ACCOUNTANT"?["accounting.read"]:u.roleCode==="SALES_REP"?["visits.execute","sales.drafts.manage"]:[])].every(p=>u.permissions?.includes(p)))throw new ForbiddenException("PRICE_FORBIDDEN");return permission;
 }
 private async admission(tx:PrismaTx,u:AuthenticatedUser,lock=false){
  const permission=this.stage(u);
  const rows=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT u.id FROM users u JOIN roles ro ON ro.id=u.role_id JOIN company_operating_settings s ON s.company_id=u.company_id
   WHERE u.company_id=${u.companyId} AND u.id=${u.userId} AND ro.code=${u.roleCode} AND sales_price_actor(${u.companyId},u.id,ro.code,${permission})
   AND (${u.roleCode}<>'ACCOUNTANT' OR EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=ro.id AND p.code='accounting.read'))
   AND (${u.roleCode}<>'SALES_REP' OR (SELECT count(DISTINCT p.code) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=ro.id AND p.code IN('visits.execute','sales.drafts.manage'))=2)
   ${lock?Prisma.sql`FOR SHARE OF u,ro,s`:Prisma.empty}`);
  if(!rows.length)throw new ForbiddenException("PRICE_FORBIDDEN");
 }
 private async scope(u:AuthenticatedUser){
  this.stage(u);if(u.roleCode==="ACCOUNTANT")return Prisma.sql`r.status='APPROVED'`;
  const routes=await this.hierarchy.resolveAllowedRouteIds(u.companyId!,{roleCode:u.roleCode,email:u.email});
  if(!routes?.size)return Prisma.sql`FALSE`;
  // Current-only customer metadata, scoped before pagination. No JSON payload leaves PG.
  return Prisma.sql`${u.roleCode==="SALES_REP"?Prisma.sql`r.requester_id=${u.userId} AND`:Prisma.empty}
   r.route_id IN (${Prisma.join([...routes])}) AND EXISTS(SELECT 1 FROM rie_canonical_entity_rows c
    WHERE c.company_id=${u.companyId} AND c.entity_name='Customers' AND lower(btrim(c.data->>'CustomerCode'))=lower(btrim(r.customer_code))
     AND lower(btrim(c.data->>'RouteID'))=r.route_id AND btrim(c.data->>'Channel')=r.channel)`;
 }
 private async row(tx:PrismaTx,u:AuthenticatedUser,id:string,scope:Prisma.Sql,lock=false){
  const rows=await tx.$queryRaw<PriceExceptionRequest[]>(Prisma.sql`SELECT ${fields},coalesce((SELECT jsonb_agg(e ORDER BY e.version) FROM(
   SELECT e.version,e.actor_id AS "actorId",e.actor_name AS "actorName",e.action,e.reason,e.evidence_type AS "evidenceType",e.evidence_reference AS "evidenceReference",e.evidence_attested AS "evidenceAttested",
    to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
   FROM sales_price_events e WHERE e.company_id=r.company_id AND e.request_id=r.id ORDER BY e.version LIMIT 3)e),'[]'::jsonb) AS events
   FROM sales_price_requests r WHERE r.company_id=${u.companyId} AND r.id=${id} AND ${scope} ${lock?Prisma.sql`FOR UPDATE OF r`:Prisma.empty}`);
  if(!rows[0])throw new NotFoundException();return rows[0];
 }
 private async customer(u:AuthenticatedUser,code:string){
  const r=await this.rie.queryCanonicalRecords({companyId:u.companyId!,requestingUser:{roleCode:u.roleCode,email:u.email},entityName:"Customers",projection:[{field:"CustomerCode"},{field:"RouteID"},{field:"Channel"}],scope:{customer:{values:[code]}},pagination:{limit:2}});
  if(r.records.length!==1)throw new NotFoundException();
  const channel=String(r.records[0]!.Channel??"").trim(),route=String(r.records[0]!.RouteID??"").trim().toLowerCase();
  if(!channel||channel.length>120||!route)throw new ConflictException("PRICE_CUSTOMER_SETUP");return {channel,route};
 }
 async list(u:AuthenticatedUser,input:unknown){
  const q=parse(priceExceptionListSchema,input);await this.admission(this.prisma,u);const scope=await this.scope(u);
  let cursor:Prisma.Sql=Prisma.empty;
  if(q.cursor){let c:any;try{c=JSON.parse(Buffer.from(q.cursor,"base64url").toString())}catch{throw new BadRequestException("PRICE_INVALID_CURSOR")}
   if(!Array.isArray(c)||c.length!==2||typeof c[0]!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(c[0])||!Number.isFinite(Date.parse(c[0]))||typeof c[1]!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c[1]))throw new BadRequestException("PRICE_INVALID_CURSOR");
   cursor=Prisma.sql`AND (r.created_at,r.id)<(${c[0]}::timestamptz,${c[1]})`;
  }
  const rows=await this.prisma.$queryRaw<PriceExceptionRequest[]>(Prisma.sql`SELECT ${fields},'[]'::jsonb AS events FROM sales_price_requests r
   WHERE r.company_id=${u.companyId} AND ${scope} ${q.status?Prisma.sql`AND r.status=${q.status}`:Prisma.empty} ${cursor} ORDER BY r.created_at DESC,r.id DESC LIMIT 21`);
  const items=rows.slice(0,20),last=items.at(-1);return {items,nextCursor:rows.length>20&&last?Buffer.from(JSON.stringify([last.createdAt,last.id])).toString("base64url"):null};
 }
 async read(u:AuthenticatedUser,id:string){await this.admission(this.prisma,u);return this.row(this.prisma,u,id,await this.scope(u));}
 async create(u:AuthenticatedUser,input:unknown){
  const b=parse(priceExceptionCreateSchema,input);if(this.stage(u)!==P.request)throw new ForbiddenException();await this.admission(this.prisma,u);
  if(!["visits.execute","sales.drafts.manage"].every(p=>u.permissions.includes(p)))throw new ForbiddenException();
  const ds=await this.prisma.$queryRaw<{customer_code:string}[]>(Prisma.sql`SELECT customer_code FROM sales_drafts WHERE company_id=${u.companyId} AND rep_id=${u.userId} AND id=${b.draftId}`);
  if(!ds[0])throw new NotFoundException();const customer=await this.customer(u,ds[0].customer_code);
  return this.command(u,null,b,async(tx)=>{
   const id=randomUUID();const count=await tx.$executeRaw(Prisma.sql`INSERT INTO sales_price_requests(id,company_id,requester_id,draft_id,draft_version,customer_code,customer_name,channel,route_id,product_id,product_code,product_name,unit,conversion_factor,kind,proposed_value,currency,reason,desired_from,desired_to)
    SELECT ${id},d.company_id,d.rep_id,d.id,d.version,d.customer_code,d.customer_name,${customer.channel},${customer.route},l.product_id,l.product_code,l.product_name,l.unit,l.conversion_factor,${b.kind},${b.value}::numeric,${b.currency},${b.reason},${b.desiredFrom}::date,${b.desiredTo}::date
    FROM sales_drafts d JOIN sales_draft_lines l ON l.company_id=d.company_id AND l.draft_id=d.id WHERE d.company_id=${u.companyId} AND d.id=${b.draftId} AND d.rep_id=${u.userId} AND d.status='DRAFT' AND d.version=${b.draftVersion} AND l.product_id=${b.productId}`);
   if(count!==1)throw new ConflictException("PRICE_DRAFT_CHANGED");await this.event(tx,u,id,0,"REQUEST",b,false);return id;
  });
 }
 async decide(u:AuthenticatedUser,id:string,input:unknown){
  const b=parse(priceExceptionDecisionSchema,input),stage=this.stage(u);
  if(stage!==P.review&&stage!==P.approve||stage===P.review&&b.decision!=="FORWARD"||stage===P.approve&&b.decision==="FORWARD")throw new ForbiddenException();
  await this.admission(this.prisma,u);const scope=await this.scope(u),current=await this.row(this.prisma,u,id,scope);const c=await this.customer(u,current.customerCode);
  if(c.channel!==current.channel||c.route!==current.routeId)throw new ConflictException("PRICE_CUSTOMER_CHANGED");
  return this.command(u,id,b,async tx=>{
   const r=await this.row(tx,u,id,scope,true);
   if(r.version!==b.version||r.status!==(stage===P.review?"SUBMITTED":"REVIEWED"))throw new ConflictException("PRICE_STALE");
   if([r.requesterId,r.reviewedBy].includes(u.userId))throw new ForbiddenException("PRICE_DISTINCT_ACTORS");
   await tx.$executeRaw(Prisma.sql`UPDATE sales_price_requests SET status=${b.decision==="REJECT"?"REJECTED":b.decision==="FORWARD"?"REVIEWED":"APPROVED"},version=version+1,updated_at=now(),
    reviewed_by=${stage===P.review?u.userId:r.reviewedBy},decided_by=${stage===P.approve?u.userId:null} WHERE company_id=${u.companyId} AND id=${id}`);
   await this.event(tx,u,id,r.version+1,b.decision,b,true);return id;
  });
 }
 private async event(tx:PrismaTx,u:AuthenticatedUser,id:string,version:number,action:string,b:{reason:string;evidenceType:string;evidenceReference:string},attested:boolean){
  await tx.$executeRaw(Prisma.sql`INSERT INTO sales_price_events(company_id,request_id,version,actor_id,actor_name,action,reason,evidence_type,evidence_reference,evidence_attested)
   SELECT ${u.companyId},${id},${version},u.id,u.full_name,${action},${b.reason},${b.evidenceType},${b.evidenceReference},${attested} FROM users u WHERE u.company_id=${u.companyId} AND u.id=${u.userId}`);
 }
 private async command(u:AuthenticatedUser,id:string|null,b:PriceExceptionCreate|PriceExceptionDecision,work:(tx:PrismaTx)=>Promise<string>){
  const hash=createHash("sha256").update(JSON.stringify({id,body:b})).digest("hex");
  try{return await this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true),set_config('murshidak.price_actor',${u.userId},true)`;
   await this.admission(tx,u,true);await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([u.companyId,u.userId,b.commandKey])},0))`);
   const prior=await tx.$queryRaw<{payload_hash:string;result:PriceExceptionRequest}[]>(Prisma.sql`SELECT payload_hash,result FROM sales_price_commands WHERE company_id=${u.companyId} AND actor_id=${u.userId} AND command_key=${b.commandKey}`);
   if(prior[0]){if(prior[0].payload_hash!==hash)throw new ConflictException("PRICE_COMMAND_CONFLICT");return prior[0].result;}
   const requestId=await work(tx),result=await this.row(tx,u,requestId,Prisma.sql`TRUE`);
   await tx.$executeRaw(Prisma.sql`INSERT INTO sales_price_commands(company_id,actor_id,command_key,payload_hash,request_id,result) VALUES(${u.companyId},${u.userId},${b.commandKey},${hash},${requestId},${JSON.stringify(result)}::jsonb)`);
   await this.audit.record({companyId:u.companyId,userId:u.userId,action:"sales_price_exception."+(id?(b as PriceExceptionDecision).decision.toLowerCase():"request"),entityType:"SalesPriceRequest",entityId:requestId,eventKey:`sales-price:${u.companyId}:${u.userId}:${b.commandKey}`,metadata:{version:result.version,status:result.status,priceBefore:null,proposedValue:result.value,activation:"REQUIRES_SETUP"}},tx);return result;
  },{timeout:15000,maxWait:5000});}catch(e){if(e instanceof HttpException)throw e;const err=e as {message?:string;code?:string;meta?:{message?:string;code?:string}};const code=`${err.message} ${err.meta?.message}`.match(/PRICE_[A-Z_]+/)?.[0];if(code)throw new ConflictException(code);if(err.code==="P2002"||err.code==="23505"||err.meta?.code==="23505")throw new ConflictException("PRICE_DUPLICATE_OPEN");throw e;}
 }
}
