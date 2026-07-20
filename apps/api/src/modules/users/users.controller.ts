import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  createUserSchema,
  paginationQuerySchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
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
  @Auth("COMPANY_ADMIN")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Query("companyId") companyId: string | undefined,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.createUser(scopedCompanyId, body);
  }

  @Get()
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("companyId") companyId: string | undefined,
    @Query(new ZodValidationPipe(paginationQuerySchema)) pagination: { page: number; pageSize: number },
  ) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.listByCompany(scopedCompanyId, pagination);
  }

  @Patch(":id")
  @Auth("COMPANY_ADMIN")
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
  @Auth("COMPANY_ADMIN")
  disable(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId: string | undefined) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.setStatus(id, scopedCompanyId, "DISABLED");
  }

  @Post(":id/enable")
  @Auth("COMPANY_ADMIN")
  enable(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId: string | undefined) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.setStatus(id, scopedCompanyId, "ACTIVE");
  }

  // "حذف مستخدم" — soft delete: ARCHIVED + sessions revoked + hidden from
  // the Team list. See UsersService.archiveUser for the guard rails (no
  // self-delete, no deleting admins).
  @Delete(":id")
  @Auth("COMPANY_ADMIN")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Query("companyId") companyId: string | undefined) {
    const scopedCompanyId = this.resolveCompanyScope(user, companyId);
    return this.usersService.archiveUser(id, scopedCompanyId, user.userId);
  }
}
