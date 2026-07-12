import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { paginationQuerySchema, recordManualPaymentSchema, type RecordManualPaymentInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SkipSubscriptionCheck } from "../../common/decorators/skip-subscription-check.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("companies/:companyId")
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  record(
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(recordManualPaymentSchema)) body: RecordManualPaymentInput,
  ) {
    return this.paymentsService.recordManualPayment(companyId, body);
  }

  @Get("me")
  @Auth("COMPANY_ADMIN")
  @SkipSubscriptionCheck()
  getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) pagination: { page: number; pageSize: number },
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.paymentsService.listForCompany(user.companyId, pagination);
  }

  @Get()
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  list(@Query(new ZodValidationPipe(paginationQuerySchema)) pagination: { page: number; pageSize: number }) {
    return this.paymentsService.listAll(pagination);
  }
}
