import { Body, Controller, ForbiddenException, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { sgiRecalculateInputSchema, type SgiRecalculateInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { SgiService } from "./sgi.service";

// Sales Growth Intelligence (SGI) Phase 1. See docs/SGI_ROADMAP.md.
// Migration #8 (ADR-001 / RIE Migration Plan) — sgiRecalculateInputSchema no
// longer takes a file/column selection (see sgi.schemas.ts), so both
// endpoints below are now effectively "just pick a date window" /
// "no form at all" — same two entry points as before, same auth, same
// response shape.
@ApiTags("sgi")
@Controller("sgi")
export class SgiController {
  constructor(private readonly sgiService: SgiService) {}

  // Manual recalculate — same gating as Target's write endpoints (setting
  // goals/recomputing company-wide situations is not something a rep or
  // supervisor should trigger). The scheduled-tasks cron will call this same
  // service method on a timer; this endpoint is also the on-demand
  // "recalculate now" button in the frontend.
  @Post("recalculate")
  @Auth("COMPANY_ADMIN", "MANAGER")
  recalculate(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(sgiRecalculateInputSchema)) body: SgiRecalculateInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.sgiService.recalculate(user, body);
  }

  // No-form refresh — freshly computes "this month so far vs. previous
  // month" via RIE, no saved config to replay anymore (Migration #8: RIE
  // has no file/column selection to save). Always succeeds once RIE's
  // required entities (Routes/Invoices/Invoice Items/Customers) are
  // available, same as every other migrated screen — the old "no data
  // source configured yet" failure mode no longer applies.
  @Post("recalculate-now")
  @Auth("COMPANY_ADMIN", "MANAGER")
  recalculateNow(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.sgiService.recalculateForCompany(user.companyId);
  }

  // Any authenticated role may read the latest situations — visibility is
  // narrowed server-side per role inside the service, same convention as
  // targets.controller.ts's list().
  @Get("latest")
  @Auth()
  getLatest(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.sgiService.getLatest(user);
  }
}
