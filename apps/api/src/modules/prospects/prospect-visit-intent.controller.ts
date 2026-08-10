import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createProspectVisitIntentSchema, prospectVisitIntentListQuerySchema, updateProspectVisitIntentStatusSchema, type CreateProspectVisitIntentInput, type ProspectVisitIntentListQuery, type UpdateProspectVisitIntentStatusInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ProspectVisitIntentService } from "./prospect-visit-intent.service";

@ApiTags("prospect-visits")
@Controller("prospect-visits")
export class ProspectVisitIntentController {
  constructor(private readonly service: ProspectVisitIntentService) {}
  @Post() @Auth()
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createProspectVisitIntentSchema)) body: CreateProspectVisitIntentInput) { if (!user.companyId) throw new ForbiddenException(); return this.service.create(user, body); }
  @Get() @Auth()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(prospectVisitIntentListQuerySchema)) query: ProspectVisitIntentListQuery) { if (!user.companyId) throw new ForbiddenException(); return this.service.list(user, query); }
  @Patch(":id/status") @Auth()
  updateStatus(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateProspectVisitIntentStatusSchema)) body: UpdateProspectVisitIntentStatusInput) { if (!user.companyId) throw new ForbiddenException(); return this.service.updateStatus(user, id, body); }
}
