import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  routePlanningDistinctValuesSchema,
  routePlanningRieSplitSchema,
  routePlanningScopeValuesQuerySchema,
  type RoutePlanningDistinctValuesInput,
  type RoutePlanningRieSplitInput,
  type RoutePlanningScopeValuesQueryInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RoutePlanningService } from "./route-planning.service";

@ApiTags("route-planning")
@Controller("route-planning")
export class RoutePlanningController {
  constructor(private readonly routePlanningService: RoutePlanningService) {}

  // UNCHANGED (legacy, file+column based) — New Customer / Geo Intelligence
  // (not yet migrated) still depends on this for its own arbitrary
  // uploaded-file column dropdowns. Do not touch.
  @Get("distinct-values")
  @Auth()
  listDistinctValues(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(routePlanningDistinctValuesSchema)) query: RoutePlanningDistinctValuesInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.routePlanningService.listDistinctValues(user, query.fileId, query.column);
  }

  // Migration #4 (ADR-001 / RIE Migration Plan) — this screen's own
  // RIE-backed scope dropdown, same pattern as Migrations #2/#3.
  @Get("scope-values")
  @Auth()
  scopeValues(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(routePlanningScopeValuesQuerySchema)) query: RoutePlanningScopeValuesQueryInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.routePlanningService.scopeValues(user, query.scopeField);
  }

  @Post("split")
  @Auth()
  split(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(routePlanningRieSplitSchema)) body: RoutePlanningRieSplitInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.routePlanningService.split(user, body);
  }
}
