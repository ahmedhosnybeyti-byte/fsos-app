import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { CreateUserInput, UpdateUserInput } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx, isUniqueConstraintError } from "../../common/prisma";
import { RolesService } from "../roles/roles.service";

// Explicit field selection (never `include`) for anything that can flow back
// into an HTTP response — passwordHash must never leave this service.
const publicUserSelect = {
  id: true,
  companyId: true,
  roleId: true,
  email: true,
  fullName: true,
  status: true,
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
  ) {}

  // Internal use only (login password verification) — includes passwordHash.
  // Never return this object directly from a controller.
  findByEmailWithPassword(email: string, tx: PrismaTx = this.prisma) {
    return tx.user.findUnique({ where: { email }, include: { role: true } });
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
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId },
        select: publicUserSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where: { companyId } }),
    ]);
    return { items, total, page, pageSize };
  }

  async updateUser(id: string, companyId: string, dto: UpdateUserInput) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }

    const roleId = dto.roleCode ? (await this.rolesService.findByCode(dto.roleCode)).id : undefined;

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        status: dto.status,
        roleId,
      },
      select: publicUserSelect,
    });
  }

  async setStatus(id: string, companyId: string, status: "ACTIVE" | "DISABLED") {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw new NotFoundException("User not found");
    }
    return this.prisma.user.update({ where: { id }, data: { status }, select: publicUserSelect });
  }
}
