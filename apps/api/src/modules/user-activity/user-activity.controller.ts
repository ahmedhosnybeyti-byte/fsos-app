import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { UserActivityService } from "./user-activity.service";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
@ApiTags("user-activity") @CompanyScreen("user_activity") @Permissions("user_activity.view") @Controller("admin/user-activity")
export class UserActivityController {
  constructor(private readonly service: UserActivityService) {}
  @Get("tree") @Auth("SUPER_ADMIN", "COMPANY_ADMIN", "MANAGER", "SUPERVISOR") tree(@CurrentUser() user: AuthenticatedUser) { return this.service.tree(user); }
  @Get("search") @Auth("SUPER_ADMIN", "COMPANY_ADMIN", "MANAGER", "SUPERVISOR") search(@CurrentUser() user: AuthenticatedUser, @Query("q") q = "") { return this.service.search(user, q.trim()); }
  @Get("overview") @Auth("SUPER_ADMIN", "COMPANY_ADMIN", "MANAGER", "SUPERVISOR") overview(@CurrentUser() user: AuthenticatedUser, @Query("from") from?: string, @Query("to") to?: string) { return this.service.overview(user, from, to); }
  @Get("users/:id/timeline") @Auth("SUPER_ADMIN", "COMPANY_ADMIN", "MANAGER", "SUPERVISOR") timeline(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("from") from?: string, @Query("to") to?: string, @Query("category") category?: string) { return this.service.timeline(user, id, from, to, category); }
}
