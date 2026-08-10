import { Controller, ForbiddenException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ProspectIntelligenceOrchestratorService } from "./prospect-intelligence-orchestrator.service";

@ApiTags("prospect-intelligence")
@Controller("prospects")
export class ProspectIntelligenceController {
  constructor(private readonly service: ProspectIntelligenceOrchestratorService) {}
  @Post(":id/intelligence/enrich") @Auth()
  enrich(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { if (!user.companyId) throw new ForbiddenException(); return this.service.enrich(user, id); }
}
