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
import { EmployeeExportService } from "./employee-export.service";

// Phase 5 — Employee Management. Reads are open to any authenticated role
// (Employee is reference data other screens will want to look up); writes
// (create/update/archive/identity mapping) stay COMPANY_ADMIN-only, same
// pattern as Branches (Phase 3) and Team (Phase 4).
@ApiTags("employees")
@Controller("companies/me/employees")
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly employeeExportService: EmployeeExportService,
  ) {}

  @Get()
  @Auth()
  list(@CurrentUser() user: AuthenticatedUser, @Query("status") status?: EmploymentStatus, @Query("orgUnitId") orgUnitId?: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeesService.list(user.companyId, { status, orgUnitId });
  }

  // Scoped picker list for the Files screen's "Employee Exports" section —
  // returns only the employees the CALLER may pull an export for (self,
  // or self+subtree for a scoped role; everyone for COMPANY_ADMIN/
  // SUPER_ADMIN). @Auth() only: any authenticated company role may see
  // their own scoped picker, same reasoning as the export endpoint below —
  // the service is the real gate, not the route decorator. MUST be
  // declared before the ":id" route below — Nest matches routes in
  // declaration order, and "exportable" would otherwise be swallowed as an
  // :id value by getOne().
  @Get("exportable")
  @Auth()
  listExportable(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeeExportService.listExportableEmployees(user.companyId, user);
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

  // Per-Employee Scoped Excel Export — see employee-export.service.ts's
  // header comment for the full design (two independent checks: caller
  // authorization via Phase 5's own org chart, then data scoping computed
  // against the TARGET employee's identity, never the caller's). @Auth()
  // only (any authenticated company role) because the service itself is
  // the real gate — a rep hitting this on their own id, or a company admin
  // hitting it on anyone, both succeed; anyone else outside their own
  // subtree gets a 403 from inside the service, before any data is read.
  // fromDate/toDate are an optional narrowing filter on top of that scope
  // (e.g. "last 3 months") — applied only to sheets with a real transaction
  // date field; see EXPORT_SHEETS' dateField.
  @Get(":id/export")
  @Auth()
  exportEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.employeeExportService.exportForEmployee(user.companyId, user, id, { fromDate, toDate });
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
