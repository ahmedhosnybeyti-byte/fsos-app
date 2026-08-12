import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SubscriptionsService } from "../../modules/subscriptions/subscriptions.service";
import { SKIP_SUBSCRIPTION_CHECK_KEY } from "../decorators/skip-subscription-check.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";

// Third link: the authoritative, server-side enforcement of "expired /
// suspended subscriptions are automatically blocked." Runs on every
// protected request (not just at login) so access is revoked mid-session
// the moment the scheduled expiry job flips a company's status.
@Injectable()
export class SubscriptionActiveGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    if (!user || !user.companyId) return true; // platform SUPER_ADMIN isn't tied to a subscription

    // Shared Trial V1 is user-scoped. It bypasses the demo company's billing
    // state but expires synchronously on every protected request.
    if (user.trialEndsAt) {
      if (user.trialEndsAt <= new Date()) throw new ForbiddenException({ code: "TRIAL_EXPIRED", message: "Your trial has expired." });
      const request = context.switchToHttp().getRequest<{ method?: string; path?: string; originalUrl?: string }>();
      const path = request.path ?? request.originalUrl ?? "";
      const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method ?? "");
      const selfService = path.startsWith("/auth/change-password") || path.startsWith("/auth/change-email") || path.startsWith("/auth/logout");
      if (isMutation && !selfService && (user.roleCode === "COMPANY_ADMIN" || path.startsWith("/files"))) {
        throw new ForbiddenException({ code: "SHARED_TRIAL_READ_ONLY", message: "Administrative changes and file uploads are disabled in shared trials." });
      }
      return true;
    }

    const subscription = await this.subscriptionsService.findCurrentForCompany(user.companyId);

    if (!subscription || (subscription.status !== "TRIAL" && subscription.status !== "ACTIVE")) {
      throw new ForbiddenException({
        message: "Your company's subscription is not active. Please contact your administrator.",
        code: "SUBSCRIPTION_INACTIVE",
        subscriptionStatus: subscription?.status ?? "NONE",
      });
    }

    return true;
  }
}
