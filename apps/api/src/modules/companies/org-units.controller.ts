import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  createOrgUnitSchema,
  moveOrgUnitSchema,
  updateOrgUnitSchema,
  type CreateOrgUnitInput,
  type MoveOrgUnitInput,
  type UpdateOrgUnitInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { OrgUnitsService } from "./org-units.service";

// Phase 3: the general Organizational Structure API. Branch (Phase 1/2's
// approved MVP screen) is exposed separately and more narrowly through
// BranchesController; this generic surface exists so the structure
// underneath is already extensible to Region/DistributionCenter/Route
// without any future backend change — only a future UI would need to call
// it with a different `type`. Strictly structural: no employee/customer/
// route linkage, no business rules — that remains RIE's domain.
@ApiTags("org-units")
@Controller("companies/me/org-units")
export class OrgUnitsController {
  constructor(private readonly orgUnitsService: OrgUnitsService) {}

  @Get()
  @Auth()
  list(@CurrentUser() user: AuthenticatedUser, @Query("type") type?: string, @Query("parentId") parentId?: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.list(user.companyId, { type, parentId });
  }

  @Get(":id")
  @Auth()
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.getOne(user.companyId, id);
  }

  @Post()
  @Auth("COMPANY_ADMIN")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createOrgUnitSchema)) body: CreateOrgUnitInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.create(user.companyId, body);
  }

  @Patch(":id")
  @Auth("COMPANY_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrgUnitSchema)) body: UpdateOrgUnitInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.update(user.companyId, id, body);
  }

  @Post(":id/move")
  @Auth("COMPANY_ADMIN")
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(moveOrgUnitSchema)) body: MoveOrgUnitInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.move(user.companyId, id, body.newParentId);
  }

  @Post(":id/archive")
  @Auth("COMPANY_ADMIN")
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.archive(user.companyId, id);
  }
}
