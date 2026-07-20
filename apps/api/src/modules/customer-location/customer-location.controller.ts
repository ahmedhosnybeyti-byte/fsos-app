import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { captureCustomerLocationSchema, type CaptureCustomerLocationInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { CustomerLocationService } from "./customer-location.service";

// Field-captured customer coordinates — for companies whose Customers file
// has missing/incomplete lat/lon. See customer-location.schemas.ts for the
// full rationale (Snapshots-not-Live, no in-place file rewriting).
@ApiTags("customer-location")
@Controller("customer-locations")
export class CustomerLocationController {
  constructor(private readonly customerLocationService: CustomerLocationService) {}

  // Any authenticated role can capture — same reasoning as file upload
  // (files.controller.ts): this is field data collection, not an
  // organizational-role-restricted setting.
  @Post()
  @Auth()
  capture(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(captureCustomerLocationSchema)) body: CaptureCustomerLocationInput) {
    return this.customerLocationService.capture(user, body);
  }

  // Export view — COMPANY_ADMIN/MANAGER only, matches the read-gate on
  // Team Performance/Targets' write paths (this surfaces every rep's
  // captures company-wide, not just the caller's own).
  @Get()
  @Auth("COMPANY_ADMIN", "MANAGER")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.customerLocationService.listLatestPerCustomer(user);
  }
}
