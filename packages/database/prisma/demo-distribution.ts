import { createHash } from "node:crypto";

export const DEMO_COMPANY = { id: "murshidak-demo-distribution-v1", slug: "murshidak-demo-distribution", name: "Murshidak Demo Distribution" } as const;
type Row = Record<string, string | number | null>;
export type DemoBundle = { version: 1; sourceSha256: string; synthetic: true; entities: Record<string, Row[]> };
const SOURCE_SHA256 = "f3c8ed0edfaef5fc97135f9d7cc13280245399bbaf6eed7d75b942bc3a1d95a2";

// A bounded synthetic scenario in the supplied Canonical workbook's schema.
// No source names, contacts, amounts, credentials or company identifiers are copied.
export function prepareDemoDistribution(): DemoBundle {
  const e: Record<string, Row[]> = {};
  const put = (name: string, rows: Row[]) => { e[name] = rows; };
  put("Companies", [{ CompanyID: "DEMO", CompanyNameEnglish: DEMO_COMPANY.name, Currency: "SAR", TimeZone: "Asia/Riyadh", Status: "Active" }]);
  put("Regions", [{ RegionID: "DEMO-RG", CompanyID: "DEMO", RegionName: "منطقة العرض", Status: "Active" }]);
  put("Branches", [{ BranchID: "DEMO-BR", RegionID: "DEMO-RG", BranchName: "فرع العرض", Status: "Active" }]);
  put("Employees", ["MANAGER", "SUPERVISOR", "SALES_REP"].map((Role,i) => ({ EmployeeID: `DEMO-E${i}`, EmployeeName: `موظف تجريبي ${i+1}`, Username: `demo-employee-${i}`, Email: `demo-employee-${i}@example.invalid`, Role, DirectManagerID: i ? `DEMO-E${i-1}` : null, BranchID: "DEMO-BR", Status: "Active" })));
  put("Routes", [{ RouteID: "DEMO-RT", RouteName: "مسار العرض", BranchID: "DEMO-BR", SalesRepID: "DEMO-E2", SupervisorID: "DEMO-E1", ManagerID: "DEMO-E0", Status: "Active" }]);
  put("Route Assignments", [{ AssignmentID:"DEMO-RA",RouteID:"DEMO-RT",EmployeeID:"DEMO-E2",Role:"Sales Rep",StartDate:"2026-01-01",EndDate:null,Status:"Active" }]);
  put("Customers", Array.from({length:12},(_,i) => ({ CustomerCode:`DEMO-C${i+1}`,CustomerName:`متجر تجريبي ${i+1}`,RouteID:"DEMO-RT",BranchID:"DEMO-BR",DefaultPriceListCode:"DEMO-PL",VisitDay:"Sunday",VisitSequence:i+1,City:"الرياض",Latitude:24.70+i*0.001,Longitude:46.67+i*0.001,Status:"Active" })));
  put("Products", Array.from({length:4},(_,i) => ({ ProductCode:`DEMO-P${i+1}`,ProductName:`صنف تجريبي ${i+1}`,Brand:"Demo",Category:"Water",BaseUnit:"Piece",CartonQty:24,PackQty:1,PieceQty:1,NetWeightKG:0.33,ProductStatus:"Active",Status:"Active" })));
  put("Price List", e.Products!.map(p=>({ PriceListCode:"DEMO-PL",ProductCode:p.ProductCode!,Unit:"Piece",PriceBeforeVAT:10,VATPercent:15,PriceAfterVAT:11.5,Currency:"SAR",StartDate:"2026-01-01",Status:"Active" })));
  put("Sales Calendar",Array.from({length:30},(_,i)=>({CalendarDate:`2026-09-${String(i+1).padStart(2,"0")}`,Day:i+1,Month:9,Year:2026,WorkingDay:1,Holiday:0})));
  put("Invoices", Array.from({length:24},(_,i)=>({ InvoiceNo:`DEMO-INV${i+1}`,InvoiceDate:`2026-09-${String(i+1).padStart(2,"0")}`,CustomerCode:`DEMO-C${i%12+1}`,RouteID:"DEMO-RT",InvoiceType:"Sales",PaymentMethod:"Credit",InvoiceStatus:"Posted",TotalBeforeVAT:20,Discount:0,VAT:3,TotalAfterVAT:23 })));
  put("Invoice Items", e.Invoices!.flatMap(inv=>[1,2].map(LineNo=>({ InvoiceNo:inv.InvoiceNo!,LineNo,ProductCode:`DEMO-P${LineNo}`,RouteID:"DEMO-RT",Unit:"Piece",Quantity:1,FreeQuantity:0,UnitPriceBeforeVAT:10,Discount:0,VAT:1.5,NetUnitPrice:10,LineTotal:11.5 }))));
  put("Visits",e.Invoices!.map((inv,i)=>({VisitID:`DEMO-V${i+1}`,VisitDate:inv.InvoiceDate!,CustomerCode:inv.CustomerCode!,RouteID:"DEMO-RT",VisitType:"Planned",VisitStatus:"Productive",InvoiceNo:inv.InvoiceNo!})));
  put("Collections",e.Invoices!.slice(0,12).map((inv,i)=>({CollectionNo:`DEMO-COL${i+1}`,ReceiptNo:`DEMO-REC${i+1}`,CollectionDate:inv.InvoiceDate!,CustomerCode:inv.CustomerCode!,RouteID:"DEMO-RT",InvoiceNo:inv.InvoiceNo!,Amount:23,PaymentMethod:"Cash",Status:"Posted"})));
  put("Van Loads",e.Products!.map((p,i)=>({LoadNo:"DEMO-LOAD",LoadDate:"2026-09-01",RouteID:"DEMO-RT",ProductCode:p.ProductCode!,Unit:"Piece",Quantity:i<2?30:20,Status:"Posted"})));
  put("Van Inventory",e.Products!.map((p,i)=>({ReportDate:"2026-09-30",RouteID:"DEMO-RT",ProductCode:p.ProductCode!,Unit:"Piece",Quantity:i<2?6:20})));
  put("Returns",[]); put("Return Items",[]);
  put("Targets",[{Month:9,Year:2026,RouteID:"DEMO-RT",SalesTarget:1000,CollectionTarget:500,WeightTarget:100,ActiveCustomersTarget:12,ProductiveCallsTarget:30,SKUDistributionTarget:4}]);
  return {version:1,sourceSha256:SOURCE_SHA256,synthetic:true,entities:e};
}

export interface DemoSql {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// Test/staging adapter only. Caller supplies an isolated PGlite database; there
// is deliberately no DATABASE_URL, PrismaClient, HTTP endpoint or Production CLI.
// Publishing uses the existing immutable versions and canonical lifecycle triggers.
export async function importDemoDistribution(db: DemoSql, bundle: DemoBundle) {
  const expected = prepareDemoDistribution();
  if (JSON.stringify(bundle) !== JSON.stringify(expected)) throw new Error("Only the reviewed synthetic v1 bundle is allowed");
  const hash = createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
  await db.exec("BEGIN");
  try {
    const old = await db.query<{id:string;name:string;slug:string}>(`SELECT id,name,slug FROM companies WHERE id=$1 OR slug=$2 FOR UPDATE`,[DEMO_COMPANY.id,DEMO_COMPANY.slug]);
    if (old.rows.length && (old.rows[0]!.id !== DEMO_COMPANY.id || old.rows[0]!.slug !== DEMO_COMPANY.slug || old.rows[0]!.name !== DEMO_COMPANY.name)) throw new Error("Demo identity collision; never adopt another tenant");
    await db.query(`INSERT INTO companies(id,name,slug,status,updated_at) VALUES($1,$2,$3,'ACTIVE',now()) ON CONFLICT(id) DO NOTHING`,[DEMO_COMPANY.id,DEMO_COMPANY.name,DEMO_COMPANY.slug]);
    await db.query(`INSERT INTO company_operating_settings(company_id,operating_mode,updated_at) VALUES($1,'FULL_ERP',now()) ON CONFLICT(company_id) DO NOTHING`,[DEMO_COMPANY.id]);
    const previous = await db.query<{n:number}>(`SELECT count(*)::int n FROM files WHERE company_id=$1 AND content_hash=$2 AND is_active=true AND status='READY'`,[DEMO_COMPANY.id,hash]);
    if(previous.rows[0]!.n) {
      const actual=await db.query<{n:number}>(`SELECT count(*)::int n FROM rie_entity_rows r JOIN rie_dataset_versions v ON v.id=r.dataset_version_id JOIN files f ON f.id=v.source_file_id WHERE r.company_id=$1 AND v.company_id=$1 AND f.company_id=$1 AND v.is_active AND f.is_active AND f.content_hash=$2`,[DEMO_COMPANY.id,hash]);
      if(previous.rows[0]!.n!==Object.keys(bundle.entities).length || actual.rows[0]!.n!==Object.values(bundle.entities).reduce((n,rows)=>n+rows.length,0)) throw new Error("Demo manifest drift; refuse to overwrite later data");
      await db.exec("COMMIT"); return {status:"UNCHANGED",hash,rows:0};
    }
    // A reserved non-login actor. No role or permission grants are made.
    const actor="demo-import-actor-v1", role="demo-import-role-v1";
    await db.query(`INSERT INTO roles(id,code,name,updated_at) VALUES($1,'SALES_REP','Synthetic import actor',now()) ON CONFLICT(code) DO NOTHING`,[role]);
    await db.query(`INSERT INTO users(id,company_id,role_id,email,full_name,password_hash,status,updated_at) SELECT $1,$2,id,'demo-import@example.invalid','Synthetic import actor','!NO_LOGIN','SUSPENDED',now() FROM roles WHERE code='SALES_REP' ON CONFLICT(id) DO NOTHING`,[actor,DEMO_COMPANY.id]);
    const owner=await db.query(`SELECT id FROM users WHERE id=$1 AND company_id=$2 AND email='demo-import@example.invalid' AND status='SUSPENDED'`,[actor,DEMO_COMPANY.id]);
    if(owner.rows.length!==1) throw new Error("Demo actor identity collision");
    let count=0;
    for(const [entity,rows] of Object.entries(bundle.entities)) {
      const id=`demo-v1-${entity.toLowerCase().replaceAll(" ","-")}`;
      // Version/file identities cannot overlap another tenant, even in an imported DB.
      const collision=await db.query(`SELECT id FROM files WHERE id=$1 AND company_id<>$2 UNION ALL SELECT id FROM rie_dataset_versions WHERE id=$1 AND company_id<>$2`,[id,DEMO_COMPANY.id]);
      if(collision.rows.length)throw new Error("Demo file identity collision");
      await db.query(`INSERT INTO files(id,company_id,uploaded_by_user_id,dataset_type,file_name,storage_key,size_bytes,status,batch_id,content_hash,parsed_metadata,updated_at) VALUES($1,$2,$3,$4,'synthetic-demo-v1.json','isolated-demo-only',0,'PROCESSING','demo-batch-v1',$5,$6::jsonb,now())`,[id,DEMO_COMPANY.id,actor,entity,hash,JSON.stringify({headers:Object.keys(rows[0]??{}),rowCount:rows.length,synthetic:true,historyOnly:true,storageUnavailable:true})]);
      await db.query(`INSERT INTO rie_dataset_versions(id,company_id,source_file_id,entity_name,status,is_active,row_count,materialized_at,activated_at,updated_at) VALUES($1,$2,$1,$3,'MATERIALIZING',false,$4,now(),now(),now())`,[id,DEMO_COMPANY.id,entity,rows.length]);
      // Maximum 48 rows per entity in this reviewed bundle, never a fact full read.
      if(rows.length) await db.query(`INSERT INTO rie_entity_rows(id,company_id,dataset_version_id,entity_name,entity_key,data) SELECT $1||'-'||n,$2,$1,$3,n::text,d::jsonb FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY AS r(d,n)`,[id,DEMO_COMPANY.id,entity,JSON.stringify(rows)]);
      await db.query(`UPDATE rie_dataset_versions SET status='ACTIVE',is_active=true WHERE id=$1 AND company_id=$2`,[id,DEMO_COMPANY.id]);
      await db.query(`UPDATE files SET status='READY' WHERE id=$1 AND company_id=$2`,[id,DEMO_COMPANY.id]);
      count+=rows.length;
    }
    // Historical invoices/collections/snapshots NEVER post to operational ledgers.
    await db.query(`INSERT INTO audit_logs(id,event_key,company_id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$1,$2,$3,'demo.synthetic.import','Company',$2,$4::jsonb)`,["demo-import-audit-v1",DEMO_COMPANY.id,actor,JSON.stringify({hash,rows:count,historyOnly:true,operationalPostings:0})]);
    await db.exec("COMMIT"); return {status:"IMPORTED",hash,rows:count};
  } catch(error) { await db.exec("ROLLBACK"); throw error; }
}
