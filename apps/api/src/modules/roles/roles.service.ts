import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { RoleCode } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";

const EDITABLE_ROLE_CODES: RoleCode[] = ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"];
const PLATFORM_ONLY_PERMISSIONS = new Set([
  "access_control.view", "access_control.manage", "platform_settings.view", "platform_settings.manage",
  "companies.manage", "subscriptions.manage", "payments.manage", "usage.view", "audit.view", "platform.admin",
]);

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService) {}

  findByCode(code: RoleCode) { return this.prisma.role.findUniqueOrThrow({ where: { code } }); }

  async getPermissionCodes(roleId: string): Promise<string[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({ where: { roleId }, include: { permission: true } });
    return rolePermissions.map((rp) => rp.permission.code);
  }

  list() { return this.prisma.role.findMany({ orderBy: { code: "asc" } }); }

  async listWithPermissions() {
    const roles = await this.prisma.role.findMany({ orderBy: { code: "asc" }, include: { rolePermissions: { include: { permission: true } } } });
    return roles.map((role) => ({ id: role.id, code: role.code, name: role.name, description: role.description, permissions: role.rolePermissions.map((rp) => rp.permission.code) }));
  }

  async updatePermissions(roleCode: RoleCode, permissionCodes: string[], actor: AuthenticatedUser) {
    if (actor.roleCode !== "SUPER_ADMIN" || !EDITABLE_ROLE_CODES.includes(roleCode)) throw new ForbiddenException("This role cannot be edited");
    if (permissionCodes.some((code) => PLATFORM_ONLY_PERMISSIONS.has(code))) throw new BadRequestException("Platform permissions cannot be assigned to company roles");
    const uniqueCodes = [...new Set(permissionCodes)];
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: roleCode }, include: { rolePermissions: { include: { permission: true } } } });
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: uniqueCodes } } });
    if (permissions.length !== uniqueCodes.length) throw new BadRequestException("One or more permissions do not exist");
    const before = role.rolePermissions.map((item) => item.permission.code).sort();
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
      await this.auditLogService.record({ userId: actor.userId, action: "access_control.permissions_updated", entityType: "Role", entityId: role.id, metadata: { roleCode, before, after: uniqueCodes.sort() } }, tx);
    });
    return this.listWithPermissions().then((roles) => roles.find((item) => item.code === roleCode));
  }
}