import { SetMetadata } from "@nestjs/common";

export const SKIP_SUBSCRIPTION_CHECK_KEY = "skipSubscriptionCheck";

// Opt-out for routes that must work even when a company's subscription is
// not active — e.g. viewing subscription/billing status itself, or
// SUPER_ADMIN platform routes which aren't tied to a company at all.
export const SkipSubscriptionCheck = () => SetMetadata(SKIP_SUBSCRIPTION_CHECK_KEY, true);
