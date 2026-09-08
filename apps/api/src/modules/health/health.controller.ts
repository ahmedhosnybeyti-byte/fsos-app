import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { HealthService } from "./health.service";

// Unauthenticated liveness endpoint for Railway healthchecks / uptime
// monitoring. Deliberately outside the global "api/v1" prefix (see
// main.ts's setGlobalPrefix exclude list) so it's reachable at the plain
// GET /health path a platform healthcheck would expect, not
// /api/v1/health.
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  check() {
    return { status: "ok" };
  }

  @Get("ready")
  @Public()
  async ready() {
    if (!(await this.healthService.isReady())) {
      throw new ServiceUnavailableException({ status: "not_ready" });
    }
    return { status: "ready" };
  }
}
