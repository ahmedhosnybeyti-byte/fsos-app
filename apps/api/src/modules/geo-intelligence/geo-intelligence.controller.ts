import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  geoIntelligenceAnalyzeSchema,
  geoIntelligenceCompareRieSchema,
  geoIntelligenceCompareCustomersQuerySchema,
  geoIntelligenceCustomersQuerySchema,
  geoIntelligenceExpansionSchema,
  geoIntelligenceExpansionScopeValuesQuerySchema,
  geoIntelligenceTalkingPointsSchema,
  type GeoIntelligenceAnalyzeInput,
  type GeoIntelligenceCompareRieInput,
  type GeoIntelligenceCompareCustomersQueryInput,
  type GeoIntelligenceCustomersQueryInput,
  type GeoIntelligenceExpansionInput,
  type GeoIntelligenceExpansionScopeValuesQueryInput,
  type GeoIntelligenceTalkingPointsInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { GeoIntelligenceService } from "./geo-intelligence.service";

// New Customer — Geo Intelligence. Deliberately narrow: location capture +
// reference-customer resolution + product-assortment analysis, then stop —
// no invoice/order/customer-creation steps (see PROJECT_LOG.md).
@ApiTags("geo-intelligence")
@Controller("geo-intelligence")
export class GeoIntelligenceController {
  constructor(private readonly geoIntelligenceService: GeoIntelligenceService) {}

  // Powers the manual "search & add customer" step.
  @Get("customers")
  @Auth()
  listCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(geoIntelligenceCustomersQuerySchema)) query: GeoIntelligenceCustomersQueryInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoIntelligenceService.listCustomers(user, query);
  }

  @Post("analyze")
  @Auth()
  analyze(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(geoIntelligenceAnalyzeSchema)) body: GeoIntelligenceAnalyzeInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoIntelligenceService.analyze(user, body);
  }

  // "What do customer X's neighbors buy that X doesn't?" — sales-gap /
  // upsell view for an existing customer (as opposed to analyze(), which is
  // for a brand-new customer at a freshly-captured location).
  //
  // Migration #1 (ADR-001 / RIE Migration Plan): no fileId/column mapping —
  // reads via RieFacade against the Canonical Schema.
  @Get("compare/customers")
  @Auth()
  compareCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(geoIntelligenceCompareCustomersQuerySchema)) query: GeoIntelligenceCompareCustomersQueryInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoIntelligenceService.listCustomersViaRie(user, query);
  }

  @Post("compare")
  @Auth()
  compare(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(geoIntelligenceCompareRieSchema)) body: GeoIntelligenceCompareRieInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoIntelligenceService.compareCustomerViaRie(user, body);
  }

  // New Customer Expansion Map, territory-level upgrade — see the schema
  // comment for what this scores. Migration #5 (ADR-001 / RIE Migration
  // Plan) — no file/column mapping, RIE-backed scope dropdown.
  @Get("expansion/scope-values")
  @Auth()
  expansionScopeValues(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(geoIntelligenceExpansionScopeValuesQuerySchema)) query: GeoIntelligenceExpansionScopeValuesQueryInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoIntelligenceService.expansionScopeValues(user, query.scopeField);
  }

  @Post("expansion")
  @Auth()
  expansion(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(geoIntelligenceExpansionSchema)) body: GeoIntelligenceExpansionInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoIntelligenceService.expansion(user, body);
  }

  @Post("talking-points")
  @Auth()
  talkingPoints(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(geoIntelligenceTalkingPointsSchema)) body: GeoIntelligenceTalkingPointsInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoIntelligenceService.talkingPoints(user.companyId, body);
  }
}
