import { Body, Controller, ForbiddenException, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  teamPerformanceCoachSchema,
  teamPerformanceRieQuerySchema,
  type TeamPerformanceCoachInput,
  type TeamPerformanceRieQueryInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TeamPerformanceService } from "./team-performance.service";

// Strategic point 3's second half — a screen for MANAGER/SUPERVISOR (and
// COMPANY_ADMIN) with rollup numbers about their sales team. Deliberately
// excludes SALES_REP: this screen shows OTHER people's numbers. Migration
// #7 (ADR-001 / RIE Migration Plan) — RieFacade's Hierarchy Row-Level
// Filter (driven by rieContext(user) in the service) already narrows a
// SUPERVISOR down to just their own team even if they somehow reached this
// endpoint — the @Auth gate here is the product-level boundary, not the
// only enforcement.
@ApiTags("team-performance")
@Controller("team-performance")
export class TeamPerformanceController {
  constructor(private readonly teamPerformanceService: TeamPerformanceService) {}

  @Post("query")
  @Auth("COMPANY_ADMIN", "MANAGER", "SUPERVISOR")
  query(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(teamPerformanceRieQuerySchema)) body: TeamPerformanceRieQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.teamPerformanceService.query(user, body);
  }

  // On-demand only (per explicit product decision) — no automatic call per
  // rep on screen load. Pure computation, no external API, so this is safe
  // to call as often as the user clicks the button.
  @Post("coach")
  @Auth("COMPANY_ADMIN", "MANAGER", "SUPERVISOR")
  coach(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(teamPerformanceCoachSchema)) body: TeamPerformanceCoachInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.teamPerformanceService.coach(body);
  }
}
