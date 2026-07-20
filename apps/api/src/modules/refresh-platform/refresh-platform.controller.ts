import { Body, Controller, ForbiddenException, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { triggerRefreshSchema, type TriggerRefreshInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RefreshOrchestratorService } from "./refresh-orchestrator.service";
import { RefreshHistoryService } from "./refresh-history.service";

// Phase 8 — Refresh Platform. Triggering a refresh is COMPANY_ADMIN-only
// (same write-permission tier as Phase 6 data source mutations); reading
// history is open to any authenticated role, same pattern as everywhere
// else in Company Management.
@ApiTags("refresh-platform")
@Controller("companies/me/refresh")
export class RefreshPlatformController {
  constructor(
    private readonly orchestrator: RefreshOrchestratorService,
    private readonly historyService: RefreshHistoryService,
  ) {}

  @Post()
  @Auth("COMPANY_ADMIN")
  trigger(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(triggerRefreshSchema)) body: TriggerRefreshInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orchestrator.requestRefresh(user.companyId, body.dataSourceId, user.userId, body.refreshType ?? "FULL");
  }

  @Get("history")
  @Auth()
  history(@CurrentUser() user: AuthenticatedUser, @Query("dataSourceId") dataSourceId?: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.historyService.list(user.companyId, dataSourceId);
  }

  @Get(":id")
  @Auth()
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.historyService.getOne(user.companyId, id);
  }
}
