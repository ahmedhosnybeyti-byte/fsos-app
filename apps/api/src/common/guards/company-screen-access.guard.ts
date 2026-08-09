import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { getCompanyFeatureAccessState, normalizeCompanyFeatureAccess, type CompanyScreenFeatureKey } from "@field-sales-os/schemas";
import { PrismaService } from "../prisma";
import { COMPANY_SCREEN_KEY } from "../decorators/company-screen.decorator";

@Injectable()
export class CompanyScreenAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const screenKey = this.reflector.getAllAndOverride<CompanyScreenFeatureKey>(COMPANY_SCREEN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!screenKey) return true;

    const user = context.switchToHttp().getRequest().user;
    // Platform administrators deliberately have no company boundary and must
    // always retain access, even when an individual company disables a screen.
    if (!user || user.roleCode === "SUPER_ADMIN") return true;
    if (!user.companyId) throw new ForbiddenException("A company context is required");

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { featureAccess: true },
    });
    const accessState = company && getCompanyFeatureAccessState(
      normalizeCompanyFeatureAccess(company.featureAccess),
      screenKey,
    );
    if (accessState !== "ENABLED") {
      throw new ForbiddenException("This screen is disabled for your company");
    }
    return true;
  }
}
