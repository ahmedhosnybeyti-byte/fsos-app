import { Body, Controller, ForbiddenException, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { fsos360FilterOptionsSchema, fsos360QuerySchema, type Fsos360FilterOptionsQuery, type Fsos360Query } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { Fsos360WorkspaceService } from "./fsos-360-workspace.service";

@ApiTags("fsos-360")
@Controller("fsos-360")
export class Fsos360Controller {
  constructor(private readonly workspaceService: Fsos360WorkspaceService) {}

  @Post("query")
  @Auth()
  query(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(fsos360QuerySchema)) body: Fsos360Query) {
    if (!user.companyId) throw new ForbiddenException();
    return this.workspaceService.query(user, body);
  }

  @Post("filter-options")
  @Auth()
  filterOptions(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(fsos360FilterOptionsSchema)) body: Fsos360FilterOptionsQuery) {
    if (!user.companyId) throw new ForbiddenException();
    return this.workspaceService.filterOptions(user, body);
  }

  @Get("capabilities")
  @Auth()
  capabilities(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.workspaceService.capabilities(user);
  }
}
