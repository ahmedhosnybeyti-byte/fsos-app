import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DEFAULT_COMPANY_OPERATING_MODE, updateCompanyOperatingSettingsSchema, type CompanyOperatingMode } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuditLogService } from "../audit-log/audit-log.service";

@Injectable()
export class CompanyOperatingSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  async get(companyId: string): Promise<{ operatingMode: CompanyOperatingMode }> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new NotFoundException("Company not found");
    const settings = await this.prisma.companyOperatingSettings.findUnique({ where: { companyId }, select: { operatingMode: true } });
    return { operatingMode: settings?.operatingMode ?? DEFAULT_COMPANY_OPERATING_MODE };
  }

  async update(companyId: string, input: unknown, actor: AuthenticatedUser) {
    if (actor.roleCode !== "SUPER_ADMIN") throw new ForbiddenException("Only a platform administrator can change operating mode");
    const { operatingMode } = updateCompanyOperatingSettingsSchema.parse(input);
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } });
      if (!company) throw new NotFoundException("Company not found");
      const before = await tx.companyOperatingSettings.findUnique({ where: { companyId }, select: { operatingMode: true } });
      const previousMode = before?.operatingMode ?? DEFAULT_COMPANY_OPERATING_MODE;
      if (previousMode === operatingMode) return { operatingMode };
      await tx.companyOperatingSettings.upsert({
        where: { companyId }, create: { companyId, operatingMode }, update: { operatingMode },
        select: { operatingMode: true },
      });
      await this.auditLog.record({
        companyId, userId: actor.userId, action: "company.operating_mode.update", entityType: "Company", entityId: companyId,
        metadata: { before: previousMode, after: operatingMode },
      }, tx);
      return { operatingMode };
    });
  }
}
