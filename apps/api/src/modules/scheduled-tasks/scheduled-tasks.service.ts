import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { TokensService } from "../auth/tokens.service";
import { GptService } from "../gpt/gpt.service";
import { AuditLogService } from "../audit-log/audit-log.service";

// Authoritative enforcement of "trial users are automatically blocked after
// the trial expires" / "expired subscriptions are automatically blocked":
// runs hourly, flips lapsed subscriptions to EXPIRED, and immediately
// revokes every active session (dashboard refresh tokens + GPT launch
// codes/sessions) for the affected companies — no stale access lingers
// until someone happens to hit a guard next.
@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly tokensService: TokensService,
    private readonly gptService: GptService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async expireDueSubscriptions() {
    const companyIds = await this.subscriptionsService.expireDueSubscriptions();
    if (companyIds.length === 0) return;

    this.logger.log(`Expiring ${companyIds.length} subscription(s); revoking sessions`);

    for (const companyId of companyIds) {
      await Promise.all([
        this.tokensService.revokeAllForCompany(companyId),
        this.gptService.revokeAllSessionsForCompany(companyId),
        this.auditLogService.record({ companyId, action: "subscription.auto_expired" }),
      ]);
    }
  }
}
