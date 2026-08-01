import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { RoleCode } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RolesService } from "./roles.service";

@ApiTags("roles")
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  @Permissions("users.view")
  async list() { return (await this.rolesService.list()).filter((role) => role.code !== "SUPER_ADMIN"); }

  @Get("permissions-matrix")
  @Auth("SUPER_ADMIN")
  @Permissions("access_control.view")
  permissionsMatrix() { return this.rolesService.listWithPermissions(); }

  @Patch(":roleCode/permissions")
  @Auth("SUPER_ADMIN")
  @Permissions("access_control.manage")
  updatePermissions(@CurrentUser() actor: AuthenticatedUser, @Param("roleCode") roleCode: RoleCode, @Body() body: { permissions?: string[] }) {
    return this.rolesService.updatePermissions(roleCode, Array.isArray(body.permissions) ? body.permissions : [], actor);
  }
}