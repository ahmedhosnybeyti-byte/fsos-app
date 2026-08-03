import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type CreateUserInput,
  type ListUsersQueryInput,
  type UpdateUserInput,
  adminUpdateEmailSchema,
  type AdminUpdateEmailInput,
  assignUserRouteSchema,
  unassignUserRouteSchema,
  type AssignUserRouteInput,
  type UnassignUserRouteInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private resolveCompanyScope(user: AuthenticatedUser, queryCompanyId?: string): string {
    if (user.roleCode === "SUPER_ADMIN") {
      if (!queryCompanyId) throw new ForbiddenException("companyId query param is required for SUPER_ADMIN");
      return queryCompanyId;
    }
    if (!user.companyId) throw new ForbiddenException();
    return user.companyId;
  }

  @Post()
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Query("companyId") companyId: string | undefined,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.createUser(scopedCompanyId, body, user.userId);
  }

  @Get()
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("companyId") companyId: string | undefined,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQueryInput,
  ) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.listByCompany(scopedCompanyId, query);
  }

  @Get(":id/route-assignment")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  routeAssignment(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId?: string) {
    return this.usersService.getRouteAssignment(id, this.resolveCompanyScope(user, companyId));
  }

  @Post(":id/route-assignment")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  assignRoute(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId: string | undefined, @Body(new ZodValidationPipe(assignUserRouteSchema)) body: AssignUserRouteInput) {
    return this.usersService.assignRoute(id, this.resolveCompanyScope(user, companyId), body, user.userId);
  }

  @Delete(":id/route-assignment")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  unassignRoute(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId: string | undefined, @Body(new ZodValidationPipe(unassignUserRouteSchema)) body: UnassignUserRouteInput) {
    return this.usersService.unassignRoute(id, this.resolveCompanyScope(user, companyId), body.reason, user.userId);
  }
  @Patch(":id/email")
  @Auth("SUPER_ADMIN")
  @Permissions("users.manage")
  updateEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adminUpdateEmailSchema)) body: AdminUpdateEmailInput,
  ) {
    return this.usersService.adminChangeEmail(id, body.email, user);
  }
  @Patch(":id")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query("companyId") companyId: string | undefined,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.updateUser(id, scopedCompanyId, body, user.userId);
  }

  @Post(":id/disable")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  disable(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId: string | undefined) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.setStatus(id, scopedCompanyId, "DISABLED", user.userId);
  }

  @Post(":id/enable")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  enable(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId: string | undefined) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.setStatus(id, scopedCompanyId, "ACTIVE", user.userId);
  }

  // "ط­ط°ظپ ظ…ط³طھط®ط¯ظ…" â€” soft delete: ARCHIVED + sessions revoked + hidden from
  // the Team list. See UsersService.archiveUser for the guard rails (no
  // self-delete, no deleting admins).
  @Delete(":id")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId: string | undefined) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.archiveUser(id, scopedCompanyId, user.userId);
  }
}
