import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  createBranchSchema,
  updateBranchSchema,
  type CreateBranchInput,
  type UpdateBranchInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { OrgUnitsService } from "./org-units.service";

const BRANCH_TYPE = "BRANCH";

// Phase 1/2's approved MVP org structure: Company -> Branch only. This
// controller is a thin, type="BRANCH"-only facade over the general
// Organizational Structure engine (OrgUnitsService, Phase 3) — it
// deliberately does NOT expose Region/DistributionCenter/Route or any other
// registry type; those remain reachable only through the generic
// /companies/me/org-units API, not through the product's Branches screen.
@ApiTags("branches")
@Controller("companies/me/branches")
export class BranchesController {
  constructor(private readonly orgUnitsService: OrgUnitsService) {}

  @Get()
  @Auth()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.list(user.companyId, { type: BRANCH_TYPE });
  }

  @Post()
  @Auth("COMPANY_ADMIN")
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    // Phase 10 Company Policy: "no Branch without Region." The Branches
    // screen still only asks for code+name (no Region picker) — this
    // resolves (or lazily creates) the company's single default Region
    // under the hood, so the existing UX is unchanged.
    const region = await this.orgUnitsService.ensureDefaultRegion(user.companyId);
    return this.orgUnitsService.create(user.companyId, { type: BRANCH_TYPE, parentId: region.id, ...body });
  }

  @Patch(":id")
  @Auth("COMPANY_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.update(user.companyId, id, body, BRANCH_TYPE);
  }

  @Post(":id/archive")
  @Auth("COMPANY_ADMIN")
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.orgUnitsService.archive(user.companyId, id, BRANCH_TYPE);
  }
}
