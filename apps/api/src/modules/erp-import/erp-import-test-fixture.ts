// Synthetic fixtures only; no application module imports this helper.
import {readFileSync,readdirSync} from 'node:fs';
import * as XLSX from 'xlsx';
import {prepareDemoDistribution} from '../../../../../packages/database/prisma/demo-distribution';
import {importContracts} from './erp-import-workbook';
import {ErpImportService} from './erp-import.service';
import {AuditLogService} from '../audit-log/audit-log.service';
import {wmsPersistence} from '../wms/wms-test-fixture';
import type {AuthenticatedUser} from '../../common/types/authenticated-user';
export const admin={userId:'super',companyId:null,email:'admin@example.invalid',roleCode:'SUPER_ADMIN',permissions:[],mustChangePassword:false,orgUnitId:null} as AuthenticatedUser;
export function demoRows(){
 const entities=prepareDemoDistribution().entities as Record<string,Record<string,unknown>[]>;
 for(const rows of Object.values(entities))for(const r of rows)if(r.ProductCode==='DEMO-P1')r.ProductCode='P-001';
 Object.assign(entities.Products![0]!,{ProductCode:'P-001',ProductName:'حليب طويل الأجل كامل الدسم 1ل×12 - نقاء',BaseUnit:'Carton',CartonQty:12,PackQty:3,PieceQty:1,Barcode:'6286231750301'});
 for(const t of importContracts)for(const row of entities[t.entity]??[])for(const f of t.fields){if(f.required&&(row[f.name]===undefined||row[f.name]===null)){
  if(f.fk)row[f.name]=entities[f.fk.entity]?.[0]?.[f.fk.field]??'DEMO';
  else row[f.name]=f.type==='Date'?'2026-01-01':f.type==='Integer'||f.type==='Decimal'?1:f.allowedValues?.[0]??'Demo';
 }}
 return entities;
}
export function workbook(rows:Record<string,Record<string,unknown>[]>,name='Canonical.xlsx'){
 const book=XLSX.utils.book_new();for(const [entity,data]of Object.entries(rows)){if(!data.length)continue;const t=importContracts.find(t=>t.entity===entity);const headers=[...new Set([...(t?.fields.map(f=>f.name)??[]),...data.flatMap(r=>Object.keys(r))])];XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(data,{header:headers}),entity);}
 const buffer=XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true});return{buffer,originalname:name} as Express.Multer.File;
}
export async function fixture(db:any,failAudit=false){
 for(const folder of readdirSync('packages/database/prisma/migrations',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort()){
  const file=`packages/database/prisma/migrations/${folder}/migration.sql`;await db.exec(readFileSync(file,'utf8'));
 }
 await db.exec(`INSERT INTO companies(id,name,slug,status,updated_at) VALUES('a','Isolated ERP Demo','erp-demo-a','ACTIVE',now()),('b','Other company','erp-demo-b','ACTIVE',now()),('c','Legacy analysis','erp-demo-c','ACTIVE',now());
 INSERT INTO roles(id,code,name,updated_at) VALUES('role-admin','COMPANY_ADMIN','Company Admin',now()),('role-super','SUPER_ADMIN','Super Admin',now());
 INSERT INTO users(id,company_id,role_id,email,password_hash,full_name,updated_at) VALUES('super',NULL,'role-super','super@example.invalid','test-only','Super',now()),('actor-a','a','role-admin','actor-a@example.invalid','test-only','Admin A',now()),('actor-b','b','role-admin','actor-b@example.invalid','test-only','Admin B',now());
 INSERT INTO company_operating_settings(company_id,operating_mode,updated_at) VALUES('a','FULL_ERP',now()),('b','SFA',now());
 CREATE TABLE test_audit(event_key text PRIMARY KEY,action text,entity_id text);`);
 const prisma=wmsPersistence(db,failAudit),storageData=new Map<string,Buffer>();
 const storage={upload:async({key,body}:any)=>{storageData.set(key,body);},download:async(key:string)=>{if(!storageData.has(key))throw Error('missing source');return storageData.get(key)!;},delete:async(key:string)=>{storageData.delete(key);},getSignedDownloadUrl:async(key:string)=>key};
 const service=new ErpImportService(prisma,new AuditLogService(prisma),storage);
 return{prisma,service,storage,storageData};
}
export const startInput={targetMode:'FULL_ERP',source:'EXCEL',syntheticDemo:true,demoAsOf:'2026-12-31',cutoverDate:'2027-01-01'};
