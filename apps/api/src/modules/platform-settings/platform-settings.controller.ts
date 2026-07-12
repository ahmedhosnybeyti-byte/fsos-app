import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { updatePlatformSettingsSchema, type UpdatePlatformSettingsInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SkipSubscriptionCheck } from "../../common/decorators/skip-subscription-check.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PlatformSettingsService } from "./platform-settings.service";

@ApiTags("platform-settings")
@Controller("platform-settings")
export class PlatformSettingsController {
  constructor(private readonly platformSettingsService: PlatformSettingsService) {}

  @Get()
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  get() {
    return this.platformSettingsService.get();
  }

  @Patch()
  @Auth("SUPER_ADMIN")
  @SkipSubscriptionCheck()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePlatformSettingsSchema)) body: UpdatePlatformSettingsInput,
  ) {
    return this.platformSettingsService.update(body, user.userId);
  }
}
