import { Body, Controller, ForbiddenException, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { upsertCompanyPolicySchema, type UpsertCompanyPolicyInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { CompanyPolicyService } from "./company-policy.service";

// Phase 9 — Company Policy Engine. Reads open to any authenticated role
// (other engines/screens may need to know a policy exists); defining/
// updating a policy is COMPANY_ADMIN-only, same tier as Branches/Employees/
// Data Sources writes.
@ApiTags("governance")
@Controller("companies/me/policies")
export class CompanyPolicyController {
  constructor(private readonly policyService: CompanyPolicyService) {}

  @Get()
  @Auth()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.policyService.list(user.companyId);
  }

  @Post()
  @Auth("COMPANY_ADMIN")
  upsert(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(upsertCompanyPolicySchema)) body: UpsertCompanyPolicyInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.policyService.upsert(user.companyId, body, user.userId);
  }
}
