import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ComplianceService } from "./compliance.service";

@ApiTags("governance")
@Controller("companies/me/compliance")
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get()
  @Auth("COMPANY_ADMIN")
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.complianceService.getOverview(user.companyId);
  }
}
