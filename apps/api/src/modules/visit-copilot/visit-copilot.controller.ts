import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  visitCopilotBriefingQuerySchema,
  visitCopilotChatRequestSchema,
  visitCopilotDailyBriefQuerySchema,
  visitCopilotDaily360SummaryQuerySchema,
  visitCopilotDiscoveryQuerySchema,
  visitCopilotGoogleSearchRequestSchema,
  visitCopilotPlanRequestSchema,
  visitCopilotProspectStatusRequestSchema,
  type VisitCopilotBriefingQuery,
  type VisitCopilotChatRequest,
  type VisitCopilotDailyBriefQuery,
  type VisitCopilotDaily360SummaryQuery,
  createLostOpportunityExclusionSchema,
  type CreateLostOpportunityExclusion,
  type VisitCopilotDiscoveryQuery,
  type VisitCopilotGoogleSearchRequest,
  type VisitCopilotPlanRequest,
  type VisitCopilotProspectStatusRequest,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { RequiresPaidPlan } from "../../common/decorators/requires-paid-plan.decorator";
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
  @RequiresPaidPlan()
  chat(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(visitCopilotChatRequestSchema)) body: VisitCopilotChatRequest) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.chat(user, body);
  }

  // "ملخص اليوم 360°" — see visit-copilot.schemas.ts's DTO comment. No scope
  // query param on purpose: role scoping is entirely server-derived from
  // `user` (SgiService.getLatest's own hierarchy filter), same as every
  // other endpoint in this controller.
  @Get("daily-360-summary")
  @Auth()
  daily360Summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(visitCopilotDaily360SummaryQuerySchema)) query: VisitCopilotDaily360SummaryQuery,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.daily360Summary(user, query);
  }

  // ------------------------------------------------------------------
  // Customer Discovery — Phase 2
  // ------------------------------------------------------------------

  @Get("lost-opportunity-exclusions")
  @Auth()
  listLostOpportunityExclusions(@CurrentUser() user: AuthenticatedUser) {
    return this.visitCopilotService.listLostOpportunityExclusions(user);
  }

  @Post("lost-opportunity-exclusions")
  @Auth()
  createLostOpportunityExclusion(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createLostOpportunityExclusionSchema)) body: CreateLostOpportunityExclusion,
  ) {
    return this.visitCopilotService.createLostOpportunityExclusion(user, body);
  }

  @Post("lost-opportunity-exclusions/:id/revoke")
  @Auth()
  revokeLostOpportunityExclusion(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.visitCopilotService.revokeLostOpportunityExclusion(user, id);
  }

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

  @Get("discovery/limit")
  @Auth()
  discoveryLimit(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.visitCopilotService.discoveryLimit(user);
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
