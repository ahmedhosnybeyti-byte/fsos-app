import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  companyLifecycleEventSchema,
  paginationQuerySchema,
  updateCompanySchema,
  updateCompanyProfileSchema,
  type CompanyLifecycleEvent,
  type UpdateCompanyInput,
  type UpdateCompanyProfileInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SkipSubscriptionCheck } from "../../common/decorators/skip-subscription-check.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { CompaniesService } from "./companies.service";

@ApiTags("companies")
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // Any authenticated user needs their own company's basic info (dashboard
  // header, name) even if the subscription itself is inactive.
  @Get("me")
  @Auth()
  @SkipSubscriptionCheck()
  async getMyCompany(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new NotFoundException("Not associated with a company");
    const company = await this.companiesService.findById(user.companyId);
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  @Patch("me")
  @Auth("COMPANY_ADMIN")
  async updateMyCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateCompanySchema.pick({ name: true }))) body: { name?: string },
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.companiesService.update(user.companyId, body);
  }

  @Get()
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  list(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: { page: number; pageSize: number },
    @Query("search") search?: string,
  ) {
    return this.companiesService.list(query, search);
  }

  @Get(":id")
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  async getOne(@Param("id") id: string) {
    const company = await this.companiesService.findById(id);
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }

  @Patch(":id")
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyInput) {
    return this.companiesService.update(id, body);
  }

  // --- Phase 2: Company Profile (editable identity, distinct from the
  // immutable Company id/slug/name-at-signup) ---

  @Get("me/profile")
  @Auth()
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.companiesService.getProfile(user.companyId);
  }

  @Patch("me/profile")
  @Auth("COMPANY_ADMIN")
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateCompanyProfileSchema)) body: UpdateCompanyProfileInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.companiesService.updateProfile(user.companyId, body);
  }

  // --- Phase 2: Company Lifecycle transitions (Activate/Suspend/Reactivate/
  // Archive). SUPER_ADMIN-only: these are platform-level governance actions,
  // not something a COMPANY_ADMIN self-serves.
  @Post(":id/lifecycle/:event")
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  async transitionLifecycle(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("event", new ZodValidationPipe(companyLifecycleEventSchema)) event: CompanyLifecycleEvent,
  ) {
    return this.companiesService.transitionStatus(id, event, user.userId);
  }
}
