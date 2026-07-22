import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  decisionFilterOptionsQuerySchema,
  decisionQueryInputSchema,
  decisionTableQueryInputSchema,
  type DecisionFilterOptionsQuery,
  type DecisionQueryInput,
  type DecisionTableQueryInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { DecisionAnalyticsStudioService } from "./decision-analytics-studio.service";

// Row-level hierarchy scoping (who sees which customers/situations) happens
// automatically inside RieFacade/SgiService based on the requesting user's
// roleCode/email — same convention as every other RIE-backed module, this
// controller never filters by hierarchy itself.
@ApiTags("decision-analytics-studio")
@Controller("decision-analytics-studio")
export class DecisionAnalyticsStudioController {
  constructor(private readonly service: DecisionAnalyticsStudioService) {}

  @Post("query")
  @Auth()
  query(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(decisionQueryInputSchema)) body: DecisionQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.service.query(user, body);
  }

  @Get("filter-options")
  @Auth()
  filterOptions(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(decisionFilterOptionsQuerySchema)) query: DecisionFilterOptionsQuery) {
    if (!user.companyId) throw new ForbiddenException();
    return this.service.filterOptions(user, query.field);
  }

  @Post("table")
  @Auth()
  table(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(decisionTableQueryInputSchema)) body: DecisionTableQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.service.table(user, body);
  }
}
