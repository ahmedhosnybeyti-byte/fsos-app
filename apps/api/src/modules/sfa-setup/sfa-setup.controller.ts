import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { createWarehouseSchema, updateWarehouseSchema, warehouseListQuerySchema, type CreateWarehouseInput, type UpdateWarehouseInput, type WarehouseListQuery } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SfaSetupService } from "./sfa-setup.service";

@Controller("sfa")
@Auth("COMPANY_ADMIN")
@RequiresSfa("company.manage")
@CompanyScreen("sfa-setup")
export class SfaSetupController {
  constructor(private readonly service: SfaSetupService) {}

  private company(user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException("A company context is required");
    return user.companyId;
  }

  @Get("setup-checklist")
  checklist(@CurrentUser() user: AuthenticatedUser) { return this.service.checklist(this.company(user)); }

  @Get("warehouses")
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(warehouseListQuerySchema)) query: WarehouseListQuery) {
    return this.service.list(this.company(user), query);
  }

  @Get("warehouses/:id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.service.get(this.company(user), id); }

  @Post("warehouses")
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createWarehouseSchema)) body: CreateWarehouseInput) {
    return this.service.create(this.company(user), body, user.userId);
  }

  @Patch("warehouses/:id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateWarehouseSchema)) body: UpdateWarehouseInput) {
    return this.service.update(this.company(user), id, body, user.userId);
  }

  @Patch("warehouses/:id/branches")
  setBranches(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) {
    return this.service.setBranches(this.company(user), id, body, user.userId);
  }
}
