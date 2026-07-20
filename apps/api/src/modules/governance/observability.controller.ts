import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { ObservabilityService } from "./observability.service";

// Platform-wide (cross-company), SUPER_ADMIN-only — same tier as
// PlatformSettingsController's platform-governance actions.
@ApiTags("governance")
@Controller("platform/observability")
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get()
  @Auth("SUPER_ADMIN")
  getMetrics() {
    return this.observabilityService.getMetrics();
  }
}
