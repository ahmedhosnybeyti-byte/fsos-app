import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";
import { ManualPaymentProvider } from "./providers/manual-payment.provider";

@Module({
  providers: [
    PaymentsService,
    ManualPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: ManualPaymentProvider },
  ],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
