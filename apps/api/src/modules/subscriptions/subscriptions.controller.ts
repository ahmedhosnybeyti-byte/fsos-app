import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { paginationQuerySchema, updateSubscriptionSchema, type UpdateSubscriptionInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SkipSubscriptionCheck } from "../../common/decorators/skip-subscription-check.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // Must work even when the subscription itself is inactive — this is the
  // endpoint that tells the user *why* they're locked out.
  @Get("me")
  @Auth()
  @SkipSubscriptionCheck()
  async getMine(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    const subscription = await this.subscriptionsService.findCurrentForCompany(user.companyId);
    if (!subscription) throw new NotFoundException("No subscription found");
    return subscription;
  }

  @Get()
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) pagination: { page: number; pageSize: number }) {
    return this.subscriptionsService.listAll(pagination);
  }

  @Patch(":companyId")
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  update(
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema)) body: UpdateSubscriptionInput,
  ) {
    return this.subscriptionsService.updateForCompany(companyId, body);
  }
}
