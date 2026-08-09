import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";
import { UserActivityService } from "../../modules/user-activity/user-activity.service";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly userActivity: UserActivityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser; originalUrl?: string; method?: string; requestId?: string; ip?: string; headers?: Record<string, string | undefined> }>();
    const { user } = request;
    if (!user) throw new ForbiddenException("Not authenticated");
    if (user.roleCode === "SUPER_ADMIN") return true;
    if (!required.every((permission) => user.permissions.includes(permission))) {
      await this.userActivity.record({ type: "AUTH_PERMISSION_DENIED", category: "ACCESS", actorUserId: user.userId, subjectUserId: user.userId, actorRole: user.roleCode, companyId: user.companyId, targetType: "Route", targetId: request.originalUrl ?? request.method, outcome: "DENIED", source: "rbac.permissions_guard", requestId: request.requestId, ipAddress: request.ip, userAgent: request.headers?.["user-agent"], metadata: { requiredPermission: required } });
      throw new ForbiddenException("You do not have the required permission");
    }
    return true;
  }
}
