import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { smartLoadingRecalculateInputSchema, type SmartLoadingRecalculateInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SmartLoadingService } from "./smart-loading.service";

@ApiTags("smart-loading")
@Controller("smart-loading")
export class SmartLoadingController {
  constructor(private readonly smartLoadingService: SmartLoadingService) {}
  @Get("session") @Auth()
  getSession(@CurrentUser() user: AuthenticatedUser, @Query("targetDate") targetDate?: string, @Query("asOfDate") asOfDate?: string) { if (!user.companyId) throw new ForbiddenException(); return this.smartLoadingService.getSession(user, targetDate ?? asOfDate); }
  @Get("customers/search") @Auth()
  searchCustomers(@CurrentUser() user: AuthenticatedUser, @Query("q") q?: string, @Query("excludeCustomerCodes") excluded?: string) { if (!user.companyId) throw new ForbiddenException(); return this.smartLoadingService.searchCustomers(user, q, excluded?.split(",")); }
  @Post("recalculate") @Auth()
  recalculate(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(smartLoadingRecalculateInputSchema)) body: SmartLoadingRecalculateInput) { if (!user.companyId) throw new ForbiddenException(); return this.smartLoadingService.recalculate(user, body); }
}