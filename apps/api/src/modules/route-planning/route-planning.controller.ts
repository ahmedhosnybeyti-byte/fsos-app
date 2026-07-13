import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  routePlanningDistinctValuesSchema,
  routePlanningSplitSchema,
  type RoutePlanningDistinctValuesInput,
  type RoutePlanningSplitInput,
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

  // Powers the scope-value dropdown (e.g. "which SalesmanID / TerritoryID
  // do you want to split") so the user picks from real values instead of
  // typing one by hand.
  @Get("distinct-values")
  @Auth()
  listDistinctValues(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(routePlanningDistinctValuesSchema)) query: RoutePlanningDistinctValuesInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.routePlanningService.listDistinctValues(user.companyId, query.fileId, query.column);
  }

  @Post("split")
  @Auth()
  split(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(routePlanningSplitSchema)) body: RoutePlanningSplitInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.routePlanningService.split(user.companyId, body);
  }
}
