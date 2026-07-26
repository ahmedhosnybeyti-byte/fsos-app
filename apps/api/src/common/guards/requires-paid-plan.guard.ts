import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SubscriptionsService } from "../../modules/subscriptions/subscriptions.service";
import { REQUIRES_PAID_PLAN_KEY } from "../decorators/requires-paid-plan.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";

// Fourth link in the guard chain, right after SubscriptionActiveGuard.
// Opt-in (unlike SubscriptionActiveGuard, which runs on everything by
// default): only routes decorated with @RequiresPaidPlan() are checked here,
// so most requests skip the DB lookup entirely.
//
// SubscriptionActiveGuard already proved the subscription is TRIAL or
// ACTIVE — this guard narrows that further to "ACTIVE only" for a specific
// endpoint. Used for (a) Claude-API-backed endpoints that cost the platform
// money per call, and (b) mutations to company-level system config
// (governance policies, data-source credentials) that a trial evaluator
// shouldn't be able to permanently change.
@Injectable()
export class RequiresPaidPlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gated = this.reflector.getAllAndOverride<boolean>(REQUIRES_PAID_PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!gated) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    if (!user || !user.companyId) return true; // platform SUPER_ADMIN, not company-scoped

    const subscription = await this.subscriptionsService.findCurrentForCompany(user.companyId);

    if (subscription?.status === "TRIAL") {
      throw new ForbiddenException({
        message:
          "This feature is available on paid plans only. Upgrade to unlock it — your trial gives you full access to explore the rest of the app.",
        messageAr: "الميزة دي متاحة للباقات المدفوعة بس. رقّي اشتراكك عشان تفتحها — تجربتك المجانية بتديك وصول كامل لباقي التطبيق.",
        code: "TRIAL_FEATURE_LOCKED",
      });
    }

    return true;
  }
}
