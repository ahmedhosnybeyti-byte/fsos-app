import { Body, Controller, ForbiddenException, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  opportunityRadarListQuerySchema,
  opportunityRadarLocationsQuerySchema,
  opportunityTeamFollowUpQuerySchema,
  updateCompanyOpportunitySchema,
  updateOpportunityRadarPreferenceSchema,
  type OpportunityRadarListQuery,
  type OpportunityRadarLocationsQuery,
  type OpportunityTeamFollowUpQuery,
  type UpdateCompanyOpportunityInput,
  type UpdateOpportunityRadarPreferenceInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { OpportunityRadarService } from "./opportunity-radar.service";

const OPERATIONAL_ROLES = ["SALES_REP", "SUPERVISOR", "MANAGER", "COMPANY_ADMIN"] as const;

@ApiTags("opportunity-radar")
@Controller("opportunity-radar")
@CompanyScreen("opportunity-radar")
export class OpportunityRadarController {
  constructor(private readonly service: OpportunityRadarService) {}

  @Get()
  @Auth(...OPERATIONAL_ROLES)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(opportunityRadarListQuerySchema)) query: OpportunityRadarListQuery,
  ) {
    this.requireCompany(user);
    return this.service.list(user, query);
  }

  @Get("assignees")
  @Auth(...OPERATIONAL_ROLES)
  assignees(@CurrentUser() user: AuthenticatedUser) {
    this.requireCompany(user);
    return this.service.listAssignees(user);
  }

  @Get("locations")
  @Auth(...OPERATIONAL_ROLES)
  locations(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(opportunityRadarLocationsQuerySchema)) query: OpportunityRadarLocationsQuery,
  ) {
    this.requireCompany(user);
    return this.service.listLocations(user, query);
  }

  @Get("team-follow-up")
  @Auth("SUPERVISOR", "MANAGER", "COMPANY_ADMIN")
  teamFollowUp(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(opportunityTeamFollowUpQuerySchema)) query: OpportunityTeamFollowUpQuery,
  ) {
    this.requireCompany(user);
    return this.service.teamFollowUp(user, query);
  }

  @Patch(":id/preference")
  @Auth(...OPERATIONAL_ROLES)
  updatePreference(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOpportunityRadarPreferenceSchema)) body: UpdateOpportunityRadarPreferenceInput,
  ) {
    this.requireCompany(user);
    return this.service.updatePreference(user, id, body);
  }

  @Patch(":id")
  @Auth(...OPERATIONAL_ROLES)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCompanyOpportunitySchema)) body: UpdateCompanyOpportunityInput,
  ) {
    this.requireCompany(user);
    return this.service.update(user, id, body);
  }

  private requireCompany(user: AuthenticatedUser): asserts user is AuthenticatedUser & { companyId: string } {
    if (!user.companyId) throw new ForbiddenException("A company context is required");
  }
}
