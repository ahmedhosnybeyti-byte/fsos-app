import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  heatmapDecisionSchema,
  heatmapInterpretSchema,
  heatmapRieQuerySchema,
  heatmapScopeValuesQuerySchema,
  type HeatmapDecisionInput,
  type HeatmapInterpretInput,
  type HeatmapRieQueryInput,
  type HeatmapScopeValuesQueryInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { HeatmapService } from "./heatmap.service";

// Migration #3 (ADR-001 / RIE Migration Plan) — no file/column mapping.
// Scope-value and category-value dropdowns get their own dedicated
// endpoints here now, same pattern as Migration #2's customer-similarity
// controller, instead of reusing GET /route-planning/distinct-values
// (Route Planning is not yet migrated and still depends on that endpoint
// unmodified).
@ApiTags("heatmap")
@Controller("heatmap")
export class HeatmapController {
  constructor(private readonly heatmapService: HeatmapService) {}

  @Get("scope-values")
  @Auth()
  scopeValues(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(heatmapScopeValuesQuerySchema)) query: HeatmapScopeValuesQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.heatmapService.scopeValues(user, query.scopeField);
  }

  @Get("category-values")
  @Auth()
  categoryValues(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.heatmapService.categoryValues(user);
  }

  @Post("query")
  @Auth()
  query(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(heatmapRieQuerySchema)) body: HeatmapRieQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.heatmapService.query(user, body);
  }

  // Translates a free-text request into a structured filter via the Claude
  // API. The frontend applies the suggestion to the query form (visibly, so
  // the user can review/edit it) rather than querying blindly off it.
  @Post("interpret")
  @Auth()
  interpret(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(heatmapInterpretSchema)) body: HeatmapInterpretInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.heatmapService.interpret(user.companyId, body);
  }

  // AI Decision Map — turns the map's already-computed top points into a
  // short prioritized action list via Claude. See heatmap.schemas.ts.
  @Post("decision-summary")
  @Auth()
  decisionSummary(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(heatmapDecisionSchema)) body: HeatmapDecisionInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.heatmapService.decisionSummary(user.companyId, body);
  }
}
