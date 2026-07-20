import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type { CreateEmployeeInput, EmploymentStatus, UpdateEmployeeInput } from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PlatformEventsService } from "../governance/platform-events.service";
import { OrgUnitsService } from "../companies/org-units.service";

// Phase 5 — Employee Management. Employee is a Business Entity, deliberately
// independent from User (Identity Entity): this service never touches
// login, passwords, or permissions, and never merges Employee fields into
// User. Employment/Assignment History is recorded via the existing generic
// AuditLog table (action: "employee.history.<field>_changed") — same reuse
// pattern already used for Phase 2's lifecycle events and Phase 4's
// identity audit, not a bespoke history table.
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly orgUnitsService: OrgUnitsService,
    private readonly platformEventsService: PlatformEventsService,
  ) {}

  async create(companyId: string, dto: CreateEmployeeInput, actorUserId?: string) {
    if (dto.orgUnitId) await this.orgUnitsService.getOne(companyId, dto.orgUnitId);
    const manager = dto.managerId ? await this.requireEmployee(companyId, dto.managerId) : null;

    try {
      const employee = await this.prisma.employee.create({
        data: {
          companyId,
          employeeCode: dto.employeeCode.trim(),
          fullName: dto.fullName.trim(),
          jobTitle: dto.jobTitle?.trim() || null,
          orgUnitId: dto.orgUnitId ?? null,
          managerId: manager?.id ?? null,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          contactEmail: dto.contactEmail ?? null,
          contactPhone: dto.contactPhone ?? null,
        },
      });

      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: "employee.history.created",
        entityType: "Employee",
        entityId: employee.id,
      });
      await this.platformEventsService.emit("EmployeeCreated", { companyId, userId: actorUserId, entityType: "Employee", entityId: employee.id });

      return employee;
    } catch (err) {
      if (isUniqueConstraintError(err, "employeeCode")) {
        throw new ConflictException("An employee with this code already exists");
      }
      throw err;
    }
  }

  list(companyId: string, filter?: { status?: EmploymentStatus; orgUnitId?: string }) {
    return this.prisma.employee.findMany({
      where: {
        companyId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.orgUnitId ? { orgUnitId: filter.orgUnitId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  getOne(companyId: string, id: string) {
    return this.requireEmployee(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateEmployeeInput, actorUserId?: string) {
    const existing = await this.requireEmployee(companyId, id);

    if (dto.orgUnitId !== undefined && dto.orgUnitId !== null) {
      await this.orgUnitsService.getOne(companyId, dto.orgUnitId);
    }

    let newManagerId: string | null | undefined = undefined;
    if (dto.managerId !== undefined) {
      newManagerId = dto.managerId;
      if (newManagerId) await this.assertNoManagementCycle(companyId, id, newManagerId);
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle?.trim() || null } : {}),
        ...(dto.orgUnitId !== undefined ? { orgUnitId: dto.orgUnitId } : {}),
        ...(newManagerId !== undefined ? { managerId: newManagerId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.hireDate !== undefined ? { hireDate: dto.hireDate ? new Date(dto.hireDate) : null } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
      },
    });

    // Employment/Assignment History: one audit row per changed structural
    // field, only for fields that actually changed.
    const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
    if (dto.jobTitle !== undefined && dto.jobTitle !== existing.jobTitle) {
      changes.push({ field: "job_title", from: existing.jobTitle, to: updated.jobTitle });
    }
    if (newManagerId !== undefined && newManagerId !== existing.managerId) {
      changes.push({ field: "manager", from: existing.managerId, to: updated.managerId });
    }
    if (dto.orgUnitId !== undefined && dto.orgUnitId !== existing.orgUnitId) {
      changes.push({ field: "org_unit", from: existing.orgUnitId, to: updated.orgUnitId });
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      changes.push({ field: "status", from: existing.status, to: updated.status });
    }
    for (const change of changes) {
      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: `employee.history.${change.field}_changed`,
        entityType: "Employee",
        entityId: id,
        metadata: { from: change.from, to: change.to } as Prisma.InputJsonValue,
      });
    }
    if (changes.length > 0) {
      await this.platformEventsService.emit("EmployeeUpdated", { companyId, userId: actorUserId, entityType: "Employee", entityId: id });
    }

    return updated;
  }

  async archive(companyId: string, id: string, actorUserId?: string) {
    const existing = await this.requireEmployee(companyId, id);
    const activeReports = await this.prisma.employee.count({
      where: { managerId: id, status: { not: "ARCHIVED" } },
    });
    if (activeReports > 0) {
      throw new BadRequestException("Cannot archive an employee who has active direct reports");
    }

    const updated = await this.prisma.employee.update({ where: { id }, data: { status: "ARCHIVED" } });
    await this.auditLogService.record({
      companyId,
      userId: actorUserId ?? null,
      action: "employee.history.status_changed",
      entityType: "Employee",
      entityId: id,
      metadata: { from: existing.status, to: "ARCHIVED" },
    });
    return updated;
  }

  // Employee Identity Mapping — reference-only link. Never merges data
  // between the two entities.
  async linkUser(companyId: string, employeeId: string, userId: string, actorUserId?: string) {
    await this.requireEmployee(companyId, employeeId);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.companyId !== companyId) {
      throw new ForbiddenException("The user must belong to the same company");
    }

    try {
      const updated = await this.prisma.employee.update({ where: { id: employeeId }, data: { userId } });
      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: "employee.history.identity_linked",
        entityType: "Employee",
        entityId: employeeId,
        metadata: { userId },
      });
      return updated;
    } catch (err) {
      if (isUniqueConstraintError(err, "userId")) {
        throw new ConflictException("This user is already linked to another employee");
      }
      throw err;
    }
  }

  async unlinkUser(companyId: string, employeeId: string, actorUserId?: string) {
    await this.requireEmployee(companyId, employeeId);
    const updated = await this.prisma.employee.update({ where: { id: employeeId }, data: { userId: null } });
    await this.auditLogService.record({
      companyId,
      userId: actorUserId ?? null,
      action: "employee.history.identity_unlinked",
      entityType: "Employee",
      entityId: employeeId,
    });
    return updated;
  }

  // Employee Context Resolver — the sole component that builds Employee
  // Context (Company Context + Organizational Context + direct manager),
  // per the constitution's "no engine builds this itself" rule. Read-only
  // composition over Phase 3's OrgUnit.path and this table's manager edge;
  // carries no business logic of its own.
  async resolveContext(companyId: string, employeeId: string) {
    const employee = await this.requireEmployee(companyId, employeeId);

    const [orgUnit, manager] = await Promise.all([
      employee.orgUnitId ? this.prisma.orgUnit.findUnique({ where: { id: employee.orgUnitId } }) : null,
      employee.managerId ? this.prisma.employee.findUnique({ where: { id: employee.managerId } }) : null,
    ]);

    return {
      employeeId: employee.id,
      companyId: employee.companyId,
      orgUnitId: employee.orgUnitId,
      orgUnitPath: orgUnit?.path ?? null,
      managerId: employee.managerId,
      managerName: manager?.fullName ?? null,
      status: employee.status,
    };
  }

  private async requireEmployee(companyId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, companyId } });
    if (!employee) throw new NotFoundException("Employee not found");
    return employee;
  }

  // No Circular Management Hierarchy: walks up from the proposed manager's
  // manager chain — if it reaches back to `employeeId`, the reassignment
  // would create a cycle.
  private async assertNoManagementCycle(companyId: string, employeeId: string, proposedManagerId: string) {
    if (proposedManagerId === employeeId) {
      throw new BadRequestException("An employee cannot be their own manager");
    }
    let cursor = await this.requireEmployee(companyId, proposedManagerId);
    while (cursor.managerId) {
      if (cursor.managerId === employeeId) {
        throw new BadRequestException("This assignment would create a circular management hierarchy");
      }
      cursor = await this.prisma.employee.findUniqueOrThrow({ where: { id: cursor.managerId } });
    }
  }
}
