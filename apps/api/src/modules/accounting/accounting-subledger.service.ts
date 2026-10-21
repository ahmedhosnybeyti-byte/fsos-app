import { BadRequestException,ForbiddenException,Injectable,NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ZodType,ZodTypeDef } from "zod";
import { Prisma } from "@field-sales-os/database";
import { accountingOpeningSchema,accountingPageSchema,accountingPartyQuerySchema,accountingPartySchema,accountingReverseSchema,accountingSettlementSchema,accountingTreasurySchema,type AccountingParty,type AccountingPartyKind,type AccountingTreasury,type AccountingVoucher,type AccountingVoucherResult } from "@field-sales-os/schemas";
import { PrismaService,type PrismaTx } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AccountingService } from "./accounting.service";

function parse<T>(schema:ZodType<T,ZodTypeDef,unknown>,input:unknown):T {
 const result=schema.safeParse(input);if(!result.success)throw new BadRequestException({message:"ACC_INVALID_INPUT",errors:result.error.flatten()});return result.data;
}
const size=20;
function page<T>(rows:T[],n:number){return {items:rows.slice(0,size),page:n,hasMore:rows.length>size};}
const readPermission=(kind:AccountingPartyKind)=>kind==="CUSTOMER"?"accounting.ar.read":"accounting.ap.read";
@Injectable()
export class AccountingSubledgerService {
 constructor(private readonly prisma:PrismaService,private readonly core:AccountingService,private readonly audit:AuditLogService){}
 private async party(tx:PrismaTx,user:AuthenticatedUser,id:string,permission?:string,lock=false){
  const c=await this.core.authorizedScope(tx,user,permission??"accounting.read",lock);
  const rows=await tx.$queryRaw<{id:string;kind:AccountingPartyKind;accountCode:string}[]>(Prisma.sql`SELECT id,kind,account_code AS "accountCode" FROM accounting_parties WHERE company_id=${c} AND id=${id}`);
  if(!rows.length)throw new NotFoundException("ACC_PARTY_NOT_FOUND");const p=rows[0]!;
  if(!user.permissions.includes(readPermission(p.kind)))throw new ForbiddenException("Party accounting permission required");return {company:c,party:p};
 }
 async parties(user:AuthenticatedUser,input:unknown){
  const {kind,page:n,search}=parse(accountingPartyQuerySchema,input);const c=await this.core.authorizedScope(this.prisma,user,readPermission(kind));
  return page(await this.prisma.$queryRaw<AccountingParty[]>(Prisma.sql`WITH selected AS MATERIALIZED (
   SELECT id,kind,code,name,account_code FROM accounting_parties WHERE company_id=${c} AND kind=${kind}
   AND position(lower(${search}) in lower(code||' '||name))>0 ORDER BY code LIMIT ${size+1} OFFSET ${(n-1)*size}
  ), balances AS (
   SELECT l.account_code,sum(l.debit-l.credit) AS net FROM accounting_lines l JOIN selected p ON p.account_code=l.account_code
   JOIN accounting_journals j ON j.company_id=${c} AND j.id=l.journal_id AND j.status='POSTED' WHERE l.company_id=${c} GROUP BY l.account_code
  ) SELECT p.id,p.kind,p.code,p.name,p.account_code AS "accountCode",(coalesce(b.net,0)*CASE WHEN p.kind='CUSTOMER' THEN 1 ELSE -1 END)::numeric(30,2)::text AS balance,
   EXISTS(SELECT 1 FROM accounting_vouchers v WHERE v.company_id=${c} AND v.party_id=p.id AND v.kind='OPENING') AS "openingPosted"
   FROM selected p LEFT JOIN balances b ON b.account_code=p.account_code ORDER BY p.code`),n);
 }
 async createParty(user:AuthenticatedUser,input:unknown){
  const data=parse(accountingPartySchema,input);
  return this.core.authorizedMutation(async tx=>{
   const c=await this.core.authorizedScope(tx,user,"accounting.parties.manage",true);
   if(!user.permissions.includes(readPermission(data.kind)))throw new ForbiddenException("Party accounting permission required");
   const id=randomUUID();await tx.$executeRaw(Prisma.sql`INSERT INTO accounting_parties(id,company_id,kind,code,name,account_code) VALUES(${id},${c},${data.kind},${data.code},${data.name},${data.accountCode})`);
   await this.audit.record({companyId:c,userId:user.userId,action:"accounting.party.created",entityType:"AccountingParty",entityId:id,metadata:data},tx);return {id,...data};
  });
 }
 async partySummary(user:AuthenticatedUser,id:string){
  const {company:c}=await this.party(this.prisma,user,id);
  const rows=await this.prisma.$queryRaw<AccountingParty[]>(Prisma.sql`SELECT p.id,p.kind,p.code,p.name,p.account_code AS "accountCode",
   (coalesce(b.net,0)*CASE WHEN p.kind='CUSTOMER' THEN 1 ELSE -1 END)::numeric(30,2)::text AS balance,
   EXISTS(SELECT 1 FROM accounting_vouchers v WHERE v.company_id=${c} AND v.party_id=p.id AND v.kind='OPENING') AS "openingPosted"
   FROM accounting_parties p CROSS JOIN LATERAL(SELECT sum(debit-credit) AS net FROM accounting_lines WHERE company_id=${c} AND account_code=p.account_code) b
   WHERE p.company_id=${c} AND p.id=${id}`);return rows[0]!;
 }
 async treasury(user:AuthenticatedUser,input:unknown){
  const {page:n,search}=parse(accountingPageSchema,input);const c=await this.core.authorizedScope(this.prisma,user,"accounting.treasury.read");
  return page(await this.prisma.$queryRaw<AccountingTreasury[]>(Prisma.sql`WITH selected AS MATERIALIZED (
   SELECT t.account_code,t.kind,a.name FROM accounting_treasury t JOIN accounting_accounts a ON a.company_id=${c} AND a.code=t.account_code
   WHERE t.company_id=${c} AND position(lower(${search}) in lower(t.account_code||' '||a.name))>0 ORDER BY t.account_code LIMIT ${size+1} OFFSET ${(n-1)*size}
  ), balances AS (
   SELECT l.account_code,sum(l.debit-l.credit) AS net FROM accounting_lines l JOIN selected s ON s.account_code=l.account_code
   JOIN accounting_journals j ON j.company_id=${c} AND j.id=l.journal_id AND j.status='POSTED' WHERE l.company_id=${c} GROUP BY l.account_code
  ) SELECT s.account_code AS "accountCode",s.kind,s.name,coalesce(b.net,0)::numeric(30,2)::text AS balance FROM selected s LEFT JOIN balances b ON b.account_code=s.account_code ORDER BY s.account_code`),n);
 }
 async registerTreasury(user:AuthenticatedUser,input:unknown){
  const data=parse(accountingTreasurySchema,input);
  return this.core.authorizedMutation(async tx=>{
   const c=await this.core.authorizedScope(tx,user,"accounting.treasury.manage",true);
   if(!user.permissions.includes("accounting.treasury.read"))throw new ForbiddenException("Treasury read permission required");
   await tx.$executeRaw(Prisma.sql`INSERT INTO accounting_treasury(company_id,account_code,kind) VALUES(${c},${data.accountCode},${data.kind})`);
   await this.audit.record({companyId:c,userId:user.userId,action:"accounting.treasury.registered",entityType:"AccountingTreasury",entityId:data.accountCode,metadata:data},tx);return data;
  });
 }
 async statement(user:AuthenticatedUser,id:string,input:unknown){
  const {page:n}=parse(accountingPageSchema,input);const {company:c,party:p}=await this.party(this.prisma,user,id);
  const rows=await this.prisma.$queryRaw<AccountingVoucher[]>(Prisma.sql`SELECT v.id,v.party_id AS "partyId",v.kind,to_char(v.entry_date,'YYYY-MM-DD') AS date,v.reference,
   v.amount::numeric(30,2)::text AS amount,v.counter_account_code AS "counterAccountCode",v.journal_id AS "journalId",v.reversal_of AS "reversalOf",v.origin,v.reason,v.actor_id AS "actorId",
   to_char(v.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",l.debit::numeric(30,2)::text AS debit,l.credit::numeric(30,2)::text AS credit,
   EXISTS(SELECT 1 FROM accounting_vouchers r WHERE r.company_id=${c} AND r.reversal_of=v.id) AS reversed
   FROM accounting_vouchers v JOIN accounting_lines l ON l.company_id=${c} AND l.journal_id=v.journal_id AND l.account_code=${p.accountCode}
   WHERE v.company_id=${c} AND v.party_id=${id} ORDER BY v.entry_date DESC,v.created_at DESC,v.id DESC LIMIT ${size+1} OFFSET ${(n-1)*size}`);
  return page(rows,n);
 }
 async receipt(user:AuthenticatedUser,input:unknown){return this.post(user,"RECEIPT",input);}
 async payment(user:AuthenticatedUser,input:unknown){return this.post(user,"PAYMENT",input);}
 async opening(user:AuthenticatedUser,input:unknown){return this.post(user,"OPENING",input);}
 private async post(user:AuthenticatedUser,kind:"RECEIPT"|"PAYMENT"|"OPENING",input:unknown){
  const data=kind==="OPENING"?parse(accountingOpeningSchema,input):parse(accountingSettlementSchema,input);
  const permission=kind==="OPENING"?"accounting.opening.post":kind==="RECEIPT"?"accounting.receipts.post":"accounting.payments.post";
  const {idempotencyKey,partyId,...body}=data;
  return this.core.authorizedMutation(async tx=>{
   const {company:c}=await this.party(tx,user,partyId,permission,true);
   if(kind!=="OPENING"&&!user.permissions.includes("accounting.treasury.read"))throw new ForbiddenException("Treasury read permission required");
   const rows=await tx.$queryRaw<{result:AccountingVoucherResult}[]>(Prisma.sql`SELECT accounting_post_voucher(${c},${user.userId},${idempotencyKey},${partyId},${kind},${JSON.stringify(body)}::jsonb,${randomUUID()},${randomUUID()},NULL) AS result`);
   const result=rows[0]!.result;
   await this.audit.record({companyId:c,userId:user.userId,action:`accounting.voucher.${kind.toLowerCase()}`,entityType:"AccountingVoucher",entityId:result.voucherId,eventKey:`accounting:${c}:${idempotencyKey}`,metadata:{...result,partyId,...body}},tx);return result;
  });
 }
 async reverse(user:AuthenticatedUser,partyId:string,voucherId:string,input:unknown){
  const {idempotencyKey,...body}=parse(accountingReverseSchema,input);
  return this.core.authorizedMutation(async tx=>{
   const {company:c}=await this.party(tx,user,partyId,"accounting.journal.reverse",true);
   const rows=await tx.$queryRaw<{result:AccountingVoucherResult}[]>(Prisma.sql`SELECT accounting_post_voucher(${c},${user.userId},${idempotencyKey},${partyId},'REVERSAL',${JSON.stringify(body)}::jsonb,${randomUUID()},${randomUUID()},${voucherId}) AS result`);
   const result=rows[0]!.result;
   await this.audit.record({companyId:c,userId:user.userId,action:"accounting.voucher.reversed",entityType:"AccountingVoucher",entityId:result.voucherId,eventKey:`accounting:${c}:${idempotencyKey}`,metadata:{...result,partyId,sourceVoucherId:voucherId,...body}},tx);return result;
  });
 }
}
