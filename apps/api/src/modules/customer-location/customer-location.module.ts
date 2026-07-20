import { Module } from "@nestjs/common";
import { CustomerLocationService } from "./customer-location.service";
import { CustomerLocationController } from "./customer-location.controller";

@Module({
  providers: [CustomerLocationService],
  controllers: [CustomerLocationController],
  exports: [CustomerLocationService],
})
export class CustomerLocationModule {}
