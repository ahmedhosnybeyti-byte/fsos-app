import { BadRequestException, Injectable } from "@nestjs/common";
import { getCompanyFeatureAccessState, normalizeCompanyFeatureAccess, wmsPageSchema, type WmsCoverageResult } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WmsService } from "./wms.service";
import { RieWmsCoverageQueryService } from "../rie/wms-coverage-query.service";

@Injectable()
export class WmsCoverageService {
  constructor(private readonly access: WmsService,private readonly rie: RieWmsCoverageQueryService) {}
  async coverage(user: AuthenticatedUser, warehouse: string, input: unknown): Promise<WmsCoverageResult> {
    const parsed=wmsPageSchema.safeParse(input);
    if(!parsed.success)throw new BadRequestException("WMS_INVALID_INPUT");
    const company=await this.access.authorizedRead(user,warehouse);
    const stockAsOf=new Date().toISOString();
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(stockAsOf));
    const to=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
    const from=new Date(Date.parse(to)-29*86400000).toISOString().slice(0,10);
    const {page,search}=parsed.data;
    const procurement=user.permissions.includes("procurement.read")&&getCompanyFeatureAccessState(normalizeCompanyFeatureAccess(user.featureAccess),"procurement")==="ENABLED";
    const rows=await this.rie.query(company,warehouse,user,to,page,search,procurement);
    return {items:rows.slice(0,20),hasMore:rows.length>20,page,from,to,stockAsOf};
  }
}
