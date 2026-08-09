import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleCode } from "@field-sales-os/schemas";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";
import { UserActivityService } from "../../modules/user-activity/user-activity.service";

// Second link: enforces @Roles(...). No metadata = any authenticated role
// may proceed. SUPER_ADMIN always passes — it's the platform operator role,
// not scoped to any single company.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly userActivity: UserActivityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser; originalUrl?: string; method?: string; requestId?: string; ip?: string; headers?: Record<string, string | undefined> }>();
    const { user } = request;
    if (!user) throw new ForbiddenException("Not authenticated");
    if (user.roleCode === "SUPER_ADMIN") return true;
    if (!requiredRoles.includes(user.roleCode)) {
      await this.userActivity.record({ type: "AUTH_PERMISSION_DENIED", category: "ACCESS", actorUserId: user.userId, subjectUserId: user.userId, actorRole: user.roleCode, companyId: user.companyId, targetType: "Route", targetId: request.originalUrl ?? request.method, outcome: "DENIED", source: "rbac.roles_guard", requestId: request.requestId, ipAddress: request.ip, userAgent: request.headers?.["user-agent"], metadata: { requiredPermission: requiredRoles.join("|"), method: request.method } });
      throw new ForbiddenException("You do not have permission to perform this action");
    }
    return true;
  }
}
