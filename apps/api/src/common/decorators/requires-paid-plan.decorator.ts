import { SetMetadata } from "@nestjs/common";

export const REQUIRES_PAID_PLAN_KEY = "requiresPaidPlan";

// Opt-IN gate (opposite of @SkipSubscriptionCheck's opt-out pattern) for
// routes that are allowed during a TRIAL subscription in principle — the
// screen renders, the endpoint exists — but whose actual *use* either costs
// the platform real money (Claude API calls) or lets a trial company change
// system-level configuration (governance policies, external data-source
// credentials). Decorate the mutating/spend-triggering endpoint only; GET
// routes for the same feature stay open so the screen itself still loads.
export const RequiresPaidPlan = () => SetMetadata(REQUIRES_PAID_PLAN_KEY, true);
