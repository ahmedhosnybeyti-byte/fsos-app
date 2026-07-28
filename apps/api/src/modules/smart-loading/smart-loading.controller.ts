import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SmartLoadingService } from "./smart-loading.service";

// Read-only. Visibility is narrowed server-side inside the service via RIE
// hierarchy scoping (same convention as sgi.controller.ts's getLatest) —
// no manual scope picker, any authenticated role may call this and only
// ever sees their own hierarchy's data.
@ApiTags("smart-loading")
@Controller("smart-loading")
export class SmartLoadingController {
  constructor(private readonly smartLoadingService: SmartLoadingService) {}

  @Get("session")
  @Auth()
  getSession(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.smartLoadingService.getSession(user);
  }
}
