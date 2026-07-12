import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Auth } from "../../common/decorators/auth.decorator";
import { RolesService } from "./roles.service";

@ApiTags("roles")
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // Non-SUPER_ADMIN roles only — used to populate the "assign role" dropdown
  // when a Company Admin creates a user. Companies never see/assign SUPER_ADMIN.
  @Get()
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  async list() {
    const roles = await this.rolesService.list();
    return roles.filter((r) => r.code !== "SUPER_ADMIN");
  }

  // Read-only role -> permissions matrix for the platform Access Control page.
  @Get("permissions-matrix")
  @Auth("SUPER_ADMIN")
  permissionsMatrix() {
    return this.rolesService.listWithPermissions();
  }
}
