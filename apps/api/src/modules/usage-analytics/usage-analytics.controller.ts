import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SkipSubscriptionCheck } from "../../common/decorators/skip-subscription-check.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { UsageAnalyticsService } from "./usage-analytics.service";

@ApiTags("usage")
@Controller("usage")
export class UsageAnalyticsController {
  constructor(private readonly usageAnalyticsService: UsageAnalyticsService) {}

  @Get("me")
  @Auth("COMPANY_ADMIN", "MANAGER")
  @SkipSubscriptionCheck()
  getMine(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.usageAnalyticsService.getCompanyStats(user.companyId);
  }

  @Get("platform")
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  getPlatform() {
    return this.usageAnalyticsService.getPlatformStats();
  }
}
