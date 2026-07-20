import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { CreateUserInput, UpdateUserInput, UserStatus } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx, isUniqueConstraintError } from "../../common/prisma";
import { RolesService } from "../roles/roles.service";
import { OrgUnitsService } from "../companies/org-units.service";
import { AuditLogService } from "../audit-log/audit-log.service";

// Explicit field selection (never `include`) for anything that can flow back
// into an HTTP response — passwordHash must never leave this service.
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
  ) {}

  // Internal use only (login/change-password verification) — includes
  // passwordHash. Never return this object directly from a controller.
  findByEmailWithPassword(email: string, tx: PrismaTx = this.prisma) {
    return tx.user.findUnique({ where: { email }, include: { role: true } });
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
    params: { companyId: string; email: string; fullName: string; password: string },
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
      },
      tx,
    );
  }

  async createUser(companyId: string, dto: CreateUserInput) {
    await this.assertUnderSeatLimit(companyId);
    const role = await this.rolesService.findByCode(dto.roleCode);
    return this.createUserInternal({
      companyId,
      roleId: role.id,
      email: dto.email,
      fullName: dto.fullName,
      password: dto.password,
    });
  }

  private async createUserInternal(
    params: { companyId: string; roleId: string; email: string; fullName: string; password: string },
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

  async listByCompany(companyId: string, pagination: { page: number; pageSize: number }) {
    const { page, pageSize } = pagination;
    // ARCHIVED = soft-deleted (see archiveUser) — hidden from the Team list
    // entirely, unlike DISABLED which stays visible with a re-enable action.
    const where = { companyId, status: { not: "ARCHIVED" as const } };
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
    return { items, total, page, pageSize };
  }

  async updateUser(id: string, companyId: string, dto: UpdateUserInput, actorUserId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!existing || existing.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    const newRole = dto.roleCode ? await this.rolesService.findByCode(dto.roleCode) : undefined;

    // Phase 4: "Organizational Unit" on the User Profile is reference-only —
    // just validated against Phase 3's structure (same company, unit
    // exists), never interpreted for permissions here.
    if (dto.orgUnitId !== undefined && dto.orgUnitId !== null) {
      await this.orgUnitsService.getOne(companyId, dto.orgUnitId);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        status: dto.status,
        roleId: newRole?.id,
        ...(dto.orgUnitId !== undefined ? { orgUnitId: dto.orgUnitId } : {}),
      },
      select: publicUserSelect,
    });

    if (newRole && newRole.code !== existing.role.code) {
      // Single-role-per-user model: a "role change" is simultaneously the
      // Identity Audit's Role Assignment (new role) and Role Removal (old
      // role) — recorded as one event with both codes in the metadata
      // rather than two separate log rows for the same atomic change.
      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: "identity.role_assigned",
        entityType: "User",
        entityId: id,
        metadata: { previousRoleCode: existing.role.code, newRoleCode: newRole.code },
      });
    }

    return updated;
  }

  async setStatus(id: string, companyId: string, status: UserStatus) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }
    // Deactivating an account ends its sessions immediately (2026-07-19) —
    // paired with the refresh-rotation status gate in tokens.service.ts, a
    // disabled user is locked out within the access token's own 15-minute
    // lifetime, not whenever their refresh token happens to expire.
    if (status !== "ACTIVE") {
      await this.revokeAllSessions(id);
    }
    return this.prisma.user.update({ where: { id }, data: { status }, select: publicUserSelect });
  }

  // "حذف مستخدم" — soft delete (2026-07-19): status ARCHIVED + all sessions
  // revoked + hidden from the Team list. Never a hard row delete: the user
  // id is referenced by uploaded files, audit logs, targets, and reports —
  // history must keep pointing at a real record. Guard rails: you can't
  // delete yourself, and admin accounts can't be deleted from here (demote
  // them first) — a compromised admin session shouldn't be able to wipe out
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
      throw new ForbiddenException("Admin accounts cannot be deleted from here — change their role first.");
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

  // Direct-Prisma revocation (not TokensService) on purpose — TokensService
  // lives in AuthModule, which already imports UsersModule; injecting it
  // here would create a module cycle for what is one updateMany.
  private revokeAllSessions(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Phase 4: Password Management. Hashing/verification stays in AuthService
  // (the Identity Platform surface) — this is only the write path, keeping
  // passwordHash writes centralized here alongside createUserInternal.
  setPasswordHash(id: string, passwordHash: string, mustChangePassword: boolean) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword } });
  }
}
