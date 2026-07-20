import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  importTargetsFromFileSchema,
  listTargetsQuerySchema,
  upsertTargetsBatchSchema,
  type ImportTargetsFromFileInput,
  type ListTargetsQuery,
  type UpsertTargetsBatchInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TargetsService } from "./targets.service";

// Sales Growth Intelligence (SGI) Phase 1 — Goal Planning's Target CRUD.
// See docs/SGI_ROADMAP.md.
@ApiTags("targets")
@Controller("targets")
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Get()
  @Auth()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listTargetsQuerySchema)) query: ListTargetsQuery) {
    return this.targetsService.list(user, query);
  }

  // Manual list-entry path — COMPANY_ADMIN/MANAGER only, same reasoning
  // as files.controller.ts's hierarchy-columns endpoint: this sets what a
  // rep is measured against, so it must not be settable by the rep being
  // measured.
  @Post()
  @Auth("COMPANY_ADMIN", "MANAGER")
  upsertMany(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(upsertTargetsBatchSchema)) body: UpsertTargetsBatchInput) {
    return this.targetsService.upsertMany(user, body);
  }

  // Upload path — same file-picker + column-mapping pattern as every
  // other module, gated the same as manual entry.
  @Post("import-from-file")
  @Auth("COMPANY_ADMIN", "MANAGER")
  importFromFile(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(importTargetsFromFileSchema)) body: ImportTargetsFromFileInput) {
    return this.targetsService.importFromFile(user, body);
  }
}
