import { BadRequestException, Injectable } from "@nestjs/common";
import type { UpdatePlatformSettingsInput } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";

const SETTINGS_ID = "platform_settings";

// Singleton row — the platform's trial policy lives here, not in code. A
// SUPER_ADMIN changes it through the Admin UI; nothing here requires a
// deploy. See docs history: this replaced a hardcoded TRIAL_PERIOD_DAYS
// constant deliberately.
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Upsert-on-read: guarantees the singleton row exists (Prisma defaults
  // apply on first creation) without requiring a separate seed step to have
  // run first.
  get() {
    return this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  async update(dto: UpdatePlatformSettingsInput, updatedByUserId: string) {
    if (dto.defaultPlanCode) {
      const plan = await this.prisma.plan.findUnique({ where: { code: dto.defaultPlanCode } });
      if (!plan) throw new BadRequestException(`No plan with code "${dto.defaultPlanCode}" exists`);
    }

    await this.get(); // ensure row exists before update
    const updated = await this.prisma.platformSettings.update({
      where: { id: SETTINGS_ID },
      data: dto,
    });

    await this.auditLogService.record({
      userId: updatedByUserId,
      action: "platform_settings.update",
      entityType: "PlatformSettings",
      entityId: SETTINGS_ID,
      metadata: dto,
    });

    return updated;
  }
}
