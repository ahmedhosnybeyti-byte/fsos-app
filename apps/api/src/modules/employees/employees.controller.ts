import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  createEmployeeSchema,
  linkEmployeeUserSchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type EmploymentStatus,
  type LinkEmployeeUserInput,
  type UpdateEmployeeInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { EmployeesService } from "./employees.service";

// Phase 5 — Employee Management. Reads are open to any authenticated role
// (Employee is reference data other screens will want to look up); writes
// (create/update/archive/identity mapping) stay COMPANY_ADMIN-only, same
// pattern as Branches (Phase 3) and Team (Phase 4).
@ApiTags("employees")
@Controller("companies/me/employees")
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Auth()
  list(@CurrentUser() user: AuthenticatedUser, @Query("status") status?: EmploymentStatus, @Query("orgUnitId") orgUnitId?: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.list(user.companyId, { status, orgUnitId });
  }

  @Get(":id")
  @Auth()
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.getOne(user.companyId, id);
  }

  @Get(":id/context")
  @Auth()
  getContext(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.resolveContext(user.companyId, id);
  }

  @Post()
  @Auth("COMPANY_ADMIN")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: CreateEmployeeInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.create(user.companyId, body, user.userId);
  }

  @Patch(":id")
  @Auth("COMPANY_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: UpdateEmployeeInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.update(user.companyId, id, body, user.userId);
  }

  @Post(":id/archive")
  @Auth("COMPANY_ADMIN")
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.archive(user.companyId, id, user.userId);
  }

  @Post(":id/link-user")
  @Auth("COMPANY_ADMIN")
  linkUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(linkEmployeeUserSchema)) body: LinkEmployeeUserInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.linkUser(user.companyId, id, body.userId, user.userId);
  }

  @Post(":id/unlink-user")
  @Auth("COMPANY_ADMIN")
  unlinkUser(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.unlinkUser(user.companyId, id, user.userId);
  }
}
