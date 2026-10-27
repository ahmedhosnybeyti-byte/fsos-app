// Isolated test adapter for the existing persistent cache tables, not a runtime cache.
import {readFileSync} from "node:fs";
export async function demoCacheFixture(db:any) {
  await db.exec("CREATE TABLE IF NOT EXISTS companies(id text PRIMARY KEY); INSERT INTO companies(id) VALUES('demo'),('real') ON CONFLICT DO NOTHING");
  for(const name of ["20260919000000_smart_loading_management_risk_snapshots","20260919195000_smart_loading_last_sale_snapshot"])
    await db.exec(readFileSync(`packages/database/prisma/migrations/${name}/migration.sql`,"utf8"));
  let revision=1;
  const cacheKey=(where:any)=>where.companyId_targetDate_salesFrom_salesTo_personLevel_scopeKey;
  const keyValues=(key:any)=>[key.companyId,key.targetDate,key.salesFrom,key.salesTo,key.personLevel,key.scopeKey];
  const prisma:any={
    rieDatasetVersion:{findMany:async()=>[{id:`version-${revision}`,entityName:"Invoices",sourceFileId:"file",updatedAt:new Date(`2026-10-25T0${revision}:00:00Z`)}]},
    rieCanonicalEntityRow:{findFirst:async()=>({updatedAt:new Date(`2026-10-25T0${revision}:00:00Z`)})},
    smartLoadingManagementLoadingRiskSnapshot:{
      findUnique:async({where}:any)=>(await db.query(`SELECT result FROM smart_loading_management_loading_risk_snapshots WHERE company_id=$1 AND target_date=$2 AND sales_from=$3 AND sales_to=$4 AND person_level=$5 AND scope_key=$6`,keyValues(cacheKey(where)))).rows[0]??null,
      upsert:async({where,create}:any)=>db.query(`INSERT INTO smart_loading_management_loading_risk_snapshots(id,company_id,target_date,sales_from,sales_to,person_level,scope_key,scope_is_company_wide,route_ids,result,updated_at)
        VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
        ON CONFLICT(company_id,target_date,sales_from,sales_to,person_level,scope_key) DO UPDATE SET result=excluded.result,updated_at=now()`,[...keyValues(cacheKey(where)),create.scopeIsCompanyWide,create.routeIds,JSON.stringify(create.result)]),
    },
    smartLoadingLastSaleSnapshotRoute:{
      findMany:async({where}:any)=>(await db.query(`SELECT route_id AS "routeId" FROM smart_loading_last_sale_snapshot_routes WHERE company_id=$1 AND route_id=ANY($2) AND target_date=$3 AND active_version=$4`,[where.companyId,where.routeId.in,where.targetDate,where.activeVersion])).rows,
      createMany:async({data}:any)=>db.query(`INSERT INTO smart_loading_last_sale_snapshot_routes(id,company_id,route_id,target_date,active_version)
        SELECT gen_random_uuid()::text,x."companyId",x."routeId",x."targetDate",x."activeVersion" FROM jsonb_to_recordset($1::jsonb) x("companyId" text,"routeId" text,"targetDate" text,"activeVersion" text) ON CONFLICT DO NOTHING`,[JSON.stringify(data)]),
    },
    smartLoadingLastSaleSnapshot:{
      findMany:async({where}:any)=>(await db.query(`SELECT product_code AS "productCode",last_sale_date AS "lastSaleDate" FROM smart_loading_last_sale_snapshots WHERE company_id=$1 AND route_id=ANY($2) AND target_date=$3 AND active_version=$4`,[where.companyId,where.routeId.in,where.targetDate,where.activeVersion])).rows,
      createMany:async({data}:any)=>db.query(`INSERT INTO smart_loading_last_sale_snapshots(id,company_id,route_id,product_code,target_date,active_version,last_sale_date)
        SELECT gen_random_uuid()::text,x."companyId",x."routeId",x."productCode",x."targetDate",x."activeVersion",x."lastSaleDate" FROM jsonb_to_recordset($1::jsonb) x("companyId" text,"routeId" text,"productCode" text,"targetDate" text,"activeVersion" text,"lastSaleDate" text) ON CONFLICT DO NOTHING`,[JSON.stringify(data)]),
    },
    $transaction:async(work:any)=>Promise.all(work),
  };
  return {prisma,bump:()=>{revision++;},revision:()=>revision};
}
