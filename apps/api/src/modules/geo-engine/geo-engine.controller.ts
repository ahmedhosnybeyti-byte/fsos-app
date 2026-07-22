import { Body, Controller, ForbiddenException, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { geoQueryInputSchema, geoTableQueryInputSchema, type GeoQueryInput, type GeoTableQueryInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { GeoEngineService } from "./geo-engine.service";

// Geo Intelligence Engine — Phase 1. One endpoint, one job: unified-filter +
// KPI-selector geo points for any map screen built on this engine.
//
// Filter-option dropdowns (City/Channel/Category/Brand/Product/Customer/
// Representative/Supervisor/Branch) deliberately have NO endpoint here —
// GET /decision-analytics-studio/filter-options already covers exactly this
// same field set against the same entities, so the frontend GeoFilterBar
// calls that endpoint directly rather than this module duplicating it
// (explicit "reuse existing services" instruction from the client spec).
@ApiTags("geo-engine")
@Controller("geo-engine")
export class GeoEngineController {
  constructor(private readonly geoEngineService: GeoEngineService) {}

  @Post("query")
  @Auth()
  query(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(geoQueryInputSchema)) body: GeoQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoEngineService.query(user, body);
  }

  // Phase 3 — Invoice-line detail table, the "Invoice" step of the client's
  // City -> Territory -> Customer -> Invoice drill chain (see
  // geo-engine.schemas.ts's geoTableQueryInputSchema comment).
  @Post("table")
  @Auth()
  table(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(geoTableQueryInputSchema)) body: GeoTableQueryInput) {
    if (!user.companyId) throw new ForbiddenException();
    return this.geoEngineService.table(user, body);
  }
}
