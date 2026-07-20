import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  customerSimilarityRieQuerySchema,
  customerSimilarityScopeValuesQuerySchema,
  type CustomerSimilarityRieQueryInput,
  type CustomerSimilarityScopeValuesQueryInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { CustomerSimilarityService } from "./customer-similarity.service";

// Migration #2 (ADR-001 / RIE Migration Plan) — no file/column mapping.
// Scope-value and category-value dropdowns get their own dedicated
// endpoints here instead of reusing GET /route-planning/distinct-values
// (which reads an arbitrary column out of an arbitrary file — Route
// Planning/Heat Map still depend on that endpoint unmodified).
@ApiTags("customer-similarity")
@Controller("customer-similarity")
export class CustomerSimilarityController {
  constructor(private readonly customerSimilarityService: CustomerSimilarityService) {}

  @Get("scope-values")
  @Auth()
  scopeValues(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(customerSimilarityScopeValuesQuerySchema)) query: CustomerSimilarityScopeValuesQueryInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.customerSimilarityService.scopeValues(user, query.scopeField);
  }

  @Get("category-values")
  @Auth()
  categoryValues(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.customerSimilarityService.categoryValues(user);
  }

  @Post("query")
  @Auth()
  query(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(customerSimilarityRieQuerySchema)) body: CustomerSimilarityRieQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.customerSimilarityService.query(user, body);
  }
}
