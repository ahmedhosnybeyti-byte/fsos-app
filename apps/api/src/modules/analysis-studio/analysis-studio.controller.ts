import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AnalysisEventService } from "./analysis-event.service";

@ApiTags("analysis-studio")
@Controller("analysis-studio")
export class AnalysisStudioController {
  constructor(private readonly analysisEventService: AnalysisEventService) {}

  // Polled by the Analysis Studio frontend — newest-first from the DB,
  // reversed here so the feed renders in chronological (reading) order.
  @Get("events")
  @Auth()
  async listEvents(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    const events = await this.analysisEventService.listRecentForUser(user.companyId, user.userId);
    return events.reverse();
  }
}
