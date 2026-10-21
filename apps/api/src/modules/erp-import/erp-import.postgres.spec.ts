import assert from 'node:assert/strict';
import test from 'node:test';
import {Prisma} from '@field-sales-os/database';
import {ForbiddenException,ConflictException} from '@nestjs/common';
import {fixture,admin,demoRows,workbook,startInput} from './erp-import-test-fixture';
import {ErpImportService} from './erp-import.service';
import {AuditLogService} from '../audit-log/audit-log.service';
import {RieErpHistoryQueryService} from '../rie/erp-history-query.service';
import {RieExecutionCoordinatorService} from '../rie/rie-execution-coordinator.service';
import {RieScalableQueryService} from '../rie/scalable-query.service';
import {WmsService} from '../wms/wms.service';
import {wmsUser} from '../wms/wms-test-fixture';
const options={skip:process.env.RIE_TEST_PGLITE_MODULE?false:'Isolated PostgreSQL runtime required'};
async function setup(t:any){const {PGlite}=require(process.env.RIE_TEST_PGLITE_MODULE!);const db=new PGlite();t.after(()=>db.close());return{db,...await fixture(db)};}
test('ERP staging completes missing dependencies, preserves original products, deduplicates and separates future history and WMS stock',options,async t=>{
 const {db,prisma,service}=await setup(t);await service.start(admin,'a',startInput);const rows=demoRows();const products=workbook({Products:rows.Products!});
 const first=await service.upload(admin,'a',products);await service.processNext();assert.equal((await service.upload(admin,'a',products)).duplicate,true);
 await service.upload(admin,'a',workbook({Products:[rows.Products![0]!,rows.Products![0]!]},'same-key-twice.xlsx'));await service.processNext();assert.equal((await service.status(admin,'a')).uploads[0].identical_count,2);
 const incomplete=await service.status(admin,'a');assert.ok(incomplete.blockers.includes('Missing Customers'));await assert.rejects(service.approve(admin,'a',{revision:incomplete.project.revision,note:'Review incomplete import'}),ConflictException);
 const all=workbook(rows);await service.upload(admin,'a',all);await service.processNext();let status=await service.status(admin,'a');assert.deepEqual(status.blockers,[]);
 assert.equal(status.entities.find((r:any)=>r.entity==='Products').rows,4);
 // Future synthetic invoice is retained but never a live invoice/stock entry.
 const future=workbook({Invoices:[{...rows.Invoices![0],InvoiceNo:'FUTURE-INVOICE',InvoiceDate:'2026-12-31'}]});await service.upload(admin,'a',future);await service.processNext();status=await service.status(admin,'a');assert.deepEqual(status.blockers,[]);
 await assert.rejects(service.approve(admin,'a',{revision:0,note:'Old review version'}),/ERP_REVIEW_STALE/);
 await service.approve(admin,'a',{revision:status.project.revision,note:'Verified isolated historical import'});
 await service.approve(admin,'a',{revision:0,note:'Idempotent approval retry'});
 const master=(await db.query(`SELECT p.name,p.code,p.pieces_per_carton,l.source_uom FROM wms_products p JOIN erp_product_links l ON l.product_id=p.id WHERE p.company_id='a' AND p.code='P-001'`)).rows[0];
 assert.equal(master.name,rows.Products![0]!.ProductName);assert.equal(master.pieces_per_carton,12);assert.deepEqual(master.source_uom,{BaseUnit:'Carton',CartonQty:12,PackQty:3,PieceQty:1});
 assert.equal((await db.query(`SELECT count(*)::integer n FROM wms_movements`)).rows[0].n,0);
 assert.equal((await db.query(`SELECT count(*)::integer n FROM rie_canonical_entity_rows WHERE company_id='a' AND data->>'InvoiceNo'='FUTURE-INVOICE'`)).rows[0].n,0);
 const history=new RieErpHistoryQueryService(prisma,new RieExecutionCoordinatorService());const today=await history.query('a','Invoices','2026-10-21',1),demo=await history.query('a','Invoices','2026-12-31',1);assert.equal(demo.total,today.total+1);
 const rie=new RieScalableQueryService(prisma,{} as never);const records=await rie.query({companyId:'a',entityName:'Products',projection:[{field:'ProductCode'},{field:'ProductName'}],pagination:{limit:10,offset:0}});assert.equal(records.records.find(r=>r.ProductCode==='P-001')!.ProductName,master.name);
 await assert.rejects(service.upload(admin,'a',all),/ERP_HISTORY_LOCKED/);await assert.rejects(history.query('b','Products','2026-10-21',1),ForbiddenException);
 // Explicit new operational opening, using the very same product identity.
 await db.exec(`INSERT INTO warehouses(id,company_id,code,name,updated_at) VALUES('wa','a','MAIN','Test warehouse',now());UPDATE companies SET feature_access='{"warehouse-core":"ENABLED","sfa-setup":"ENABLED"}' WHERE id='a';`);
 const core=new WmsService(prisma,new AuditLogService(prisma)),id=(await db.query(`SELECT id FROM wms_products WHERE company_id='a' AND code='P-001'`)).rows[0].id;
 const beforeHistory=demo.total;await core.postOpening(wmsUser(),'wa',{productId:id,quantity:'2',unit:'CARTON',reference:'EXPLICIT-NEW-OPENING',reason:'New separately verified physical opening',idempotencyKey:'a8ddbc38-d8e3-4caf-81c4-8ce198c5ff79'});
 assert.equal((await db.query(`SELECT p.physical::text FROM wms_positions p JOIN wms_batches b ON b.company_id=p.company_id AND b.id=p.batch_id WHERE p.company_id='a' AND b.product_id=$1`,[id])).rows[0].physical,'24.000000');assert.equal((await history.query('a','Invoices','2026-12-31',1)).total,beforeHistory);
 assert.equal((await db.query(`SELECT count(*)::integer n FROM wms_products WHERE company_id='b'`)).rows[0].n,0);
 assert.equal(first.duplicate,false);
});
test('ERP errors retain valid staging rows, reviewed corrections and audit failure cannot partially approve',options,async t=>{
 const {db,prisma,service,storage}=await setup(t);await service.start(admin,'a',startInput);const rows=demoRows();const broken=structuredClone(rows);broken.Products![1]!.ProductName='';
 const upload=await service.upload(admin,'a',workbook(broken));await service.processNext();let s=await service.status(admin,'a');assert.ok(s.blockers.length);assert.equal(s.entities.find((e:any)=>e.entity==='Products').rows,3);assert.ok((await service.errors(admin,'a',1)).length);
 await service.upload(admin,'a',workbook({Products:[rows.Products![1]!]}));await service.processNext();s=await service.status(admin,'a');assert.equal(s.entities.find((e:any)=>e.entity==='Products').rows,4);
 // The operator explicitly reviews the earlier rejected row, never silently drops it.
 await service.reviewErrors(admin,'a',upload.id,'Corrected missing product in supplemental file');s=await service.status(admin,'a');assert.deepEqual(s.blockers,[]);
 const failedAudit=new ErpImportService(prisma,{record:async()=>{throw Error('Audit unavailable');}} as never,storage);
 await assert.rejects(failedAudit.approve(admin,'a',{revision:s.project.revision,note:'Trigger audit rollback'}),/Audit unavailable/);
 assert.equal((await db.query(`SELECT count(*)::integer n FROM wms_products`)).rows[0].n,0);assert.equal((await service.status(admin,'a')).project.state,'STAGING');
 const tenant={...admin,roleCode:'COMPANY_ADMIN' as const,companyId:'a'};await assert.rejects(service.start(tenant,'b',startInput),ForbiddenException);await assert.rejects(service.upload(tenant,'a',workbook(rows)),ForbiddenException);await assert.rejects(service.status(tenant,'b'),ForbiddenException);await assert.rejects(service.approve(tenant,'a',{revision:1,note:'Unauthorized approval'}),ForbiddenException);
});
test('Analysis transition reuses PostgreSQL, retains mode and sources, and detects source changes',options,async t=>{
 const {db,prisma,service}=await setup(t);const rows=demoRows();
 let i=0;for(const [entity,data]of Object.entries(rows))for(const r of data)await prisma.$executeRaw(Prisma.sql`INSERT INTO rie_canonical_entity_rows(id,company_id,entity_name,entity_key,data,updated_at) VALUES(${`legacy-${i++}`},'c',${entity},${String(i)},${JSON.stringify(r)}::jsonb,now())`);
 await assert.rejects(service.start(admin,'c',startInput),/ERP_EXISTING_HISTORY_REUSE_REQUIRED/);
 await service.start(admin,'c',{...startInput,source:'EXISTING'});let s=await service.status(admin,'c');assert.deepEqual(s.blockers,[]);
 const before=(await db.query(`SELECT count(*)::integer n FROM rie_canonical_entity_rows WHERE company_id='c'`)).rows[0].n;
 await db.exec(`UPDATE rie_canonical_entity_rows SET data=jsonb_set(data,'{CustomerName}','"Changed source"') WHERE company_id='c' AND entity_name='Customers';`);
 await assert.rejects(service.approve(admin,'c',{revision:s.project.revision,note:'Review changed source'}),/ERP_EXISTING_SNAPSHOT_CHANGED/);
 assert.equal((await db.query(`SELECT count(*)::integer n FROM rie_canonical_entity_rows WHERE company_id='c'`)).rows[0].n,before);assert.equal((await db.query(`SELECT count(*)::integer n FROM company_operating_settings WHERE company_id='c'`)).rows[0].n,0);
});
