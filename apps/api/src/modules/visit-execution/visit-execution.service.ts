import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@field-sales-os/database";
import { saveVisitExecutionSchema, startVisitExecutionSchema, visitPhotoKinds, type VisitExecution } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuditLogService } from "../audit-log/audit-log.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../files/storage/storage-provider.interface";
import { RieFacade } from "../rie/rie-facade.service";
import { VisitCopilotService } from "../visit-copilot/visit-copilot.service";

type VisitRow = Omit<VisitExecution, "startedAt" | "completedAt"> & {
  startedAt: Date; completedAt: Date | null; lastCommandKey: string | null; lastCommandHash: string | null;
};
const projection = Prisma.sql`id, customer_code AS "customerCode", customer_name AS "customerName", rep_name AS "repName",
  entry_source AS "entrySource", source_reference AS "sourceReference", status, version, goal, notes, outcome,
  failure_reason AS "failureReason", reason_detail AS "reasonDetail", started_at AS "startedAt", completed_at AS "completedAt",
  last_command_key AS "lastCommandKey", last_command_hash AS "lastCommandHash"`;
const photoBody = z.object({ kind: z.enum(visitPhotoKinds), requestKey: z.string().uuid() }).strict();
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const numberOrNull = (value: unknown) => value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);

// Actual file bytes, never client MIME/extension, determine the allowed media.
export function visitImageType(bytes: Buffer): string | null {
  if (bytes.length >= 12 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString("ascii",12,16) === "IHDR") return "image/png";
  if (bytes.length >= 16 && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP" && ["VP8 ","VP8L","VP8X"].includes(bytes.toString("ascii",12,16))) return "image/webp";
  return null;
}

@Injectable()
export class VisitExecutionService {
  private readonly logger = new Logger(VisitExecutionService.name);
  constructor(private readonly prisma: PrismaService, private readonly rie: RieFacade,
    private readonly copilot: VisitCopilotService, private readonly audit: AuditLogService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  private actor(user: AuthenticatedUser) {
    if (!user.companyId || user.roleCode !== "SALES_REP" || !["sfa.access", "visits.execute"].every((p) => user.permissions?.includes(p))) throw new ForbiddenException();
    return user.companyId;
  }
  private rieContext(user: AuthenticatedUser) {
    return { companyId: this.actor(user), requestingUser: { roleCode: user.roleCode, email: user.email } };
  }
  private async customer(user: AuthenticatedUser, code: string) {
    const result = await this.rie.queryCanonicalRecords({ ...this.rieContext(user), entityName: "Customers",
      projection: [{ field: "CustomerCode" }, { field: "CustomerName" }], scope: { customer: { values: [code] } }, pagination: { limit: 1 } });
    if (!result.records[0]) throw new NotFoundException();
    return result.records[0];
  }
  private async owned(user: AuthenticatedUser, id: string, tx: PrismaTx = this.prisma, lock = false): Promise<VisitRow> {
    const companyId = this.actor(user);
    const rows = await tx.$queryRaw<VisitRow[]>(Prisma.sql`SELECT ${projection} FROM visit_executions
      WHERE company_id=${companyId} AND rep_id=${user.userId} AND id=${id} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }
  private publicRow(row: VisitRow): VisitExecution {
    const { lastCommandKey: _key, lastCommandHash: _hash, ...rest } = row;
    return { ...rest, startedAt: row.startedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null };
  }
  async start(user: AuthenticatedUser, input: unknown) {
    const companyId = this.actor(user);
    const body = new ZodValidationPipe(startVisitExecutionSchema).transform(input) as z.infer<typeof startVisitExecutionSchema>;
    // Future entry kinds are persisted in the model, but their resource adapters
    // must be implemented/authorized before they can be submitted here.
    if (body.entrySource !== "VISIT_COPILOT" || body.sourceReference) throw new BadRequestException("Entry adapter is not available");
    const customer = await this.customer(user, body.customerCode);
    const customerCode = String(customer.CustomerCode).trim();
    const rep = await this.prisma.user.findFirst({ where: { id: user.userId, companyId, status: "ACTIVE" }, select: { fullName: true } });
    if (!rep) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      // Serialize starts per actor, including retries with different browser keys.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([companyId,user.userId])},0))`);
      const existing = await tx.$queryRaw<VisitRow[]>(Prisma.sql`SELECT ${projection} FROM visit_executions
        WHERE company_id=${companyId} AND rep_id=${user.userId} AND id IN
        (SELECT visit_id FROM visit_execution_starts WHERE company_id=${companyId} AND rep_id=${user.userId} AND request_key=${body.requestKey}) LIMIT 1`);
      if (existing[0]) {
        if (existing[0].customerCode.toLowerCase() !== customerCode.toLowerCase()) throw new ConflictException();
        return this.publicRow(existing[0]);
      }
      const open = await tx.$queryRaw<VisitRow[]>(Prisma.sql`SELECT ${projection} FROM visit_executions
        WHERE company_id=${companyId} AND rep_id=${user.userId} AND lower(btrim(customer_code))=lower(${customerCode}) AND status='OPEN' LIMIT 1`);
      if (open[0]) {
        await tx.$executeRaw(Prisma.sql`INSERT INTO visit_execution_starts(company_id,rep_id,request_key,visit_id) VALUES (${companyId},${user.userId},${body.requestKey},${open[0].id})`);
        return this.publicRow(open[0]);
      }
      const rows = await tx.$queryRaw<VisitRow[]>(Prisma.sql`INSERT INTO visit_executions
        (id,company_id,rep_id,customer_code,customer_name,rep_name,entry_source,request_key)
        VALUES (${randomUUID()},${companyId},${user.userId},${customerCode},${String(customer.CustomerName ?? customerCode)},${rep.fullName},${body.entrySource},${body.requestKey}) RETURNING ${projection}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO visit_execution_starts(company_id,rep_id,request_key,visit_id) VALUES (${companyId},${user.userId},${body.requestKey},${rows[0]!.id})`);
      await this.audit.record({ companyId, userId: user.userId, action: "visit.started", entityType: "VisitExecution", entityId: rows[0]!.id }, tx);
      return this.publicRow(rows[0]!);
    });
  }
  async read(user: AuthenticatedUser, id: string) {
    const row = await this.owned(user, id);
    await this.customer(user, row.customerCode); // Reassignment revokes visit/photo access too.
    const photos = await this.prisma.$queryRaw<Array<{ id: string; kind: string; createdAt: Date }>>(Prisma.sql`
      SELECT id,kind,created_at AS "createdAt" FROM visit_execution_photos WHERE company_id=${user.companyId} AND visit_id=${id} ORDER BY created_at,id LIMIT 30`);
    return { visit: this.publicRow(row), photos: photos.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })) };
  }
  async save(user: AuthenticatedUser, id: string, input: unknown) {
    const body = new ZodValidationPipe(saveVisitExecutionSchema).transform(input) as z.infer<typeof saveVisitExecutionSchema>;
    const current = await this.owned(user, id);
    await this.customer(user, current.customerCode);
    const digest = hash(JSON.stringify(body));
    return this.prisma.$transaction(async (tx) => {
      const row = await this.owned(user, id, tx, true);
      if (row.lastCommandKey === body.commandKey) {
        if (row.lastCommandHash !== digest) throw new ConflictException();
        return this.publicRow(row);
      }
      if (row.status !== "OPEN" || row.version !== body.version) throw new ConflictException("Visit changed; reload before saving");
      const rows = await tx.$queryRaw<VisitRow[]>(Prisma.sql`UPDATE visit_executions SET goal=${body.goal},notes=${body.notes},outcome=${body.outcome},
        failure_reason=${body.failureReason},reason_detail=${body.reasonDetail},version=version+1,
        status=${body.finish ? "COMPLETED" : "OPEN"},completed_at=${body.finish ? new Date() : null},
        last_command_key=${body.commandKey},last_command_hash=${digest}
        WHERE company_id=${user.companyId} AND rep_id=${user.userId} AND id=${id} RETURNING ${projection}`);
      await this.audit.record({ companyId: user.companyId, userId: user.userId, action: body.finish ? "visit.completed" : "visit.saved", entityType: "VisitExecution", entityId: id, metadata: { version: rows[0]!.version } }, tx);
      return this.publicRow(rows[0]!);
    });
  }
  async context(user: AuthenticatedUser, id: string) {
    const visit = await this.owned(user, id);
    // One request plan includes the existing briefing, hierarchy and source
    // metadata, not just the four supplemental reads. Reuse Copilot's existing
    // 24-execution ceiling; nested consumers share its scope/cache and budget.
    return this.rie.runPlannedRequest({ name: "visit_execution.context", maxConcurrentOperations: 2, maxOperations: 24 }, async () => {
      const briefing = await this.copilot.briefing(user, visit.customerCode, { period: "3m", vanStock: false });
      const ctx = this.rieContext(user);
      const range = briefing.period;
      const [invoice, payment, returns, importedVisits] = await Promise.all([
        this.rie.queryCanonicalRecords({ ...ctx, entityName: "Invoices", projection: ["InvoiceNo","InvoiceDate","TotalAfterVAT"].map((field) => ({ field })),
          scope: { customer: { values: [visit.customerCode] }, date: { field: "InvoiceDate", from: range.from, to: range.to }, fields: [{ field: "InvoiceStatus", values: ["Confirmed"] }] },
          orderBy: [{ field: { field: "InvoiceDate" }, direction: "desc" }, { field: { field: "InvoiceNo" }, direction: "desc" }], pagination: { limit: 1 } }),
        this.rie.queryCanonicalRecords({ ...ctx, entityName: "Collections", projection: ["CollectionNo","CollectionDate","Amount"].map((field) => ({ field })),
          scope: { customer: { values: [visit.customerCode] }, date: { field: "CollectionDate", from: range.from, to: range.to }, fields: [{ field: "Status", values: ["Collected", "Cleared"] }] },
          orderBy: [{ field: { field: "CollectionDate" }, direction: "desc" }, { field: { field: "CollectionNo" }, direction: "desc" }], pagination: { limit: 1 } }),
        this.rie.queryCanonicalRecords({ ...ctx, entityName: "Return Items", projection: [{ field: "ProductCode" }, { field: "ReturnReason" }],
          joins: [{ entityName: "Returns", alias: "header", on: { left: { field: "ReturnNo" }, rightField: "ReturnNo" } }], hierarchyRoute: { field: "RouteID", source: "header" },
          scope: { customer: { values: [visit.customerCode], source: "header" }, date: { field: "ReturnDate", source: "header", from: range.from, to: range.to }, fields: [{ field: "Status", source: "header", values: ["Confirmed", "Approved"] }] },
          groupBy: [{ field: "ProductCode" }, { field: "ReturnReason" }], aggregates: [{ op: "sum", field: "Amount", as: "amount" }],
          orderBy: [{ aggregate: "amount", direction: "desc" }], pagination: { limit: 8 } }),
        this.rie.queryCanonicalRecords({ ...ctx, entityName: "Visits", projection: ["VisitID", "VisitDate", "Notes"].map((field) => ({ field })),
          scope: { customer: { values: [visit.customerCode] }, date: { field: "VisitDate", from: range.from, to: range.to } },
          orderBy: [{ field: { field: "VisitDate" }, direction: "desc" }, { field: { field: "VisitID" }, direction: "desc" }], pagination: { limit: 10 } }),
      ]);
      const notes = await this.prisma.$queryRaw<Array<{ id: string; notes: string; startedAt: Date }>>(Prisma.sql`
        SELECT id,notes,started_at AS "startedAt" FROM visit_executions
        WHERE company_id=${user.companyId} AND rep_id=${user.userId} AND customer_code=${visit.customerCode} AND id<>${id} AND notes<>''
        ORDER BY started_at DESC,id DESC LIMIT 10`);
      return { briefing: {
        period: briefing.period, sales: briefing.sales, returns: briefing.returns,
        dataAvailability: briefing.dataAvailability, topProducts: briefing.topProducts, missingProducts: briefing.missingProducts,
        customer360: briefing.customer360 ? { averageInvoiceValue: briefing.customer360.averageInvoiceValue, soldSkus: briefing.customer360.soldSkus, lostSkus: briefing.customer360.lostSkus } : undefined,
      },
        lastInvoice: invoice.records[0] ? { number: String(invoice.records[0].InvoiceNo), date: String(invoice.records[0].InvoiceDate), amount: numberOrNull(invoice.records[0].TotalAfterVAT) } : null,
        lastPayment: payment.records[0] ? { date: String(payment.records[0].CollectionDate), amount: numberOrNull(payment.records[0].Amount) } : null,
        returnProducts: returns.records.map((r) => ({ productCode: String(r.ProductCode ?? ""), reason: String(r.ReturnReason ?? ""), amount: numberOrNull(r.amount) })),
        previousNotes: notes.map((n) => ({ ...n, startedAt: n.startedAt.toISOString() })),
        // Format only the ten SQL-selected visits; no raw-history aggregation.
        importedNotes: importedVisits.records.flatMap((n) => String(n.Notes ?? "").trim() ? [{ id: String(n.VisitID), notes: String(n.Notes).trim().slice(0, 4000), date: String(n.VisitDate) }] : []),
        balance: null, collectionVisitSuccessRate: null,
      };
    });
  }
  async upload(user: AuthenticatedUser, id: string, input: unknown, file?: Express.Multer.File) {
    const body = new ZodValidationPipe(photoBody).transform(input) as z.infer<typeof photoBody>;
    const visit = await this.owned(user, id);
    await this.customer(user, visit.customerCode);
    const bytes = file?.buffer;
    if (!bytes?.length || bytes.length > 8 * 1024 * 1024) throw new BadRequestException("Image required; maximum 8 MiB");
    const contentType = visitImageType(bytes);
    if (!contentType) throw new BadRequestException("JPEG, PNG or WebP required");
    const contentHash = hash(bytes);
    const replay = await this.prisma.$queryRaw<Array<{ id: string; kind: string; contentHash: string }>>(Prisma.sql`
      SELECT id,kind,content_hash AS "contentHash" FROM visit_execution_photos WHERE company_id=${user.companyId} AND visit_id=${id} AND request_key=${body.requestKey}`);
    if (replay[0]) {
      if (replay[0].kind !== body.kind || replay[0].contentHash !== contentHash) throw new ConflictException();
      return { id: replay[0].id };
    }
    if (visit.status !== "OPEN") throw new ConflictException();
    const photoId = randomUUID();
    const key = `companies/${user.companyId}/visits/${id}/${photoId}`;
    let keepObject = false;
    try {
      await this.storage.upload({ key, body: bytes, contentType });
      const result = await this.prisma.$transaction(async (tx) => {
        const locked = await this.owned(user, id, tx, true);
        if (locked.status !== "OPEN") throw new ConflictException();
        const existing = await tx.$queryRaw<Array<{ id: string; kind: string; contentHash: string }>>(Prisma.sql`
          SELECT id,kind,content_hash AS "contentHash" FROM visit_execution_photos WHERE company_id=${user.companyId} AND visit_id=${id} AND request_key=${body.requestKey}`);
        if (existing[0]) {
          if (existing[0].kind !== body.kind || existing[0].contentHash !== contentHash) throw new ConflictException();
          return { id: existing[0].id };
        }
        const counts = await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`SELECT count(*)::integer AS count FROM visit_execution_photos WHERE company_id=${user.companyId} AND visit_id=${id}`);
        if (counts[0]!.count >= 30) throw new BadRequestException("Maximum 30 images per visit");
        await tx.$executeRaw(Prisma.sql`INSERT INTO visit_execution_photos (id,company_id,visit_id,request_key,kind,object_key,content_hash,content_type,size_bytes)
          VALUES (${photoId},${user.companyId},${id},${body.requestKey},${body.kind},${key},${contentHash},${contentType},${bytes.length})`);
        await this.audit.record({ companyId: user.companyId, userId: user.userId, action: "visit.photo.added", entityType: "VisitExecution", entityId: id, metadata: { photoId, kind: body.kind } }, tx);
        return { id: photoId };
      });
      keepObject = result.id === photoId;
      return result;
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException("Photo could not be saved; retry the same upload");
    } finally {
      if (!keepObject) {
        // A lost commit acknowledgement is not proof of rollback. Never delete
        // an object still referenced by a committed photo; if DB is unavailable,
        // retain it for reconciliation rather than risk breaking saved evidence.
        try {
          const persisted = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM visit_execution_photos
            WHERE company_id=${user.companyId} AND visit_id=${id} AND object_key=${key} LIMIT 1`);
          if (!persisted.length) await this.storage.delete(key);
        } catch { this.logger.error(`Visit photo cleanup requires reconciliation: ${key}`); }
      }
    }
  }
  async photoUrl(user: AuthenticatedUser, id: string, photoId: string) {
    const visit = await this.owned(user, id);
    await this.customer(user, visit.customerCode);
    const rows = await this.prisma.$queryRaw<Array<{ key: string }>>(Prisma.sql`SELECT object_key AS key FROM visit_execution_photos WHERE company_id=${user.companyId} AND visit_id=${id} AND id=${photoId}`);
    if (!rows[0]) throw new NotFoundException();
    return { url: await this.storage.getSignedDownloadUrl(rows[0].key, 60) };
  }
}
