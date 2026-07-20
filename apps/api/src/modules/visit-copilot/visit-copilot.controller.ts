import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  visitCopilotBriefingQuerySchema,
  visitCopilotChatRequestSchema,
  visitCopilotDailyBriefQuerySchema,
  visitCopilotDiscoveryQuerySchema,
  visitCopilotGoogleSearchRequestSchema,
  visitCopilotPlanRequestSchema,
  visitCopilotProspectStatusRequestSchema,
  type VisitCopilotBriefingQuery,
  type VisitCopilotChatRequest,
  type VisitCopilotDailyBriefQuery,
  type VisitCopilotDiscoveryQuery,
  type VisitCopilotGoogleSearchRequest,
  type VisitCopilotPlanRequest,
  type VisitCopilotProspectStatusRequest,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { VisitCopilotService } from "./visit-copilot.service";

// AI Visit Copilot. Phase 1: decision-support endpoints for the rep's day —
// today's plan basis, plan reordering, per-customer pre-visit briefing, and
// a scoped chat. Phase 2 (Customer Discovery): prospect map + scoring,
// Google Places discovery, prospect statuses, route opportunities, and a
// prospect-mode briefing/chat. All numbers respect one Analysis Scope
// period param (default: last 3 months).
@ApiTags("visit-copilot")
@Controller("visit-copilot")
export class VisitCopilotController {
  constructor(private readonly visitCopilotService: VisitCopilotService) {}

  @Get("daily-brief")
  @Auth()
  dailyBrief(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(visitCopilotDailyBriefQuerySchema)) query: VisitCopilotDailyBriefQuery,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.dailyBrief(user, query);
  }

  @Post("plan")
  @Auth()
  plan(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(visitCopilotPlanRequestSchema)) body: VisitCopilotPlanRequest) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.plan(user, body);
  }

  @Get("briefing/:customerCode")
  @Auth()
  briefing(
    @CurrentUser() user: AuthenticatedUser,
    @Param("customerCode") customerCode: string,
    @Query(new ZodValidationPipe(visitCopilotBriefingQuerySchema)) query: VisitCopilotBriefingQuery,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.briefing(user, customerCode, query);
  }

  @Post("chat")
  @Auth()
  chat(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(visitCopilotChatRequestSchema)) body: VisitCopilotChatRequest) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.chat(user, body);
  }

  // ------------------------------------------------------------------
  // Customer Discovery — Phase 2
  // ------------------------------------------------------------------

  @Get("discovery")
  @Auth()
  discovery(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(visitCopilotDiscoveryQuerySchema)) query: VisitCopilotDiscoveryQuery,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.discovery(user, query);
  }

  // "Search around me" — provider-based (OSM/Overpass by default, Google
  // Places when the company configured it). The historical "google-search"
  // path is kept for frontend compatibility; "search" is the
  // provider-neutral alias for new callers.
  @Post("discovery/google-search")
  @Auth()
  googleSearch(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(visitCopilotGoogleSearchRequestSchema)) body: VisitCopilotGoogleSearchRequest,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.discoverySearch(user, body);
  }

  @Post("discovery/search")
  @Auth()
  discoverySearch(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(visitCopilotGoogleSearchRequestSchema)) body: VisitCopilotGoogleSearchRequest,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.discoverySearch(user, body);
  }

  @Patch("prospects/:id/status")
  @Auth()
  updateProspectStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(visitCopilotProspectStatusRequestSchema)) body: VisitCopilotProspectStatusRequest,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.updateProspectStatus(user, id, body);
  }

  @Get("route-opportunities")
  @Auth()
  routeOpportunities(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(visitCopilotDiscoveryQuerySchema)) query: VisitCopilotDiscoveryQuery,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.routeOpportunities(user, query);
  }

  // Same query shape as the customer briefing (period + vanStock) — the
  // response mirrors the customer briefing too, plus isProspect:true.
  @Get("prospect-briefing/:id")
  @Auth()
  prospectBriefing(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(visitCopilotBriefingQuerySchema)) query: VisitCopilotBriefingQuery,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.prospectBriefing(user, id, query);
  }
}
