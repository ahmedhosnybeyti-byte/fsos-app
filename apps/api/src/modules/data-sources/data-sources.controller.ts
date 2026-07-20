import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  createDataSourceSchema,
  updateDataSourceSchema,
  type CreateDataSourceInput,
  type DataSourceStatus,
  type UpdateDataSourceInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { DataSourcesService } from "./data-sources.service";

// Phase 6 — Data Sources Management. Reads open to any authenticated role
// (other engines/screens need to know what sources exist); writes
// (create/update/delete/test-connection) are COMPANY_ADMIN-only, same
// pattern as Branches/Employees.
@ApiTags("data-sources")
@Controller("companies/me/data-sources")
export class DataSourcesController {
  constructor(private readonly dataSourcesService: DataSourcesService) {}

  @Get()
  @Auth()
  list(@CurrentUser() user: AuthenticatedUser, @Query("status") status?: DataSourceStatus, @Query("type") type?: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.dataSourcesService.list(user.companyId, { status, type });
  }

  @Get(":id")
  @Auth()
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.dataSourcesService.getOne(user.companyId, id);
  }

  @Post()
  @Auth("COMPANY_ADMIN")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDataSourceSchema)) body: CreateDataSourceInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.dataSourcesService.create(user.companyId, body, user.userId);
  }

  @Patch(":id")
  @Auth("COMPANY_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDataSourceSchema)) body: UpdateDataSourceInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.dataSourcesService.update(user.companyId, id, body, user.userId);
  }

  @Delete(":id")
  @Auth("COMPANY_ADMIN")
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    await this.dataSourcesService.delete(user.companyId, id, user.userId);
    return { success: true };
  }

  @Post(":id/test-connection")
  @Auth("COMPANY_ADMIN")
  testConnection(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.dataSourcesService.testConnection(user.companyId, id, user.userId);
  }
}
