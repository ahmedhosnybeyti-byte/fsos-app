import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { randomUUID } from "node:crypto";
import { erpImportApprovalSchema, erpImportStartSchema } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../files/storage/storage-provider.interface";
import { importContracts, masterEntities, eventFields, hash, keyFor, rowErrors, stableJson } from "./erp-import-workbook";
import { ErpWorkbook } from "./erp-import-xlsx";
type Project={id:string;company_id:string;state:string;source:string;revision:number;synthetic_demo:boolean;demo_as_of:Date|null;cutover_date:Date;target_mode:string;created_by:string;source_fingerprint:string|null};
type Upload={id:string;project_id:string;storage_key:string;uploaded_by:string;sha256:string;attempts:number};
const fingerprint=Prisma.sql`md5(COALESCE(string_agg(id||':'||md5(data::text),',' ORDER BY id),''))`;
const checked=<T>(schema:{safeParse:(value:unknown)=>{success:boolean;data?:T}},v:unknown):T=>{const r=schema.safeParse(v);if(!r.success)throw new BadRequestException('ERP_INVALID_INPUT');return r.data!;};

@Injectable()
export class ErpImportService {
  constructor(private readonly prisma:PrismaService,private readonly audit:AuditLogService,@Inject(STORAGE_PROVIDER)private readonly storage:StorageProvider){}
  authorize(user:AuthenticatedUser){if(user.roleCode!=='SUPER_ADMIN'||user.mustChangePassword)throw new ForbiddenException('ERP_SUPER_ADMIN_REQUIRED');}
  private async project(tx:PrismaTx,company:string,lock=false){const p=await tx.$queryRaw<Project[]>(Prisma.sql`SELECT * FROM erp_import_projects WHERE company_id=${company} ${lock?Prisma.sql`FOR UPDATE`:Prisma.empty}`);if(!p[0])throw new NotFoundException('ERP_PROJECT_NOT_FOUND');return p[0];}
  private editable(p:Project){if(p.state!=='STAGING')throw new ConflictException('ERP_HISTORY_LOCKED');}
  private record(tx:PrismaTx,user:string,company:string,action:string,id:string,metadata:Prisma.InputJsonObject={}){return this.audit.record({companyId:company,userId:user,action,entityType:'ErpImport',entityId:id,metadata},tx);}
  async start(user:AuthenticatedUser,company:string,input:unknown){
    this.authorize(user);const data=checked(erpImportStartSchema,input);
    if(!data.syntheticDemo&&data.cutoverDate>new Date().toISOString().slice(0,10))throw new BadRequestException('ERP_REAL_CUTOVER_CANNOT_BE_FUTURE');
    await this.prisma.$transaction(async tx=>{
      const companies=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM companies WHERE id=${company} FOR UPDATE`);if(!companies.length)throw new NotFoundException();
      if((await tx.$queryRaw<any[]>(Prisma.sql`SELECT id FROM erp_import_projects WHERE company_id=${company}`)).length)throw new ConflictException('ERP_PROJECT_EXISTS');
      if(data.source==='EXCEL'&&(await tx.$queryRaw<any[]>(Prisma.sql`SELECT 1 FROM rie_canonical_entity_rows WHERE company_id=${company} LIMIT 1`)).length)throw new ConflictException('ERP_EXISTING_HISTORY_REUSE_REQUIRED');
      const id=randomUUID();await tx.$executeRaw(Prisma.sql`INSERT INTO erp_import_projects(id,company_id,target_mode,source,synthetic_demo,demo_as_of,cutover_date,created_by) VALUES(${id},${company},${data.targetMode},${data.source},${data.syntheticDemo},${data.demoAsOf??null}::date,${data.cutoverDate}::date,${user.userId})`);
      if(data.source==='EXISTING'){
        const contracts=importContracts.map(t=>t.entity);
        const source=await tx.$queryRaw<{digest:string}[]>(Prisma.sql`SELECT ${fingerprint} AS digest FROM rie_canonical_entity_rows WHERE company_id=${company} AND entity_name IN (${Prisma.join(contracts)})`);
        const upload=randomUUID();await tx.$executeRaw(Prisma.sql`INSERT INTO erp_import_uploads(id,project_id,file_name,sha256,uploaded_by,storage_key,status) VALUES(${upload},${id},'Existing PostgreSQL snapshot',${source[0]!.digest},${user.userId},'postgres://canonical','RUNNING')`);
        // One database-side copy of the current projection. No pagination loop,
        // raw fact read into Node or new analytical version/fact duplication.
        for(const t of importContracts){const keys=Prisma.join(t.primaryKey.map(k=>Prisma.sql`lower(btrim(COALESCE(data->>${k},'')))`));
          await tx.$executeRaw(Prisma.sql`INSERT INTO erp_import_errors(project_id,upload_id,entity,source_row,message) SELECT ${id},${upload},${t.entity},0,'Existing canonical duplicate business key requires review' WHERE EXISTS(SELECT 1 FROM rie_canonical_entity_rows WHERE company_id=${company} AND entity_name=${t.entity} GROUP BY ARRAY[${keys}] HAVING count(*)>1) ON CONFLICT DO NOTHING`);
          await tx.$executeRaw(Prisma.sql`INSERT INTO erp_import_rows(project_id,entity,business_key,data,content_hash,upload_id,source_row) SELECT ${id},entity_name,to_jsonb(ARRAY[${keys}])::text,data,md5(data::text),${upload},row_number() OVER(ORDER BY id)::integer FROM rie_canonical_entity_rows WHERE company_id=${company} AND entity_name=${t.entity} ON CONFLICT DO NOTHING`);
        }
        await tx.$executeRaw(Prisma.sql`UPDATE erp_import_projects SET source_fingerprint=${source[0]!.digest} WHERE id=${id}`);
        await this.validate(tx,id);
        await tx.$executeRaw(Prisma.sql`UPDATE erp_import_uploads SET status='STAGED',row_count=(SELECT count(*)::integer FROM erp_import_rows WHERE project_id=${id}),finished_at=now() WHERE id=${upload}`);
      }
      await this.record(tx,user.userId,company,'erp_import.start',id,{source:data.source,targetMode:data.targetMode,syntheticDemo:data.syntheticDemo});
    },{timeout:600000});return this.status(user,company);
  }
  async upload(user:AuthenticatedUser,company:string,file:Express.Multer.File){
    this.authorize(user);if(!file||!file.originalname.toLowerCase().endsWith('.xlsx')||file.buffer.length>64*1024**2)throw new BadRequestException('ERP_XLSX_MAX_64MB');
    const digest=hash(file.buffer),id=randomUUID();const p=await this.project(this.prisma,company);this.editable(p);
    const existing=await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT id,status FROM erp_import_uploads WHERE project_id=${p.id} AND sha256=${digest}`);if(existing[0])return {...existing[0],duplicate:true};
    const key=`${company}/erp-import/${p.id}/${id}.xlsx`;
    await this.storage.upload({key,body:file.buffer,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    try{const result=await this.prisma.$transaction(async tx=>{
      const locked=await this.project(tx,company,true);this.editable(locked);
      const duplicate=await tx.$queryRaw<any[]>(Prisma.sql`SELECT id,status FROM erp_import_uploads WHERE project_id=${p.id} AND sha256=${digest}`);if(duplicate[0])return {...duplicate[0],duplicate:true};
      await tx.$executeRaw(Prisma.sql`INSERT INTO erp_import_uploads(id,project_id,file_name,sha256,uploaded_by,storage_key) VALUES(${id},${p.id},${file.originalname.slice(0,200)},${digest},${user.userId},${key})`);
      await tx.$executeRaw(Prisma.sql`UPDATE erp_import_projects SET revision=revision+1 WHERE id=${p.id}`);
      await this.record(tx,user.userId,company,'erp_import.upload',id,{sha256:digest});return{id,status:'QUEUED',duplicate:false};
    });if(result.duplicate)await this.storage.delete(key).catch(()=>{});return result;}catch(e){await this.storage.delete(key).catch(()=>{});throw e;}
  }
  async processNext(){
    const jobs=await this.prisma.$queryRaw<Upload[]>(Prisma.sql`UPDATE erp_import_uploads SET status='RUNNING',attempts=attempts+1,started_at=now(),failure=NULL WHERE id=(SELECT u.id FROM erp_import_uploads u JOIN erp_import_projects p ON p.id=u.project_id WHERE p.state='STAGING' AND u.attempts<3 AND (u.status='QUEUED' OR (u.status='RUNNING' AND u.started_at<now()-interval '15 minutes')) AND NOT EXISTS(SELECT 1 FROM erp_import_uploads busy WHERE busy.project_id=u.project_id AND busy.id<>u.id AND busy.status='RUNNING' AND busy.started_at>=now()-interval '15 minutes') ORDER BY u.created_at FOR UPDATE OF u,p SKIP LOCKED LIMIT 1) RETURNING id,project_id,storage_key,uploaded_by,sha256,attempts`);
    if(!jobs[0])return false;await this.process(jobs[0]);return true;
  }
  async process(job:Upload){
    try{
      const bytes=await this.storage.download(job.storage_key);if(hash(bytes)!==job.sha256)throw new BadRequestException('ERP_SOURCE_CHECKSUM_CHANGED');
      const workbook=await new ErpWorkbook(bytes).initialize();let count=0,identical=0,recognized=0;
      // Per-upload duplicate identity is kept in PostgreSQL, not a Node fact Set.
      for(const sheet of workbook.sheets){const t=importContracts.find(c=>c.entity===sheet.name);if(!t){if(!sheet.name.startsWith('_'))await this.error(job,sheet.name,0,'Unknown Canonical sheet');continue;}recognized++;
        let batch:any[]=[];
        try{for await(const {row,rowNumber} of workbook.rows(sheet,t)){
          count++;const errors=rowErrors(t,row);const eventDate=t.entity==='Targets'?`${row.Year}-${String(row.Month).padStart(2,'0')}-01`:(eventFields[t.entity]?row[eventFields[t.entity]!]??null:null);const item={entity:t.entity,business_key:keyFor(t,row),data:row,content_hash:hash(stableJson(row)),source_row:rowNumber,event_date:eventDate};
          if(errors.length){for(const message of errors)await this.error(job,t.entity,rowNumber,message);continue;}
          batch.push(item);if(batch.length===500){identical+=await this.stage(job,batch);batch=[];}
        }}catch(e){await this.error(job,t.entity,0,e instanceof BadRequestException?e.message:'Invalid sheet');}
        if(batch.length)identical+=await this.stage(job,batch);
      }
      if(!recognized)throw new BadRequestException('ERP_NO_CANONICAL_SHEETS');
      await this.prisma.$transaction(async tx=>{
        const project=await tx.$queryRaw<Project[]>(Prisma.sql`SELECT * FROM erp_import_projects WHERE id=${job.project_id} FOR UPDATE`);if(!project[0])throw new NotFoundException();this.editable(project[0]);await this.assertLease(tx,job);
        await this.validate(tx,job.project_id);
        await tx.$executeRaw(Prisma.sql`UPDATE erp_import_uploads SET status='STAGED',row_count=${count},identical_count=${identical},rejected_count=(SELECT count(*)::integer FROM erp_import_errors WHERE upload_id=${job.id}),finished_at=now() WHERE id=${job.id}`);
        await tx.$executeRaw(Prisma.sql`UPDATE erp_import_projects SET revision=revision+1 WHERE id=${job.project_id}`);
        await this.record(tx,job.uploaded_by,project[0].company_id,'erp_import.validated',job.id,{rows:count});
      },{timeout:600000});
    }catch(e){await this.prisma.$executeRaw(Prisma.sql`UPDATE erp_import_uploads SET status='FAILED',failure=${e instanceof BadRequestException?e.message:'ERP_IMPORT_FAILED_RETRY_OR_CORRECT'},finished_at=now() WHERE id=${job.id} AND status='RUNNING' AND attempts=${job.attempts}`);}
  }
  private async assertLease(tx:PrismaTx,job:Upload){const lease=await tx.$queryRaw<any[]>(Prisma.sql`SELECT id FROM erp_import_uploads WHERE id=${job.id} AND project_id=${job.project_id} AND status='RUNNING' AND attempts=${job.attempts}`);if(!lease.length)throw new ConflictException('ERP_WORKER_LEASE_LOST');}
  private error(job:Upload,entity:string,row:number,message:string){return this.prisma.$executeRaw(Prisma.sql`INSERT INTO erp_import_errors(project_id,upload_id,entity,source_row,message) SELECT ${job.project_id},${job.id},${entity},${row},${message.slice(0,500)} WHERE EXISTS(SELECT 1 FROM erp_import_uploads WHERE id=${job.id} AND status='RUNNING' AND attempts=${job.attempts}) ON CONFLICT DO NOTHING`);}
  private async stage(job:Upload,batch:any[]){
    return this.prisma.$transaction(async tx=>{
      const p=await tx.$queryRaw<Project[]>(Prisma.sql`SELECT * FROM erp_import_projects WHERE id=${job.project_id} FOR UPDATE`);if(!p[0])throw new NotFoundException();this.editable(p[0]);await this.assertLease(tx,job);
      const data=JSON.stringify(batch);
      // Conflicting keys within one upload are errors; never silently choose a
      // winner. Revisions across separate corrective uploads are explicit.
      await tx.$executeRaw(Prisma.sql`INSERT INTO erp_import_errors(project_id,upload_id,entity,source_row,message) SELECT ${job.project_id},${job.id},s.entity,s.source_row,'Conflicting duplicate business key' FROM jsonb_to_recordset(${data}::jsonb) AS s(entity text,business_key text,data jsonb,content_hash text,source_row integer) WHERE EXISTS(SELECT 1 FROM erp_import_rows r WHERE r.project_id=${job.project_id} AND r.entity=s.entity AND r.business_key=s.business_key AND r.upload_id=${job.id} AND r.content_hash<>s.content_hash) OR EXISTS(SELECT 1 FROM jsonb_to_recordset(${data}::jsonb) AS other(entity text,business_key text,content_hash text) WHERE other.entity=s.entity AND other.business_key=s.business_key AND other.content_hash<>s.content_hash) ON CONFLICT DO NOTHING`);
      const same=await tx.$queryRaw<{n:number}[]>(Prisma.sql`WITH incoming AS (SELECT entity,business_key,data,count(*)::integer AS n FROM jsonb_to_recordset(${data}::jsonb) AS s(entity text,business_key text,data jsonb) GROUP BY entity,business_key,data) SELECT COALESCE(sum(CASE WHEN r.data=s.data THEN s.n ELSE s.n-1 END),0)::integer AS n FROM incoming s LEFT JOIN erp_import_rows r ON r.project_id=${job.project_id} AND r.entity=s.entity AND r.business_key=s.business_key`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO erp_import_rows(project_id,entity,business_key,data,content_hash,event_date,upload_id,source_row)
        SELECT DISTINCT ON(s.entity,s.business_key) ${job.project_id},s.entity,s.business_key,s.data,s.content_hash,s.event_date,${job.id},s.source_row FROM jsonb_to_recordset(${data}::jsonb) AS s(entity text,business_key text,data jsonb,content_hash text,event_date date,source_row integer)
        WHERE NOT EXISTS(SELECT 1 FROM erp_import_errors e WHERE e.upload_id=${job.id} AND e.entity=s.entity AND e.source_row=s.source_row AND e.message='Conflicting duplicate business key')
        ORDER BY s.entity,s.business_key,s.source_row ON CONFLICT(project_id,entity,business_key) DO UPDATE SET data=EXCLUDED.data,content_hash=EXCLUDED.content_hash,event_date=EXCLUDED.event_date,upload_id=EXCLUDED.upload_id,source_row=EXCLUDED.source_row,state='PENDING',issues='[]' WHERE erp_import_rows.data IS DISTINCT FROM EXCLUDED.data`);
      await tx.$executeRaw(Prisma.sql`UPDATE erp_import_uploads SET started_at=now() WHERE id=${job.id}`);return same[0]!.n;
    },{timeout:30000});
  }
  async validate(tx:PrismaTx,id:string){
    await tx.$executeRaw(Prisma.sql`UPDATE erp_import_rows SET state='ACCEPTED',issues='[]' WHERE project_id=${id}`);
    for(const t of importContracts){
      const dateField=eventFields[t.entity];
      if(dateField)await tx.$executeRaw(Prisma.sql`UPDATE erp_import_rows SET event_date=CASE WHEN pg_input_is_valid(left(data->>${dateField},10),'date') THEN left(data->>${dateField},10)::date END WHERE project_id=${id} AND entity=${t.entity}`);
      const required=t.fields.filter(f=>f.required||t.primaryKey.includes(f.name));
      for(const f of required)await tx.$executeRaw(Prisma.sql`UPDATE erp_import_rows SET state='PENDING',issues=issues||${JSON.stringify([`${f.name}: required`])}::jsonb WHERE project_id=${id} AND entity=${t.entity} AND COALESCE(data->>${f.name},'')=''`);
      for(const f of t.fields.filter(f=>f.type==='Date'))await tx.$executeRaw(Prisma.sql`UPDATE erp_import_rows SET state='PENDING',issues=issues||${JSON.stringify([`${f.name}: invalid date`])}::jsonb WHERE project_id=${id} AND entity=${t.entity} AND COALESCE(data->>${f.name},'')<>'' AND NOT pg_input_is_valid(left(data->>${f.name},10),'date')`);
      // JSON scalar equality preserves identifier types and lets PostgreSQL
      // hash anti-join each scoped entity, avoiding one GIN probe per fact row.
      for(const f of t.fields.filter(f=>f.fk))await tx.$executeRaw(Prisma.sql`UPDATE erp_import_rows r SET state='PENDING',issues=issues||${JSON.stringify([`${f.name}: pending ${f.fk!.entity}.${f.fk!.field}`])}::jsonb WHERE r.project_id=${id} AND r.entity=${t.entity} AND COALESCE(r.data->>${f.name},'')<>'' AND NOT EXISTS(SELECT 1 FROM erp_import_rows parent WHERE parent.project_id=${id} AND parent.entity=${f.fk!.entity} AND parent.data->${f.fk!.field}=r.data->${f.name})`);
    }
    await tx.$executeRaw(Prisma.sql`UPDATE erp_import_rows SET state='PENDING',issues=issues||'["Invalid original product code/name/UOM; resolve without changing identity"]'::jsonb WHERE project_id=${id} AND entity='Products' AND (COALESCE(data->>'ProductCode','') !~ '^[A-Z0-9][A-Z0-9_-]{0,39}$' OR length(data->>'ProductName')>160 OR COALESCE(data->>'CartonQty','') !~ '^[1-9][0-9]{0,5}$' OR COALESCE(data->>'PieceQty','')<>'1' OR COALESCE(data->>'BaseUnit','') NOT IN ('Piece','Carton','Pack'))`);
    await tx.$executeRaw(Prisma.sql`UPDATE erp_import_rows SET event_date=CASE WHEN data->>'Year' ~ '^[12][0-9]{3}$' AND data->>'Month' ~ '^(0?[1-9]|1[012])$' THEN make_date((data->>'Year')::integer,(data->>'Month')::integer,1) END WHERE project_id=${id} AND entity='Targets'`);
    // Preserve header dates for line records that have no date column.
    for(const [entity,parent,key] of [['Invoice Items','Invoices','InvoiceNo'],['Return Items','Returns','ReturnNo']])await tx.$executeRaw(Prisma.sql`UPDATE erp_import_rows r SET event_date=p.event_date FROM erp_import_rows p WHERE r.project_id=${id} AND p.project_id=${id} AND r.entity=${entity!} AND p.entity=${parent!} AND r.data->>${key!}=p.data->>${key!}`);
  }
  async status(user:AuthenticatedUser,company:string){
    this.authorize(user);const p=await this.project(this.prisma,company);
    const entities=await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT entity,count(*)::integer AS rows,count(*) FILTER(WHERE state='PENDING')::integer AS pending,count(*) FILTER(WHERE event_date>CURRENT_DATE)::integer AS future FROM erp_import_rows WHERE project_id=${p.id} GROUP BY entity ORDER BY entity`);
    const uploads=await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT id,file_name,status,row_count,identical_count,rejected_count,excluded,failure,created_at FROM erp_import_uploads WHERE project_id=${p.id} ORDER BY created_at DESC LIMIT 20`);
    const blockers=await this.blockers(this.prisma,p);
    return{project:p,entities,uploads,blockers,openingBalancesMissing:['Warehouse opening by lot/location/UOM','Sales rep custody opening','Customer receivables opening',...(p.target_mode==='FULL_ERP'?['Supplier payables opening','Balanced general ledger opening']:[])],cutoverReady:false};
  }
  private async blockers(tx:PrismaTx,p:Project){
    const counts=await tx.$queryRaw<{entity:string;n:number;pending:number}[]>(Prisma.sql`SELECT entity,count(*)::integer AS n,count(*) FILTER(WHERE state='PENDING')::integer AS pending FROM erp_import_rows WHERE project_id=${p.id} GROUP BY entity`);
    const result=masterEntities.filter(e=>!counts.some(c=>c.entity===e&&c.n>0)).map(e=>`Missing ${e}`);
    const companies=counts.find(c=>c.entity==='Companies');if(companies&&companies.n!==1)result.push('Exactly one source company is required for this onboarding');
    if(counts.some(c=>c.pending))result.push('Pending dependencies or invalid existing data');
    const jobs=await tx.$queryRaw<{n:number}[]>(Prisma.sql`SELECT count(*)::integer AS n FROM erp_import_uploads u WHERE project_id=${p.id} AND NOT excluded AND (status<>'STAGED' OR EXISTS(SELECT 1 FROM erp_import_errors e WHERE e.upload_id=u.id))`);if(jobs[0]!.n)result.push('Unfinished uploads or unreviewed errors');
    const products=await tx.$queryRaw<{n:number}[]>(Prisma.sql`SELECT count(*)::integer AS n FROM erp_import_rows WHERE project_id=${p.id} AND entity='Products' AND (data->>'CartonQty' !~ '^[0-9]+$' OR COALESCE(data->>'PieceQty','')<>'1' OR COALESCE(data->>'BaseUnit','') NOT IN ('Piece','Carton','Pack'))`);if(products[0]!.n)result.push('Unresolved product unit mapping');
    return result;
  }
  async reviewErrors(user:AuthenticatedUser,company:string,upload:string,note:string){
    this.authorize(user);if(typeof note!=='string'||note.trim().length<5||note.length>500)throw new BadRequestException('ERP_REVIEW_NOTE_REQUIRED');
    await this.prisma.$transaction(async tx=>{const p=await this.project(tx,company,true);this.editable(p);
      const changed=await tx.$executeRaw(Prisma.sql`UPDATE erp_import_uploads SET excluded=true WHERE project_id=${p.id} AND id=${upload} AND status IN ('STAGED','FAILED')`);if(!changed)throw new NotFoundException();
      await tx.$executeRaw(Prisma.sql`UPDATE erp_import_projects SET revision=revision+1 WHERE id=${p.id}`);
      await this.record(tx,user.userId,company,'erp_import.exclude_invalid_rows',upload,{note,retainedValidStagingRows:true});
    });return this.status(user,company);
  }
  async errors(user:AuthenticatedUser,company:string,page:number){this.authorize(user);if(!Number.isInteger(page)||page<1||page>10000)throw new BadRequestException();const p=await this.project(this.prisma,company);return this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM (SELECT e.id::text AS id,e.upload_id,e.entity,e.source_row,e.message,u.excluded FROM erp_import_errors e JOIN erp_import_uploads u ON u.id=e.upload_id WHERE e.project_id=${p.id} UNION ALL SELECT 'pending:'||r.business_key,r.upload_id,r.entity,r.source_row,r.issues::text,false FROM erp_import_rows r WHERE r.project_id=${p.id} AND r.state='PENDING') errors ORDER BY entity,source_row,id LIMIT 51 OFFSET ${(page-1)*50}`);}
  async approve(user:AuthenticatedUser,company:string,input:unknown){
    this.authorize(user);const data=checked(erpImportApprovalSchema,input);
    await this.prisma.$transaction(async tx=>{
      const p=await this.project(tx,company,true);if(p.state==='APPROVED')return;this.editable(p);if(p.revision!==data.revision)throw new ConflictException('ERP_REVIEW_STALE');
      const blockers=await this.blockers(tx,p);if(blockers.length)throw new ConflictException({message:'ERP_NOT_READY',blockers});
      if(p.source==='EXISTING'){
        const source=await tx.$queryRaw<{digest:string}[]>(Prisma.sql`SELECT ${fingerprint} AS digest FROM rie_canonical_entity_rows WHERE company_id=${company} AND entity_name IN (${Prisma.join(importContracts.map(t=>t.entity))})`);
        if(source[0]!.digest!==p.source_fingerprint)throw new ConflictException('ERP_EXISTING_SNAPSHOT_CHANGED_START_NEW_REVIEW');
      }
      // Bridge only the approved product identity/UOM. No batch, opening,
      // receipt, invoice, collection, user account or role is created.
      const conflicts=await tx.$queryRaw<any[]>(Prisma.sql`SELECT r.business_key FROM erp_import_rows r JOIN wms_products w ON w.company_id=${company} AND w.code=r.data->>'ProductCode' WHERE r.project_id=${p.id} AND r.entity='Products' AND (w.name<>r.data->>'ProductName' OR w.base_unit<>'PIECE' OR w.pieces_per_carton<>(r.data->>'CartonQty')::integer) LIMIT 1`);if(conflicts.length)throw new ConflictException('ERP_EXISTING_PRODUCT_MAPPING_CONFLICT');
      await tx.$executeRaw(Prisma.sql`INSERT INTO wms_products(id,company_id,code,name,barcode,base_unit,pieces_per_carton,is_active) SELECT 'erp-'||md5(${company}||':'||r.business_key),${company},r.data->>'ProductCode',r.data->>'ProductName',NULLIF(r.data->>'Barcode',''),'PIECE',(r.data->>'CartonQty')::integer,lower(COALESCE(r.data->>'Status','active'))='active' FROM erp_import_rows r WHERE r.project_id=${p.id} AND r.entity='Products' ON CONFLICT(company_id,code) DO NOTHING`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO erp_product_links(company_id,project_id,source_code,product_id,source_name,source_uom) SELECT ${company},${p.id},r.data->>'ProductCode',w.id,r.data->>'ProductName',jsonb_build_object('BaseUnit',r.data->'BaseUnit','CartonQty',r.data->'CartonQty','PackQty',r.data->'PackQty','PieceQty',r.data->'PieceQty') FROM erp_import_rows r JOIN wms_products w ON w.company_id=${company} AND w.code=r.data->>'ProductCode' WHERE r.project_id=${p.id} AND r.entity='Products' ON CONFLICT DO NOTHING`);
      // Future demo transactions stay in immutable approved staging and the
      // explicit demo-as-of RIE preview. Ordinary analytics sees past only.
      await this.publish(tx,p,user.userId);
      await tx.$executeRaw(Prisma.sql`UPDATE erp_import_projects SET state='APPROVED',approved_by=${user.userId},approval_note=${data.note},approved_at=now(),publication_as_of=LEAST(CURRENT_DATE,cutover_date-1),revision=revision+1 WHERE id=${p.id}`);
      await this.record(tx,user.userId,company,'erp_import.approve_history',p.id,{note:data.note,operatingModeUnchanged:true,openingsPosted:false});
    },{timeout:600000});return this.status(user,company);
  }
  private async publish(tx:PrismaTx,p:Project,user:string){
    const groups=await tx.$queryRaw<{upload_id:string;entity:string}[]>(Prisma.sql`SELECT DISTINCT r.upload_id,r.entity FROM erp_import_rows r JOIN erp_import_uploads u ON u.id=r.upload_id WHERE r.project_id=${p.id} AND r.state='ACCEPTED' AND u.storage_key<>'postgres://canonical' AND (r.event_date IS NULL OR r.event_date<=LEAST(CURRENT_DATE,${p.cutover_date}::date-1)) ORDER BY r.entity,r.upload_id`);
    for(const group of groups){
      const file='erp-file-'+hash(p.id+group.upload_id+group.entity).slice(0,32),version='erp-version-'+hash(file).slice(0,32);
      const headers=importContracts.find(t=>t.entity===group.entity)!.fields.map(f=>f.name);
      await tx.$executeRaw(Prisma.sql`INSERT INTO files(id,company_id,uploaded_by_user_id,dataset_type,dataset_type_confirmed,batch_id,content_hash,file_name,storage_key,size_bytes,status,parsed_metadata,is_active,created_at,updated_at) SELECT ${file},${p.company_id},${user},${group.entity},true,${p.id},u.sha256,u.file_name,u.storage_key,0,'PROCESSING',${JSON.stringify({headers,erpImportProject:p.id,sourceUpload:group.upload_id})}::jsonb,true,u.created_at,now() FROM erp_import_uploads u WHERE u.id=${group.upload_id}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO rie_dataset_versions(id,company_id,source_file_id,entity_name,updated_at) VALUES(${version},${p.company_id},${file},${group.entity},now())`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO rie_entity_rows(id,company_id,dataset_version_id,entity_name,entity_key,data) SELECT 'erp-row-'||md5(${version}||r.business_key),${p.company_id},${version},r.entity,r.business_key,r.data FROM erp_import_rows r WHERE r.project_id=${p.id} AND r.upload_id=${group.upload_id} AND r.entity=${group.entity} AND r.state='ACCEPTED' AND (r.event_date IS NULL OR r.event_date<=LEAST(CURRENT_DATE,${p.cutover_date}::date-1))`);
      await tx.$executeRaw(Prisma.sql`UPDATE rie_dataset_versions SET status='ACTIVE',is_active=true,row_count=(SELECT count(*)::integer FROM rie_entity_rows WHERE dataset_version_id=${version}),materialized_at=now(),activated_at=now(),updated_at=now() WHERE id=${version}`);
      await tx.$executeRaw(Prisma.sql`UPDATE files SET status='READY',updated_at=now() WHERE id=${file}`);
    }
  }
}
