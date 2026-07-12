import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { paginationQuerySchema } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "./audit-log.service";

@ApiTags("audit-log")
@Controller("audit-log")
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(paginationQuerySchema)) pagination: { page: number; pageSize: number },
    @Query("companyId") companyId?: string,
  ) {
    if (user.roleCode === "SUPER_ADMIN") {
      return this.auditLogService.list({ companyId, ...pagination });
    }
    if (!user.companyId) throw new ForbiddenException();
    return this.auditLogService.list({ companyId: user.companyId, ...pagination });
  }
}
