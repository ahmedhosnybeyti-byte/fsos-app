import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TerritoryIntelligenceService } from "./territory-intelligence.service";

// Territory Intelligence — GET-only, no request body (both endpoints derive
// their own current-vs-previous-month window internally, same as SGI's
// recalculateForCompany). Row-level hierarchy scoping (who sees which
// customers/situations) happens automatically inside RieFacade/SgiService
// based on the requesting user's roleCode/email — this controller never
// filters by hierarchy itself, same convention as every other RIE-backed
// module.
@ApiTags("territory-intelligence")
@Controller("territory-intelligence")
export class TerritoryIntelligenceController {
  constructor(private readonly service: TerritoryIntelligenceService) {}

  @Get("summary")
  @Auth()
  summary(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.service.getSummary(user);
  }

  @Get("executive")
  @Auth()
  executive(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.service.getExecutive(user);
  }
}
