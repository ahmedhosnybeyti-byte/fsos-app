import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { SFA_ACCESS_PERMISSION, supportsSfaOperations, permitsOperationalRole } from "@field-sales-os/schemas";
import { SFA_PERMISSIONS_KEY } from "../decorators/requires-sfa.decorator";
import { PrismaService } from "../prisma";
import type { AuthenticatedUser } from "../types/authenticated-user";

@Injectable()
export class SfaAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndMerge<string[]>(SFA_PERMISSIONS_KEY, targets);
    if (!required?.length) {
      // Reserve /sfa: forgetting the capability decorator must fail closed.
      const paths = targets.flatMap((target) => {
        const value = this.reflector.get<string | string[]>(PATH_METADATA, target);
        return Array.isArray(value) ? value : [value ?? ""];
      });
      if (paths.some((value) => /^\/?sfa(?:\/|$)/.test(value))) {
        throw new ForbiddenException("SFA permission metadata is required");
      }
      return true; // Legacy Excel/RIE requests perform no new database lookup.
    }
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user?.companyId || !Array.isArray(user.permissions)
      || !permitsOperationalRole(user.roleCode, required)
      || ![SFA_ACCESS_PERMISSION, ...required].every((permission) => user.permissions.includes(permission))) {
      throw new ForbiddenException("SFA company context and explicit permissions are required");
    }
    // Deliberately no SUPER_ADMIN bypass and no trust in body/JWT mode flags.
    const settings = await this.prisma.companyOperatingSettings.findUnique({
      where: { companyId: user.companyId }, select: { operatingMode: true },
    });
    if (!supportsSfaOperations(settings?.operatingMode)) throw new ForbiddenException("SFA is not enabled for your company");
    return true;
  }
}
