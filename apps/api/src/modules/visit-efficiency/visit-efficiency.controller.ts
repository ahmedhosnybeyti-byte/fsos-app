import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  visitEfficiencyRieQuerySchema,
  visitEfficiencyScopeValuesQuerySchema,
  type VisitEfficiencyRieQueryInput,
  type VisitEfficiencyScopeValuesQueryInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { VisitEfficiencyService } from "./visit-efficiency.service";

// Migration #6 (ADR-001 / RIE Migration Plan) — no fileId/column mapping.
@ApiTags("visit-efficiency")
@Controller("visit-efficiency")
export class VisitEfficiencyController {
  constructor(private readonly visitEfficiencyService: VisitEfficiencyService) {}

  @Get("scope-values")
  @Auth()
  scopeValues(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(visitEfficiencyScopeValuesQuerySchema)) query: VisitEfficiencyScopeValuesQueryInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitEfficiencyService.scopeValues(user, query.scopeField);
  }

  @Post("query")
  @Auth()
  query(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(visitEfficiencyRieQuerySchema)) body: VisitEfficiencyRieQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitEfficiencyService.query(user, body);
  }
}
