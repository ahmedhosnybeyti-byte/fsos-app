
import { createHash } from "node:crypto";

import { IMPORT_TEMPLATES } from "../import-validation/import-templates.data";
import type { ImportTemplate } from "../import-validation/import-validation.types";

// Companies is provenance metadata, never a command to create legal tenants,
// subscriptions, launch codes or users. The Analysis uploader omits this sheet.
const companyContract:ImportTemplate={id:'ERP-COMPANIES-v1',entity:'Companies',primaryKey:['CompanyID'],importOrder:0,dependsOn:[],fields:[{name:'CompanyID',required:true,type:'String'},{name:'CompanyNameEnglish',required:true,type:'String'}]};
export const importContracts:readonly ImportTemplate[] = [companyContract,...IMPORT_TEMPLATES.filter(t => t.entity !== "Prospects")].sort((a,b)=>a.importOrder-b.importOrder);
export const masterEntities = ["Companies","Products","Customers","Regions","Branches","Employees","Routes"];
export const eventFields: Record<string,string> = { "Sales Calendar":"CalendarDate",Invoices:"InvoiceDate","Invoice Items":"InvoiceDate",Returns:"ReturnDate","Return Items":"ReturnDate",Collections:"CollectionDate",Visits:"VisitDate","Van Loads":"LoadDate","Van Inventory":"ReportDate", "Route Assignments":"StartDate", "Price List":"StartDate" };
export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function keyFor(t: ImportTemplate, row: Record<string,unknown>) { return JSON.stringify(t.primaryKey.map(k=>String(row[k]??"").trim().toLowerCase())); }
export function rowErrors(t: ImportTemplate, row: Record<string,unknown>) {
  const errors: string[]=[];
  for(const f of t.fields){const v=row[f.name];const blank=v===null||v===undefined||v==="";
    if(blank){if(f.required||t.primaryKey.includes(f.name))errors.push(`${f.name}: required`);continue;}
    if(f.type==='Date' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(String(v))) || new Date(String(v)).toISOString().slice(0,10)!==v)) errors.push(`${f.name}: invalid date`);
    if((f.type==='Integer'||f.type==='Decimal') && (!Number.isFinite(Number(v))||(f.type==='Integer'&&!Number.isInteger(Number(v)))))errors.push(`${f.name}: invalid number`);
  }
  if(t.entity==='Products'){
    if(!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(String(row.ProductCode??"")))errors.push('ProductCode: incompatible with WMS code contract; source code was not changed');
    if(!['Piece','Carton','Pack'].includes(String(row.BaseUnit)))errors.push('BaseUnit: unsupported Canonical unit');
    if(!Number.isInteger(Number(row.CartonQty))||Number(row.CartonQty)<1||Number(row.CartonQty)>1000000||Number(row.PieceQty)!==1)errors.push('UOM: explicit positive CartonQty and PieceQty=1 required for WMS piece mapping');
    if(String(row.ProductName??'').length>160)errors.push('ProductName exceeds WMS limit; name was not truncated');
  }
  return errors;
}
