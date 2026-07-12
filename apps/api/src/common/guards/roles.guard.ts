import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleCode } from "@field-sales-os/schemas";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";

// Second link: enforces @Roles(...). No metadata = any authenticated role
// may proceed. SUPER_ADMIN always passes — it's the platform operator role,
// not scoped to any single company.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    if (!user) throw new ForbiddenException("Not authenticated");
    if (user.roleCode === "SUPER_ADMIN") return true;
    if (!requiredRoles.includes(user.roleCode)) {
      throw new ForbiddenException("You do not have permission to perform this action");
    }
    return true;
  }
}
