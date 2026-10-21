import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ZodType, ZodTypeDef } from "zod";
import { Prisma } from "@field-sales-os/database";
import { accountingAccountSchema, accountingCloseSchema, accountingJournalQuerySchema, accountingPageSchema, accountingPostSchema, accountingReverseSchema, accountingTrialQuerySchema, type AccountingAccount, type AccountingBook, type AccountingJournal, type AccountingLine, type AccountingResult, type AccountingTrial } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";

function parse<T>(schema: ZodType<T,ZodTypeDef,unknown>, input: unknown): T {
  const result=schema.safeParse(input);
  if(!result.success) throw new BadRequestException({message:"ACC_INVALID_INPUT",errors:result.error.flatten()});
  return result.data;
}
const size=20;
function page<T>(rows:T[],n:number) {return {items:rows.slice(0,size),page:n,hasMore:rows.length>size};}
const journalFields=Prisma.sql`j.id,to_char(j.entry_date,'YYYY-MM-DD') AS date,j.reference,j.reason,j.kind,j.reversal_of AS "reversalOf",j.correction_of AS "correctionOf",j.actor_id AS "actorId",
 to_char(j.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
 EXISTS(SELECT 1 FROM accounting_journals r WHERE r.company_id=j.company_id AND r.reversal_of=j.id) AS reversed`;

@Injectable()
export class AccountingService {
  constructor(private readonly prisma:PrismaService,private readonly audit:AuditLogService) {}
  private async scope(tx:PrismaTx,user:AuthenticatedUser,permission="accounting.read",lock=false) {
    if(!user.companyId || !["COMPANY_ADMIN","MANAGER"].includes(user.roleCode) ||
      !["sfa.access","accounting.read",permission].every(p=>user.permissions?.includes(p)))
      throw new ForbiddenException("Accounting company context and explicit permissions required");
    // Mode is checked again inside each mutation transaction. No JWT/body mode.
    const rows=await tx.$queryRaw<{company_id:string}[]>(Prisma.sql`SELECT s.company_id FROM company_operating_settings s
      JOIN users u ON u.company_id=s.company_id AND u.id=${user.userId} AND u.status='ACTIVE'
      WHERE s.company_id=${user.companyId} AND s.operating_mode='FULL_ERP' ${lock?Prisma.sql`FOR SHARE OF s,u`:Prisma.empty}`);
    if(!rows.length) throw new ForbiddenException("Accounting requires an active Full ERP company user");
    return user.companyId;
  }
  private async mutation<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>) {
    try {return await this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)`;
      return work(tx);
    },{maxWait:5000,timeout:15000});}
    catch(error) {
      const e=error as {code?:string;meta?:{code?:string;message?:string};message?:string};
      const code=`${e.meta?.message??""} ${e.message??""}`.match(/ACC_[A-Z_]+/)?.[0];
      if(code)throw new ConflictException(code);
      if(e.code==="P2002"||e.meta?.code==="23505"||e.code==="23505")throw new ConflictException("ACC_DUPLICATE_REFERENCE");
      if(e.code==="23503"||e.meta?.code==="23503")throw new ConflictException("ACC_UNKNOWN_COMPANY_ACCOUNT");
      throw error;
    }
  }
  async book(user:AuthenticatedUser) {
    const c=await this.scope(this.prisma,user);
    const rows=await this.prisma.$queryRaw<AccountingBook[]>(Prisma.sql`SELECT currency,to_char(closed_through,'YYYY-MM-DD') AS "closedThrough" FROM accounting_books WHERE company_id=${c}`);
    return rows[0]??{currency:"SAR" as const,closedThrough:null};
  }
  async accounts(user:AuthenticatedUser,input:unknown) {
    const {page:n,search}=parse(accountingPageSchema,input);const c=await this.scope(this.prisma,user);
    return page(await this.prisma.$queryRaw<AccountingAccount[]>(Prisma.sql`SELECT code,name,type FROM accounting_accounts WHERE company_id=${c}
      AND (position(lower(${search}) in lower(code))>0 OR position(lower(${search}) in lower(name))>0)
      ORDER BY code LIMIT ${size+1} OFFSET ${(n-1)*size}`),n);
  }
  async createAccount(user:AuthenticatedUser,input:unknown) {
    const data=parse(accountingAccountSchema,input);
    return this.mutation(async tx=>{
      const c=await this.scope(tx,user,"accounting.accounts.manage",true);
      await tx.$executeRaw(Prisma.sql`INSERT INTO accounting_books(company_id) VALUES(${c}) ON CONFLICT DO NOTHING`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO accounting_accounts(company_id,code,name,type) VALUES(${c},${data.code},${data.name},${data.type})`);
      await this.audit.record({companyId:c,userId:user.userId,action:"accounting.account.created",entityType:"AccountingAccount",entityId:data.code,metadata:data},tx);
      return data;
    });
  }
  async journals(user:AuthenticatedUser,input:unknown) {
    const {page:n,search,from,to}=parse(accountingJournalQuerySchema,input);const c=await this.scope(this.prisma,user);
    return page(await this.prisma.$queryRaw<AccountingJournal[]>(Prisma.sql`WITH entries AS MATERIALIZED (
      SELECT id,company_id,entry_date,reference,reason,kind,reversal_of,correction_of,actor_id,created_at FROM accounting_journals
      WHERE company_id=${c} AND status='POSTED' ${from?Prisma.sql`AND entry_date>=${from}::date`:Prisma.empty}
      ${to?Prisma.sql`AND entry_date<=${to}::date`:Prisma.empty} AND position(lower(${search}) in lower(reference))>0
      ORDER BY entry_date DESC,id DESC LIMIT ${size+1} OFFSET ${(n-1)*size}
    ) SELECT ${journalFields},a.debit,a.credit FROM entries j CROSS JOIN LATERAL (
      SELECT sum(debit)::numeric(30,2)::text AS debit,sum(credit)::numeric(30,2)::text AS credit
      FROM accounting_lines WHERE company_id=${c} AND journal_id=j.id) a ORDER BY j.entry_date DESC,j.id DESC`),n);
  }
  async journal(user:AuthenticatedUser,id:string) {
    const c=await this.scope(this.prisma,user);
    const rows=await this.prisma.$queryRaw<AccountingLine[]>(Prisma.sql`SELECT l.account_code AS "accountCode",a.name AS "accountName",l.debit::numeric(30,2)::text AS debit,l.credit::numeric(30,2)::text AS credit,l.memo
      FROM accounting_journals j JOIN accounting_lines l ON l.company_id=${c} AND l.journal_id=j.id
      JOIN accounting_accounts a ON a.company_id=${c} AND a.code=l.account_code WHERE j.company_id=${c} AND j.id=${id} AND j.status='POSTED' ORDER BY l.line_no LIMIT 100`);
    if(!rows.length)throw new NotFoundException("Journal not found");return {items:rows};
  }
  async trial(user:AuthenticatedUser,input:unknown) {
    const {page:n,asOf,search}=parse(accountingTrialQuerySchema,input);const c=await this.scope(this.prisma,user);
    // One scoped fact aggregation. Grand totals cover the entire company chart,
    // not just this page/search. Never fetch ledger pages for Node aggregation.
    const rows=await this.prisma.$queryRaw<AccountingTrial[]>(Prisma.sql`WITH movement AS MATERIALIZED (
      SELECT l.account_code,sum(l.debit) AS dr,sum(l.credit) AS cr FROM accounting_journals j
      JOIN accounting_lines l ON l.company_id=${c} AND l.journal_id=j.id
      WHERE j.company_id=${c} AND j.status='POSTED' AND j.entry_date<=${asOf}::date GROUP BY l.account_code
    ), balances AS MATERIALIZED (
      SELECT a.code,a.name,a.type,coalesce(m.dr,0) AS dr,coalesce(m.cr,0) AS cr,
      greatest(coalesce(m.dr,0)-coalesce(m.cr,0),0) AS bd,greatest(coalesce(m.cr,0)-coalesce(m.dr,0),0) AS bc
      FROM accounting_accounts a LEFT JOIN movement m ON m.account_code=a.code WHERE a.company_id=${c}
    ), selected AS (
      SELECT code,name,type,dr::numeric(30,2)::text AS debit,cr::numeric(30,2)::text AS credit,bd::numeric(30,2)::text AS "balanceDebit",bc::numeric(30,2)::text AS "balanceCredit"
      FROM balances WHERE position(lower(${search}) in lower(code||' '||name))>0 ORDER BY code LIMIT ${size} OFFSET ${(n-1)*size}
    ) SELECT coalesce((SELECT jsonb_agg(selected ORDER BY code) FROM selected),'[]'::jsonb) AS items,
      ${n}::int AS page,(SELECT count(*)>${n*size} FROM balances WHERE position(lower(${search}) in lower(code||' '||name))>0) AS "hasMore",${asOf}::text AS "asOf",
      jsonb_build_object('debit',coalesce(sum(dr),0)::numeric(30,2)::text,'credit',coalesce(sum(cr),0)::numeric(30,2)::text,
        'balanceDebit',coalesce(sum(bd),0)::numeric(30,2)::text,'balanceCredit',coalesce(sum(bc),0)::numeric(30,2)::text) AS totals FROM balances`);
    return rows[0]!;
  }
  async post(user:AuthenticatedUser,input:unknown) {return this.command(user,"POST",null,input);}
  async reverse(user:AuthenticatedUser,id:string,input:unknown) {return this.command(user,"REVERSE",id,input);}
  async correct(user:AuthenticatedUser,id:string,input:unknown) {return this.command(user,"CORRECT",id,input);}
  private async command(user:AuthenticatedUser,action:"POST"|"REVERSE"|"CORRECT",id:string|null,input:unknown) {
    const data=action==="REVERSE"?parse(accountingReverseSchema,input):parse(accountingPostSchema,input);
    const {idempotencyKey,...body}=data;
    return this.mutation(async tx=>{
      const c=await this.scope(tx,user,action==="POST"?"accounting.journal.post":"accounting.journal.reverse",true);
      if(action==="CORRECT"&&!user.permissions.includes("accounting.journal.post"))throw new ForbiddenException("Posting permission also required for correction");
      const rows=await tx.$queryRaw<{result:AccountingResult}[]>(Prisma.sql`SELECT accounting_post_command(${c},${user.userId},${idempotencyKey},${action},${id},${JSON.stringify(body)}::jsonb,${randomUUID()},${randomUUID()}) AS result`);
      const result=rows[0]!.result;
      await this.audit.record({companyId:c,userId:user.userId,action:`accounting.journal.${action.toLowerCase()}`,entityType:"AccountingJournal",entityId:result.journalId,
        eventKey:`accounting:${c}:${idempotencyKey}`,metadata:{...result,sourceJournalId:id,date:data.date,reason:data.reason}},tx);
      return result;
    });
  }
  async closePeriod(user:AuthenticatedUser,input:unknown) {
    const data=parse(accountingCloseSchema,input);
    return this.mutation(async tx=>{
      const c=await this.scope(tx,user,"accounting.period.close",true);
      const rows=await tx.$queryRaw<{closedThrough:string|null}[]>(Prisma.sql`SELECT to_char(closed_through,'YYYY-MM-DD') AS "closedThrough" FROM accounting_books WHERE company_id=${c} FOR UPDATE`);
      if(!rows.length)throw new ConflictException("ACC_BOOK_REQUIRED");
      const previous=rows[0]!.closedThrough;
      if(previous && data.through<=previous)throw new ConflictException("ACC_PERIOD_ALREADY_CLOSED");
      await tx.$executeRaw(Prisma.sql`UPDATE accounting_books SET closed_through=${data.through}::date WHERE company_id=${c}`);
      await this.audit.record({companyId:c,userId:user.userId,action:"accounting.period.closed",entityType:"AccountingBook",entityId:c,metadata:{previous,...data}},tx);
      return {closedThrough:data.through};
    });
  }
}
