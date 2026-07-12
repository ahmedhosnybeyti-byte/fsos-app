import { applyDecorators } from "@nestjs/common";
import { ApiCookieAuth } from "@nestjs/swagger";
import type { RoleCode } from "@field-sales-os/schemas";
import { Roles } from "./roles.decorator";

// JwtAuthGuard -> RolesGuard -> SubscriptionActiveGuard run as GLOBAL guards
// (see AppModule) so every route is secure-by-default; this decorator only
// attaches the @Roles() metadata those guards read, plus Swagger metadata.
// Pass no roles to allow any authenticated role. Combine with
// @SkipSubscriptionCheck() for routes that must keep working even while a
// subscription is inactive (e.g. GET /auth/me, billing screens). Combine
// with @Public() to bypass authentication entirely.
export function Auth(...roles: RoleCode[]) {
  return applyDecorators(ApiCookieAuth("fso_access_token"), Roles(...roles));
}
