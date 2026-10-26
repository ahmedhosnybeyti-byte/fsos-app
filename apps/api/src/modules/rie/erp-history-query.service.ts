import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import { RieExecutionCoordinatorService } from "./rie-execution-coordinator.service";
import { CANONICAL_ENTITIES } from "./canonical-entities.data";
import { demoDailyTypedDateGuard } from "./demo-daily-read-policy";
@Injectable()
export class RieErpHistoryQueryService {
  constructor(private readonly prisma:PrismaService,private readonly coordinator:RieExecutionCoordinatorService){}
  async query(company:string,entity:string,asOf:string,page:number){
    if(!CANONICAL_ENTITIES.some(e=>e.entityName===entity)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isInteger(page)||page<1||page>10000)throw new BadRequestException('ERP_HISTORY_QUERY_INVALID');
    return this.coordinator.execute('erp.history.asof',async()=>{
      const allowed=await this.prisma.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM erp_import_projects WHERE company_id=${company} AND state IN ('APPROVED','LOCKED') AND (${asOf}::date<=CURRENT_DATE OR (synthetic_demo AND ${asOf}::date<=demo_as_of))`);
      if(!allowed[0])throw new ForbiddenException('ERP_HISTORY_NOT_APPROVED_OR_FUTURE_DATE');
      const result=await this.prisma.$queryRaw<any[]>(Prisma.sql`WITH scoped AS MATERIALIZED (
        SELECT business_key,event_date,COALESCE(data->>'ProductName',data->>'CustomerName',data->>'RouteName',data->>'RegionName',data->>'BranchName',data->>'EmployeeName') AS name,
          CASE WHEN ${entity}='Products' THEN NULLIF(btrim(data->>'Category'),'') END AS category
        FROM erp_import_rows WHERE project_id=${allowed[0].id} AND entity=${entity} AND state='ACCEPTED' AND (event_date IS NULL OR event_date<=${asOf}::date)
          ${demoDailyTypedDateGuard(company,Prisma.sql`event_date`,["Companies","Regions","Branches","Products","Customers","Routes","Employees"].includes(entity))}
      ) SELECT json_build_object('asOf',${asOf}::text,'entity',${entity}::text,'historicalOnly',true,'operationalPostings',false,'total',(SELECT count(*)::integer FROM scoped),'items',COALESCE((SELECT json_agg(x) FROM (SELECT business_key AS key,name,category,event_date AS date FROM scoped ORDER BY business_key LIMIT 50 OFFSET ${(page-1)*50}) x),'[]'::json)) AS result`);
      return result[0]!.result;
    });
  }
}
