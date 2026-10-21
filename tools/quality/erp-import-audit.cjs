// Read-only offline audit of the exact owner-approved synthetic workbook.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {ErpWorkbook}=require('../../apps/api/src/modules/erp-import/erp-import-xlsx.ts');
const {importContracts,rowErrors,keyFor,eventFields}=require('../../apps/api/src/modules/erp-import/erp-import-workbook.ts');
async function main(){
 if(process.cwd()!=='D:\\Field Sales OS')throw Error('Official workspace required');
 const source='D:/Murshidak-Import/FSOS_Canonical_ERP_Demo_OneCompany.xlsx',bytes=fs.readFileSync(source),start=Date.now();
 const w=await new ErpWorkbook(bytes).initialize();const indexes=new Map(),entities=[],companies=[],regions=[];
 const needed=new Map();for(const t of importContracts)for(const f of t.fields)if(f.fk){const k=f.fk.entity+'|'+f.fk.field;needed.set(k,new Set());}
 for(const s of w.sheets){const t=importContracts.find(t=>t.entity===s.name);if(!t)continue;const keys=new Set();let count=0,duplicates=0,invalid=0,min=null,max=null,future=0;const errors={};
  for await(const {row}of w.rows(s,t)){
   count++;const key=keyFor(t,row);if(keys.has(key))duplicates++;keys.add(key);
   const issues=rowErrors(t,row);if(issues.length)invalid++;for(const e of issues)errors[e]=(errors[e]||0)+1;
   for(const [k,v]of needed)if(k.startsWith(t.entity+'|'))v.add(String(row[k.split('|')[1]]??''));
   const d=row[eventFields[t.entity]];if(d){const day=String(d);min=min&&min<day?min:day;max=max&&max>day?max:day;if(day>'2026-10-21')future++;}
   if(t.entity==='Companies')companies.push(row.CompanyID);
   if(t.entity==='Regions')regions.push({id:row.RegionID,company:row.CompanyID});
  }entities.push({entity:t.entity,rows:count,duplicates,invalid,errors,min,max,future});console.log(t.entity,count,'invalid',invalid);
 }
 for(const s of w.sheets){const t=importContracts.find(t=>t.entity===s.name);if(!t)continue;const broken={};for await(const {row}of w.rows(s,t))for(const f of t.fields){if(!f.fk||row[f.name]===null||row[f.name]===undefined||row[f.name]==='')continue;if(!needed.get(f.fk.entity+'|'+f.fk.field).has(String(row[f.name])))broken[f.name]=(broken[f.name]||0)+1;}entities.find(e=>e.entity===t.entity).brokenReferences=broken;}
 const result={source,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,companies,regions,entities,durationMs:Date.now()-start,peakRss:process.resourceUsage().maxRSS,readOnly:true};
 fs.mkdirSync('.quality/erp-import',{recursive:true});fs.writeFileSync('.quality/erp-import/approved-source-audit.json',JSON.stringify(result,null,2));console.log('AUDIT_COMPLETE',JSON.stringify({companies,rows:entities.reduce((n,e)=>n+e.rows,0),invalid:entities.reduce((n,e)=>n+e.invalid,0),brokenReferences:entities.reduce((n,e)=>n+Object.values(e.brokenReferences).reduce((a,b)=>a+b,0),0)}));
}main().catch(e=>{console.error(e);process.exitCode=1});
