import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createOrgUnitTypeDefinitionSchema, type CreateOrgUnitTypeDefinitionInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { OrgUnitTypesService } from "./org-unit-types.service";

// Phase 3: Organizational Type Registry. Platform-level metadata (which unit
// types exist, how they may nest) — not company-scoped, not a business
// engine. Listing is open to any authenticated user (needed to populate
// org-unit creation forms); defining new types is a platform governance
// action, so it stays SUPER_ADMIN-only for now.
@ApiTags("org-unit-types")
@Controller("org-unit-types")
export class OrgUnitTypesController {
  constructor(private readonly orgUnitTypesService: OrgUnitTypesService) {}

  @Get()
  @Auth()
  list() {
    return this.orgUnitTypesService.list();
  }

  @Post()
  @Auth("SUPER_ADMIN")
  create(@Body(new ZodValidationPipe(createOrgUnitTypeDefinitionSchema)) body: CreateOrgUnitTypeDefinitionInput) {
    return this.orgUnitTypesService.create(body);
  }
}
