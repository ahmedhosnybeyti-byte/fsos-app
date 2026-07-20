import { Injectable } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type { CompanyPolicyType, UpsertCompanyPolicyInput } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";

// Phase 9 — Company Policy Engine. The official reference for a company's
// policies (Organizational/Password/Refresh/EmployeeAssignment/Permission/
// Archiving). Deliberately read-only infrastructure for now: existing
// enforcement logic (e.g. Auth module's password validation) is NOT
// rewired to pull from here in this phase — that would be a behavior
// change to a critical, already-working flow, which is exactly the kind of
// "redesign previously approved architecture" the standing instructions
// say to avoid unless absolutely necessary. See the Phase 9 report.
@Injectable()
export class CompanyPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  list(companyId: string) {
    return this.prisma.companyPolicy.findMany({ where: { companyId }, orderBy: { policyType: "asc" } });
  }

  getByType(companyId: string, policyType: CompanyPolicyType) {
    return this.prisma.companyPolicy.findUnique({ where: { companyId_policyType: { companyId, policyType } } });
  }

  async upsert(companyId: string, dto: UpsertCompanyPolicyInput, actorUserId?: string) {
    const existing = await this.getByType(companyId, dto.policyType);

    const updated = await this.prisma.companyPolicy.upsert({
      where: { companyId_policyType: { companyId, policyType: dto.policyType } },
      update: {
        value: dto.value as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        version: (existing?.version ?? 0) + 1,
      },
      create: {
        companyId,
        policyType: dto.policyType,
        value: dto.value as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditLogService.record({
      companyId,
      userId: actorUserId ?? null,
      action: existing ? "governance.policy.updated" : "governance.policy.created",
      entityType: "CompanyPolicy",
      entityId: updated.id,
      metadata: { policyType: dto.policyType, version: updated.version },
    });

    return updated;
  }
}
