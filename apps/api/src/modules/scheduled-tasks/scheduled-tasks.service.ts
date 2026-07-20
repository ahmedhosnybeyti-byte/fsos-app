import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { TokensService } from "../auth/tokens.service";
import { GptService } from "../gpt/gpt.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SgiService } from "../sgi/sgi.service";

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
    private readonly sgiService: SgiService,
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

  // SGI Phase 1's "Live" recompute (see docs/SGI_ROADMAP.md) — every company
  // that has ever run a manual recalculate gets automatically refreshed on
  // this timer, replaying its saved file/column config against a freshly
  // computed date window. A company that's never touched SGI is skipped
  // (nothing saved to replay), so this is a no-op until the feature is
  // actually adopted. Runs less often than the subscription check — the
  // underlying data (an uploaded Excel file) doesn't change more than a few
  // times a day at most.
  @Cron(CronExpression.EVERY_4_HOURS)
  async recomputeSgiSituations() {
    const results = await this.sgiService.recalculateAllCompanies();
    if (results.length === 0) return;
    const failures = results.filter((r) => !r.ok);
    this.logger.log(`SGI recompute: ${results.length} company(ies), ${failures.length} failure(s)`);
    for (const f of failures) {
      this.logger.warn(`SGI recompute failed for company ${f.companyId}: ${f.error}`);
    }
  }
}
