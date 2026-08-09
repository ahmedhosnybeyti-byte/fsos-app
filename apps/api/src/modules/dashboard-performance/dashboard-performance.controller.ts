import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { DashboardPerformanceService } from "./dashboard-performance.service";

const dashboardPerformanceQuerySchema = z.object({ benchmark: z.enum(["previous-month", "previous-quarter-average"]).default("previous-month") });
type DashboardPerformanceQuery = z.infer<typeof dashboardPerformanceQuerySchema>;

@ApiTags("dashboard-performance")
@Controller("dashboard-performance")
export class DashboardPerformanceController {
  constructor(private readonly service: DashboardPerformanceService) {}
  @Get()
  @Auth()
  get(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(dashboardPerformanceQuerySchema)) query: DashboardPerformanceQuery) {
    return this.service.get(user, query.benchmark);
  }
}
