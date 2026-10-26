import { Body, Controller, Param, Post } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SkipSubscriptionCheck } from "../../common/decorators/skip-subscription-check.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { WarehouseBootstrapService } from "./warehouse-bootstrap.service";

// Narrow platform control-plane operation; never a SUPER_ADMIN SFA bypass.
@Controller("platform/companies/:companyId/warehouses/:warehouseId/manager-bootstrap")
@Auth("SUPER_ADMIN")
@Permissions("platform.admin")
@SkipSubscriptionCheck()
export class WarehouseBootstrapController {
  constructor(private readonly service: WarehouseBootstrapService) {}
  @Post()
  assign(@CurrentUser() actor: AuthenticatedUser, @Param("companyId") company: string,
    @Param("warehouseId") warehouse: string, @Body() input: unknown) {
    return this.service.assign(actor, company, warehouse, input);
  }
}
