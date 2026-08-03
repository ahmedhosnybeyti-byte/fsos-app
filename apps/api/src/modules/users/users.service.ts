import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { AssignUserRouteInput, CreateUserInput, ListUsersQueryInput, RouteAssignmentEndReason, UpdateUserInput, UserStatus } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx, isUniqueConstraintError } from "../../common/prisma";
import { RolesService } from "../roles/roles.service";
import { OrgUnitsService } from "../companies/org-units.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CanonicalHierarchyResolverService } from "../rie/canonical-hierarchy-resolver.service";

// Explicit field selection (never `include`) for anything that can flow back
// into an HTTP response â€” passwordHash must never leave this service.
const publicUserSelect = {
  id: true,
  companyId: true,
  roleId: true,
  email: true,
  fullName: true,
  status: true,
  orgUnitId: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly orgUnitsService: OrgUnitsService,
    private readonly auditLogService: AuditLogService,
    private readonly hierarchyResolver: CanonicalHierarchyResolverService,
  ) {}

  // Internal use only (login/change-password verification) â€” includes
  // passwordHash. Never return this object directly from a controller.
  findByEmailWithPassword(email: string, tx: PrismaTx = this.prisma) {
    return tx.user.findUnique({ where: { email }, include: { role: true, company: true } });
  }

  findByIdWithPassword(id: string, tx: PrismaTx = this.prisma) {
    return tx.user.findUnique({ where: { id }, include: { role: true } });
  }

  findByEmail(email: string, tx: PrismaTx = this.prisma) {
    return tx.user.findUnique({ where: { email }, select: publicUserSelect });
  }

  findById(id: string, tx: PrismaTx = this.prisma) {
    return tx.user.findUnique({ where: { id }, select: publicUserSelect });
  }

  async createCompanyAdmin(
    params: { companyId: string; email: string; fullName: string; password: string; whatsapp?: string; mustChangePassword?: boolean },
    tx: PrismaTx = this.prisma,
  ) {
    const role = await this.rolesService.findByCode("COMPANY_ADMIN");
    return this.createUserInternal(
      {
        companyId: params.companyId,
        roleId: role.id,
        email: params.email,
        fullName: params.fullName,
        password: params.password,
        whatsapp: params.whatsapp,
      },
      tx,
    );
  }

  async createUser(companyId: string, dto: CreateUserInput, actorUserId: string) {
    await this.assertUnderSeatLimit(companyId);
    const role = await this.rolesService.findByCode(dto.roleCode);
    const user = await this.createUserInternal({
      companyId,
      roleId: role.id,
      email: dto.email,
      fullName: dto.fullName,
      password: dto.password,
      mustChangePassword: true,
    });
    await this.auditLogService.record({
      companyId,
      userId: actorUserId,
      action: "user.create",
      entityType: "User",
      entityId: user.id,
      metadata: { roleCode: role.code, status: user.status, mustChangePassword: true },
    });
    return user;
  }

  private async createUserInternal(
    params: { companyId: string; roleId: string; email: string; fullName: string; password: string; whatsapp?: string; mustChangePassword?: boolean },
    tx: PrismaTx = this.prisma,
  ) {
    try {
      return await tx.user.create({
        data: {
          companyId: params.companyId,
          roleId: params.roleId,
          email: params.email,
          fullName: params.fullName,
          passwordHash: await argon2.hash(params.password),
          whatsapp: params.whatsapp,
          mustChangePassword: params.mustChangePassword ?? false,
        },
        select: publicUserSelect,
      });
    } catch (err) {
      if (isUniqueConstraintError(err, "email")) {
        throw new ConflictException("An account with this email already exists");
      }
      throw err;
    }
  }

  private async assertUnderSeatLimit(companyId: string) {
    const [activeCount, subscription] = await Promise.all([
      this.prisma.user.count({ where: { companyId, status: { not: "DISABLED" } } }),
      this.prisma.subscription.findFirst({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        include: { plan: true },
      }),
    ]);
    const maxUsers = subscription?.plan.maxUsers;
    if (maxUsers != null && activeCount >= maxUsers) {
      throw new ForbiddenException(`Your plan allows up to ${maxUsers} users. Upgrade to add more.`);
    }
  }

  async listByCompany(companyId: string, query: ListUsersQueryInput) {
    const { page, pageSize, search, roleCode, status } = query;
    // ARCHIVED = soft-deleted (see archiveUser) â€” hidden from the Team list
    // entirely, unlike DISABLED which stays visible with a re-enable action.
    const where = {
      companyId,
      status: status ?? { not: "ARCHIVED" as const },
      ...(roleCode ? { role: { code: roleCode } } : {}),
      ...(search
        ? { OR: [{ fullName: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);
    const assignments = items.length === 0 ? [] : await this.prisma.userRouteAssignment.findMany({ where: { companyId, userId: { in: items.map((item) => item.id) }, endedAt: null }, select: { userId: true, routeId: true, startedAt: true } });
    const assignmentByUserId = new Map(assignments.map((assignment) => [assignment.userId, assignment]));
    return { items: items.map((item) => ({ ...item, currentRouteAssignment: assignmentByUserId.get(item.id) ?? null })), total, page, pageSize };
  }

  async updateUser(id: string, companyId: string, dto: UpdateUserInput, actorUserId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing || existing.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    const newRole = dto.roleCode ? await this.rolesService.findByCode(dto.roleCode) : undefined;

    // Phase 4: "Organizational Unit" on the User Profile is reference-only â€”
    // just validated against Phase 3's structure (same company, unit
    // exists), never interpreted for permissions here.
    if (dto.orgUnitId !== undefined && dto.orgUnitId !== null) {
      await this.orgUnitsService.getOne(companyId, dto.orgUnitId);
    }

    const roleChanged = Boolean(newRole && newRole.code !== existing.role.code);
    const closesRoute = roleChanged && existing.role.code === "SALES_REP" && newRole?.code !== "SALES_REP";
    const updated = await this.prisma.$transaction(async (tx) => {
      if (closesRoute) {
        const current = await tx.userRouteAssignment.findFirst({ where: { userId: id, companyId, endedAt: null } });
        if (current) await tx.userRouteAssignment.update({ where: { id: current.id }, data: { endedAt: new Date(), endReason: newRole?.code === "SALES_REP" ? "ROLE_CHANGED" : "PROMOTION" } });
      }
      return tx.user.update({ where: { id }, data: { fullName: dto.fullName, status: dto.status, roleId: newRole?.id, ...(dto.orgUnitId !== undefined ? { orgUnitId: dto.orgUnitId } : {}) }, select: publicUserSelect });
    });

    if (dto.status !== undefined && dto.status !== existing.status) {
      if (dto.status !== "ACTIVE") {
        await this.revokeAllSessions(id);
        await this.auditLogService.record({ companyId, userId: actorUserId ?? null, action: "identity.session_revoked", entityType: "User", entityId: id, metadata: { reason: "status_change" } });
      }
      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: dto.status === "ACTIVE" ? "user.enable" : "user.disable",
        entityType: "User",
        entityId: id,
        metadata: { before: { status: existing.status }, after: { status: dto.status } },
      });
    }
    const before = { fullName: existing.fullName, status: existing.status, roleCode: existing.role.code };
    const after = { fullName: updated.fullName, status: updated.status, roleCode: updated.role.code };
    if (before.fullName !== after.fullName || before.status !== after.status || before.roleCode !== after.roleCode) {
      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: "user.update",
        entityType: "User",
        entityId: id,
        metadata: { before, after },
      });
    }

    if (newRole && newRole.code !== existing.role.code) {
      // Single-role-per-user model: a "role change" is simultaneously the
      // Identity Audit's Role Assignment (new role) and Role Removal (old
      // role) â€” recorded as one event with both codes in the metadata
      // rather than two separate log rows for the same atomic change.
      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: "user.role_change",
        entityType: "User",
        entityId: id,
        metadata: { previousRoleCode: existing.role.code, newRoleCode: newRole.code },
      });
    }

    return updated;
  }

  async getRouteAssignment(userId: string, companyId: string) {
    await this.assertCompanyUser(userId, companyId);
    const [current, history, routes] = await Promise.all([
      this.prisma.userRouteAssignment.findFirst({ where: { userId, companyId, endedAt: null }, orderBy: { startedAt: "desc" } }),
      this.prisma.userRouteAssignment.findMany({ where: { userId, companyId, endedAt: { not: null } }, orderBy: { endedAt: "desc" } }),
      this.hierarchyResolver.listCompanyRoutes(companyId),
    ]);
    return { current, history, routes };
  }

  async assignRoute(userId: string, companyId: string, input: AssignUserRouteInput, actorUserId: string) {
    await this.assertAssignableRoute(userId, companyId, input.routeId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.userRouteAssignment.findFirst({ where: { userId, companyId, endedAt: null } });
        if (current?.routeId === input.routeId) return current;
        if (current) await tx.userRouteAssignment.update({ where: { id: current.id }, data: { endedAt: new Date(), endReason: "TRANSFER" } });
        const assignment = await tx.userRouteAssignment.create({ data: { companyId, userId, routeId: input.routeId, assignedByUserId: actorUserId } });
        await this.auditLogService.record({ companyId, userId: actorUserId, action: current ? "user.route_transfer" : "user.route_assign", entityType: "UserRouteAssignment", entityId: assignment.id, metadata: { userId, routeId: input.routeId } }, tx);
        return assignment;
      });
    } catch (error) { if (isUniqueConstraintError(error)) throw new ConflictException("User already has an active route assignment"); throw error; }
  }

  async unassignRoute(userId: string, companyId: string, reason: RouteAssignmentEndReason, actorUserId: string) {
    await this.assertCompanyUser(userId, companyId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.userRouteAssignment.findFirst({ where: { userId, companyId, endedAt: null } });
      if (!current) return null;
      const assignment = await tx.userRouteAssignment.update({ where: { id: current.id }, data: { endedAt: new Date(), endReason: reason } });
      await this.auditLogService.record({ companyId, userId: actorUserId, action: "user.route_unassign", entityType: "UserRouteAssignment", entityId: assignment.id, metadata: { reason } }, tx);
      return assignment;
    });
  }

  private async assertCompanyUser(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId }, include: { role: true } });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  private async assertAssignableRoute(userId: string, companyId: string, routeId: string) {
    const user = await this.assertCompanyUser(userId, companyId);
    if (user.role.code !== "SALES_REP") throw new BadRequestException("Only sales representatives can be assigned a route");
    const routes = await this.hierarchyResolver.listCompanyRouteIds(companyId);
    if (!routes.some((route) => route.toLowerCase() === routeId.trim().toLowerCase())) throw new BadRequestException("RouteID does not belong to this company");
  }
  async setStatus(id: string, companyId: string, status: UserStatus, actorUserId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }
    // Deactivating an account ends its sessions immediately (2026-07-19) â€”
    // paired with the refresh-rotation status gate in tokens.service.ts, a
    // disabled user is locked out within the access token's own 15-minute
    // lifetime, not whenever their refresh token happens to expire.
    if (status !== "ACTIVE") {
      await this.revokeAllSessions(id);
      await this.auditLogService.record({
        companyId,
        userId: actorUserId,
        action: "identity.session_revoked",
        entityType: "User",
        entityId: id,
        metadata: { reason: "status_change" },
      });
    }
    const updated = await this.prisma.user.update({ where: { id }, data: { status }, select: publicUserSelect });
    if (existing.status !== status) {
      await this.auditLogService.record({
        companyId,
        userId: actorUserId,
        action: status === "ACTIVE" ? "user.enable" : "user.disable",
        entityType: "User",
        entityId: id,
        metadata: { before: { status: existing.status }, after: { status } },
      });
    }
    return updated;
  }

  // "ط­ط°ظپ ظ…ط³طھط®ط¯ظ…" â€” soft delete (2026-07-19): status ARCHIVED + all sessions
  // revoked + hidden from the Team list. Never a hard row delete: the user
  // id is referenced by uploaded files, audit logs, targets, and reports â€”
  // history must keep pointing at a real record. Guard rails: you can't
  // delete yourself, and admin accounts can't be deleted from here (demote
  // them first) â€” a compromised admin session shouldn't be able to wipe out
  // the other admins.
  async archiveUser(id: string, companyId: string, actorUserId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing || existing.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }
    if (id === actorUserId) {
      throw new ForbiddenException("You cannot delete your own account.");
    }
    if (existing.role.code === "COMPANY_ADMIN" || existing.role.code === "SUPER_ADMIN") {
      throw new ForbiddenException("Admin accounts cannot be deleted from here â€” change their role first.");
    }

    await this.revokeAllSessions(id);
    const archived = await this.prisma.user.update({ where: { id }, data: { status: "ARCHIVED" }, select: publicUserSelect });

    await this.auditLogService.record({
      companyId,
      userId: actorUserId,
      action: "identity.user_archived",
      entityType: "User",
      entityId: id,
      metadata: { email: existing.email, roleCode: existing.role.code },
    });

    return archived;
  }

  // Direct-Prisma revocation (not TokensService) on purpose â€” TokensService
  // lives in AuthModule, which already imports UsersModule; injecting it
  // here would create a module cycle for what is one updateMany.
  private revokeAllSessions(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }



  async adminChangeEmail(id: string, email: string, actor: { userId: string }) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found");
    const normalizedEmail = email.trim().toLowerCase();
    if (existing.email === normalizedEmail) return this.findById(id);
    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.user.update({ where: { id }, data: { email: normalizedEmail }, select: publicUserSelect });
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await this.auditLogService.record({ companyId: existing.companyId, userId: actor.userId, action: "identity.email_change_admin", entityType: "User", entityId: id, metadata: { before: { email: existing.email }, after: { email: normalizedEmail } } }, tx);
        await this.auditLogService.record({ companyId: existing.companyId, userId: actor.userId, action: "identity.session_revoked", entityType: "User", entityId: id, metadata: { reason: "admin_email_change" } }, tx);
        return result;
      });
    } catch (err) {
      if (isUniqueConstraintError(err, "email")) throw new ConflictException("An account with this email already exists");
      throw err;
    }
    return updated;
  }
  async changeEmail(id: string, email: string) {
    try {
      return await this.prisma.user.update({ where: { id }, data: { email } });
    } catch (err) {
      if (isUniqueConstraintError(err, "email")) throw new ConflictException("An account with this email already exists");
      throw err;
    }
  }
  // Phase 4: Password Management. Hashing/verification stays in AuthService
  // (the Identity Platform surface) â€” this is only the write path, keeping
  // passwordHash writes centralized here alongside createUserInternal.
  setPasswordHash(id: string, passwordHash: string, mustChangePassword: boolean) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword } });
  }
}
