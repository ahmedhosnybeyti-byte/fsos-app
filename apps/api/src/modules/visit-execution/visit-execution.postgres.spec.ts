import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { VisitExecutionService, visitImageType } from "./visit-execution.service";
import { RieScalableQueryService } from "../rie/scalable-query.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

test("Visit Execution actual SQL: isolation, retry, optimistic writes, audit atomicity and image compensation", async (t) => {
  assert.ok(process.env.RIE_TEST_PGLITE_MODULE, "Isolated approved PostgreSQL runtime is required");
  const { PGlite } = require(process.env.RIE_TEST_PGLITE_MODULE!);
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE companies(id text PRIMARY KEY);
    CREATE TABLE users(id text PRIMARY KEY, company_id text NOT NULL, full_name text, status text, UNIQUE(company_id,id));
    CREATE TABLE permissions(id text PRIMARY KEY,code text UNIQUE,description text);
    CREATE TABLE audit_events(id serial PRIMARY KEY,company_id text,action text,entity_id text);
    CREATE TABLE files(id text PRIMARY KEY,company_id text,is_active boolean,status text,dataset_type_confirmed boolean,created_at timestamptz);
    CREATE TABLE rie_canonical_entity_rows(id text PRIMARY KEY,company_id text,source_file_id text,entity_name text,entity_key text,data jsonb,precedence bigint DEFAULT 1,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    INSERT INTO companies VALUES ('a'),('b');
    INSERT INTO users VALUES ('rep-a','a','Rep A','ACTIVE'),('rep-a2','a','Rep A2','ACTIVE'),('rep-b','b','Rep B','ACTIVE');
    INSERT INTO files VALUES ('fa','a',true,'READY',true,now()),('fb','b',true,'READY',true,now());`);
  await db.exec(readFileSync(resolve("packages/database/prisma/migrations/20261022120000_visit_execution/migration.sql"), "utf8"));
  const fact = async (id: string, company: string, entity: string, data: object) => db.query("INSERT INTO rie_canonical_entity_rows(id,company_id,source_file_id,entity_name,entity_key,data) VALUES($1,$2,$3,$4,$1,$5)", [id,company,company === "a" ? "fa" : "fb",entity,JSON.stringify(data)]);
  await fact("ca", "a", "Customers", { CustomerCode: "C-1", CustomerName: "Customer A", RouteID: "R-1" });
  await fact("ca2", "a", "Customers", { CustomerCode: "C-2", CustomerName: "Outside route", RouteID: "R-2" });
  await fact("cb", "b", "Customers", { CustomerCode: "C-1", CustomerName: "Customer B", RouteID: "R-1" });
  const user = (id = "rep-a", companyId = "a"): AuthenticatedUser => ({ userId: id, companyId, email: `${id}@test.invalid`, roleCode: "SALES_REP", permissions: ["sfa.access","visits.execute"], orgUnitId: null, mustChangePassword: false });
  const query = async (sql: Prisma.Sql) => (await db.query(sql.text, sql.values)).rows;
  let allowedRoutes = new Set(["r-1"]);
  let failAudit = false;
  let failUpload = false;
  let failCommitAck = false;
  const objects = new Map<string, Buffer>();
  const signed: unknown[] = [];
  const cleanup: string[] = [];
  const txAdapter = (connection: any): any => ({
    $queryRaw: async (sql: Prisma.Sql) => (await connection.query(sql.text, sql.values)).rows,
    $executeRaw: async (sql: Prisma.Sql) => { await connection.query(sql.text, sql.values); return 1; },
  });
  const prisma = { ...txAdapter(db),
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const result = await db.transaction((connection: any) => fn(txAdapter(connection)));
      if (failCommitAck) { failCommitAck = false; throw new Error("commit acknowledgement lost"); }
      return result;
    },
    user: { findFirst: async ({ where }: any) => (await db.query("SELECT full_name AS \"fullName\" FROM users WHERE id=$1 AND company_id=$2 AND status=$3", [where.id,where.companyId,where.status])).rows[0] },
  };
  const scalable = new RieScalableQueryService({ $queryRaw: query } as never, { resolveAllowedRouteIds: async () => allowedRoutes } as never);
  const rie = { queryCanonicalRecords: scalable.query.bind(scalable), runPlannedRequest: (_: unknown, execute: () => unknown) => execute() };
  const copilot = { briefing: async () => ({ period: { from: "2026-07-01", to: "2026-09-30" } }) };
  const audit = { record: async (entry: any, tx: any) => { if (failAudit) throw new Error("audit outage"); await tx.$executeRaw(Prisma.sql`INSERT INTO audit_events(company_id,action,entity_id) VALUES(${entry.companyId},${entry.action},${entry.entityId})`); } };
  const storage = { upload: async ({ key, body }: any) => { if (failUpload) throw new Error("storage unavailable"); objects.set(key,body); }, delete: async (key: string) => { cleanup.push(key); objects.delete(key); }, getSignedDownloadUrl: async (key: string, ttl: number) => { signed.push({ key, ttl }); return "https://storage.invalid/short-lived"; } };
  const service = new VisitExecutionService(prisma as never, rie as never, copilot as never, audit as never, storage as never);
  const start = (customerCode = "C-1", requestKey = randomUUID()) => ({ customerCode, requestKey, entrySource: "VISIT_COPILOT" });
  const command = (version: number, changes: object = {}) => ({ commandKey: randomUUID(), version, goal: "COLLECTION", notes: "Collected customer follow-up notes", outcome: null, failureReason: null, reasonDetail: "", finish: false, ...changes });
  const file = { buffer: Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(20)]), mimetype: "text/plain" } as Express.Multer.File;

  await t.test("tenant/rep/customer scope and strict input deny impersonation before writing", async () => {
    await assert.rejects(service.start(user(), { ...start(), repId: "rep-a2" }), BadRequestException);
    await assert.rejects(service.start(user(), { ...start(), companyId: "b" }), BadRequestException);
    await assert.rejects(service.start(user(), { ...start(), entrySource: "DISCOVERY", sourceReference: "unverified" }), BadRequestException);
    await assert.rejects(service.start(user(), start("C-2")), NotFoundException);
    await assert.rejects(service.start({ ...user(), permissions: ["sfa.access"] }, start()), ForbiddenException);
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM visit_executions")).rows[0].n, 0);
  });
  let visit: any;
  const first = start(); const resumed = start("c-1");
  await t.test("start retries, alternate keys and case aliases resume exactly one real visit", async () => {
    const results = await Promise.all([service.start(user(), first), service.start(user(), first), service.start(user(), resumed)]);
    visit = results[0];
    assert.equal(new Set(results.map((v) => v.id)).size,1);
    assert.equal(visit.customerName,"Customer A"); assert.equal(visit.repName,"Rep A");
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM audit_events WHERE action='visit.started'")).rows[0].n,1);
    const cross = await service.start(user("rep-b","b"), start());
    assert.notEqual(cross.id,visit.id); assert.equal(cross.customerName,"Customer B");
  });
  await t.test("other company/rep and reassigned route cannot read, save, upload or sign images", async () => {
    for (const other of [user("rep-a2"),user("rep-b","b")]) {
      await assert.rejects(service.read(other,visit.id),NotFoundException);
      await assert.rejects(service.save(other,visit.id,command(0)),NotFoundException);
      await assert.rejects(service.upload(other,visit.id,{kind:"SHELF",requestKey:randomUUID()},file),NotFoundException);
      await assert.rejects(service.photoUrl(other,visit.id,"missing"),NotFoundException);
    }
    allowedRoutes = new Set();
    await assert.rejects(service.read(user(),visit.id),NotFoundException);
    await assert.rejects(service.save(user(),visit.id,command(0)),NotFoundException);
    allowedRoutes = new Set(["r-1"]);
    assert.equal(objects.size,0); assert.equal(signed.length,0);
  });
  await t.test("save replay is idempotent, altered keys/version conflicts and audit failure rolls back", async () => {
    const body = command(0);
    const saved = await service.save(user(),visit.id,body);
    assert.equal(saved.version,1);
    assert.deepEqual(await service.save(user(),visit.id,body),saved);
    await assert.rejects(service.save(user(),visit.id,{...body,notes:"changed"}),ConflictException);
    await assert.rejects(service.save(user(),visit.id,command(0)),ConflictException);
    failAudit = true;
    await assert.rejects(service.save(user(),visit.id,command(1,{notes:"must roll back"})),/audit outage/);
    failAudit = false;
    assert.equal((await service.read(user(),visit.id)).visit.version,1);
    assert.equal((await service.read(user(),visit.id)).visit.notes,body.notes);
  });
  let photo: any;
  await t.test("real storage adapter contract: byte validation, duplicate upload, photo tenancy, short URL", async () => {
    assert.equal(visitImageType(Buffer.from("<svg onload=alert(1)>")),null);
    await assert.rejects(service.upload(user(),visit.id,{kind:"SHELF",requestKey:randomUUID()},{buffer:Buffer.from("<html>"),mimetype:"image/jpeg"} as never),BadRequestException);
    const request = { kind:"COOLER", requestKey:randomUUID() };
    photo = await service.upload(user(),visit.id,request,file);
    assert.deepEqual(await service.upload(user(),visit.id,request,file),photo);
    assert.equal(objects.size,1);
    await assert.rejects(service.upload(user(),visit.id,{...request,kind:"SHELF"},file),ConflictException);
    await service.photoUrl(user(),visit.id,photo.id);
    assert.equal((signed[0] as any).ttl,60);
    assert.match((signed[0] as any).key,new RegExp(`companies/a/visits/${visit.id}/`));
    const ownOther = await service.start(user("rep-a2"),start());
    await assert.rejects(service.photoUrl(user("rep-a2"),ownOther.id,photo.id),NotFoundException);
    allowedRoutes = new Set();
    await assert.rejects(service.photoUrl(user(),visit.id,photo.id),NotFoundException);
    allowedRoutes = new Set(["r-1"]);
  });
  await t.test("storage outage and transactional audit outage never produce a saved photo", async () => {
    failUpload = true;
    await assert.rejects(service.upload(user(),visit.id,{kind:"SHELF",requestKey:randomUUID()},file),ServiceUnavailableException);
    failUpload = false; failAudit = true;
    await assert.rejects(service.upload(user(),visit.id,{kind:"PLANOGRAM",requestKey:randomUUID()},file),ServiceUnavailableException);
    failAudit = false;
    assert.equal(objects.size,1);
    assert.equal((await service.read(user(),visit.id)).photos.length,1);
    assert.ok(cleanup.length>=2);
  });
  await t.test("finish requires result/reason, accepts collection/follow-up without any invoice, retries remain closed", async () => {
    await assert.rejects(service.save(user(),visit.id,command(1,{finish:true})),BadRequestException);
    await assert.rejects(service.save(user(),visit.id,command(1,{finish:true,outcome:"NOT_ACHIEVED"})),BadRequestException);
    await assert.rejects(service.save(user(),visit.id,command(1,{finish:true,outcome:"NOT_ACHIEVED",failureReason:"OTHER"})),BadRequestException);
    const body = command(1,{finish:true,outcome:"ACHIEVED"});
    const finished = await service.save(user(),visit.id,body);
    assert.equal(finished.status,"COMPLETED"); assert.ok(finished.completedAt);
    assert.deepEqual(await service.save(user(),visit.id,body),finished);
    await assert.rejects(service.save(user(),visit.id,command(2)),ConflictException);
    await assert.rejects(service.upload(user(),visit.id,{kind:"SHELF",requestKey:randomUUID()},file),ConflictException);
    assert.equal((await service.start(user(),resumed)).id,visit.id); // Alternate start key survives completion.
    assert.equal((await service.start(user(),first)).id,visit.id);
    assert.notEqual((await service.start(user(),start())).id,visit.id); // Intentional new visit.
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM audit_events WHERE entity_id=$1 AND action='visit.completed'",[visit.id])).rows[0].n,1);
  });
  await t.test("start/audit atomic rollback also removes its retry identity", async () => {
    // Rep B has an open visit: close it before attempting a new audited start.
    const prior = await service.start(user("rep-b","b"),start());
    await service.save(user("rep-b","b"),prior.id,command(0,{finish:true,outcome:"FOLLOW_UP"}));
    const request = start();
    failAudit = true;
    await assert.rejects(service.start(user("rep-b","b"),request),/audit outage/);
    failAudit = false;
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM visit_execution_starts WHERE request_key=$1",[request.requestKey])).rows[0].n,0);
    assert.equal((await service.start(user("rep-b","b"),request)).status,"OPEN");
  });
  await t.test("supplementary RIE context uses SQL customer/date/route scope; returns compact real values and no invented balance/rate", async () => {
    await fact("i1","a","Invoices",{InvoiceNo:"I1",InvoiceDate:"2026-08-10",CustomerCode:"C-1",RouteID:"R-1",InvoiceStatus:"Confirmed",TotalAfterVAT:115});
    await fact("i2","a","Invoices",{InvoiceNo:"I2",InvoiceDate:"2026-09-10",CustomerCode:"C-1",RouteID:"R-1",InvoiceStatus:"Confirmed",TotalAfterVAT:230});
    await fact("i-cancel","a","Invoices",{InvoiceNo:"CANCEL",InvoiceDate:"2026-09-20",CustomerCode:"C-1",RouteID:"R-1",InvoiceStatus:"Cancelled",TotalAfterVAT:999});
    await fact("i-other","a","Invoices",{InvoiceNo:"OTHER",InvoiceDate:"2026-09-30",CustomerCode:"C-2",RouteID:"R-2",InvoiceStatus:"Confirmed",TotalAfterVAT:999});
    await fact("i-future","a","Invoices",{InvoiceNo:"FUTURE",InvoiceDate:"2026-10-01",CustomerCode:"C-1",RouteID:"R-1",InvoiceStatus:"Confirmed",TotalAfterVAT:999});
    await fact("i-tenant","b","Invoices",{InvoiceNo:"TENANT",InvoiceDate:"2026-09-30",CustomerCode:"C-1",RouteID:"R-1",InvoiceStatus:"Confirmed",TotalAfterVAT:999});
    await fact("p1","a","Collections",{CollectionNo:"P1",CollectionDate:"2026-08-11",CustomerCode:"C-1",RouteID:"R-1",Status:"Collected",Amount:40});
    await fact("p2","a","Collections",{CollectionNo:"P2",CollectionDate:"2026-09-11",CustomerCode:"C-1",RouteID:"R-1",Status:"Pending",Amount:999});
    await fact("p-route","a","Collections",{CollectionNo:"ROUTE",CollectionDate:"2026-09-30",CustomerCode:"C-1",RouteID:"R-2",Status:"Collected",Amount:999});
    await fact("r1","a","Returns",{ReturnNo:"R1",ReturnDate:"2026-08-12",CustomerCode:"C-1",RouteID:"R-1",Status:"Confirmed"});
    await fact("ri1","a","Return Items",{ReturnNo:"R1",LineNo:1,ProductCode:"SKU1",ReturnReason:"Damaged",Amount:12});
    await fact("r-route","a","Returns",{ReturnNo:"R-OTHER",ReturnDate:"2026-08-12",CustomerCode:"C-1",RouteID:"R-2",Status:"Confirmed"});
    await fact("ri-route","a","Return Items",{ReturnNo:"R-OTHER",LineNo:1,ProductCode:"SKU1",ReturnReason:"Expired",Amount:999});
    await fact("v1","a","Visits",{VisitID:"V1",VisitDate:"2026-08-15",CustomerCode:"C-1",RouteID:"R-1",Notes:"Imported scoped note"});
    await fact("v-route","a","Visits",{VisitID:"V2",VisitDate:"2026-08-16",CustomerCode:"C-1",RouteID:"R-2",Notes:"Must not leak"});
    await fact("v-future","a","Visits",{VisitID:"V3",VisitDate:"2026-10-01",CustomerCode:"C-1",RouteID:"R-1",Notes:"Outside period"});
    const context = await service.context(user(),visit.id);
    assert.deepEqual(context.lastInvoice,{number:"I2",date:"2026-09-10",amount:230});
    assert.deepEqual(context.lastPayment,{date:"2026-08-11",amount:40});
    assert.deepEqual(context.returnProducts,[{productCode:"SKU1",reason:"Damaged",amount:12}]);
    assert.equal(context.balance,null); assert.equal(context.collectionVisitSuccessRate,null);
    assert.deepEqual(context.importedNotes,[{id:"V1",date:"2026-08-15",notes:"Imported scoped note"}]);
    assert.ok(context.previousNotes.length<=10);
  });
  await t.test("database constraints reject cross-tenant actor/photo and duplicate open customer case", async () => {
    await assert.rejects(db.query("INSERT INTO visit_execution_photos(id,company_id,visit_id,request_key,kind,object_key,content_hash,content_type,size_bytes) VALUES('bad','b',$1,'k','SHELF','bad','hash','image/jpeg',20)",[visit.id]));
    await assert.rejects(db.exec("INSERT INTO visit_executions(id,company_id,rep_id,customer_code,customer_name,rep_name,entry_source,request_key) VALUES('bad-rep','b','rep-a','C-1','C','Rep','VISIT_COPILOT','x')"));
    await assert.rejects(db.query("INSERT INTO visit_execution_starts(company_id,rep_id,request_key,visit_id) VALUES('a','rep-a2','bad-start',$1)",[visit.id]));
    await assert.rejects(db.exec("INSERT INTO visit_executions(id,company_id,rep_id,customer_code,customer_name,rep_name,entry_source,request_key) VALUES('duplicate','a','rep-a','c-1','C','Rep','VISIT_COPILOT','x')"));
    assert.deepEqual((await db.query("SELECT code FROM permissions")).rows,[{code:"visits.execute"}]);
  });
  await t.test("lost commit acknowledgement retains the referenced object and an upload retry returns it", async () => {
    const own = await service.start(user("rep-a2"),start());
    const body = { kind:"SHELF", requestKey:randomUUID() };
    failCommitAck = true;
    await assert.rejects(service.upload(user("rep-a2"),own.id,body,file),ServiceUnavailableException);
    const saved = (await service.read(user("rep-a2"),own.id)).photos;
    assert.equal(saved.length,1);
    assert.deepEqual(await service.upload(user("rep-a2"),own.id,body,file),{id:saved[0]!.id});
    const key = (await db.query("SELECT object_key FROM visit_execution_photos WHERE id=$1",[saved[0]!.id])).rows[0].object_key;
    assert.ok(objects.has(key));
  });
  await t.test("competing save commands cannot overwrite; duplicate photos under overlap persist once", async () => {
    const actor = user("rep-a2");
    const own = await service.start(actor,start());
    const commands = await Promise.allSettled([service.save(actor,own.id,command(0,{notes:"one"})),service.save(actor,own.id,command(0,{notes:"two"}))]);
    assert.equal(commands.filter((r) => r.status === "fulfilled").length,1);
    assert.ok(commands.some((r) => r.status === "rejected" && r.reason instanceof ConflictException));
    const body = {kind:"PLANOGRAM",requestKey:randomUUID()};
    const photos = await Promise.all([service.upload(actor,own.id,body,file),service.upload(actor,own.id,body,file)]);
    assert.equal(photos[0].id,photos[1].id);
    assert.equal((await db.query("SELECT count(*)::integer AS n FROM visit_execution_photos WHERE visit_id=$1 AND request_key=$2",[own.id,body.requestKey])).rows[0].n,1);
  });
  await t.test("server photo count/byte limits and final-image replay remain enforced", async () => {
    const actor = user("rep-a2");
    const own = await service.start(actor,start());
    await assert.rejects(service.upload(actor,own.id,{kind:"SHELF",requestKey:randomUUID()},{buffer:Buffer.alloc(8388609)} as never),BadRequestException);
    await db.query(`INSERT INTO visit_execution_photos(id,company_id,visit_id,request_key,kind,object_key,content_hash,content_type,size_bytes)
      SELECT 'limit-'||n,'a',$1,'limit-key-'||n,'SHELF','limit-object-'||n,'hash','image/jpeg',10 FROM generate_series(1,28) n`,[own.id]);
    await assert.rejects(service.upload(actor,own.id,{kind:"SHELF",requestKey:randomUUID()},file),BadRequestException);
    assert.equal((await service.read(actor,own.id)).photos.length,30);
    const saved = (await db.query("SELECT request_key,kind FROM visit_execution_photos WHERE visit_id=$1 AND content_hash<>'hash' LIMIT 1",[own.id])).rows[0];
    await service.save(actor,own.id,command(1,{finish:true,outcome:"NOT_ACHIEVED",failureReason:"OTHER",reasonDetail:"Customer requested another date"}));
    assert.ok((await service.upload(actor,own.id,{kind:saved.kind,requestKey:saved.request_key},file)).id);
  });
});
