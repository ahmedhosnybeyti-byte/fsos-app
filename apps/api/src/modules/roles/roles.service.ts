import { Injectable } from "@nestjs/common";
import type { RoleCode } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findByCode(code: RoleCode) {
    return this.prisma.role.findUniqueOrThrow({ where: { code } });
  }

  async getPermissionCodes(roleId: string): Promise<string[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });
    return rolePermissions.map((rp) => rp.permission.code);
  }

  list() {
    return this.prisma.role.findMany({ orderBy: { code: "asc" } });
  }

  async listWithPermissions() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: "asc" },
      include: { rolePermissions: { include: { permission: true } } },
    });
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: role.rolePermissions.map((rp) => rp.permission.code),
    }));
  }
}
