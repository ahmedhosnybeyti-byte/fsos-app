import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES, type RoleCode } from "@field-sales-os/schemas";
import { AppConfigService } from "../../../common/config";
import { PrismaService } from "../../../common/prisma";
import type { AuthenticatedUser } from "../../../common/types/authenticated-user";
import { RolesService } from "../../roles/roles.service";

interface AccessTokenPayload {
  sub: string;
  sv?: number;
}

function cookieExtractor(req: Request): string | null {
  return req?.cookies?.[AUTH_COOKIE_NAMES.accessToken] ?? null;
}

// Payload is deliberately minimal ({ sub: userId }) — validate() re-reads the
// user's status/role/permissions from the DB on every request, so a role
// change or account disable takes effect immediately instead of waiting for
// the 15-minute access token to expire.
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      secretOrKey: config.values.jwt.accessSecret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, company: true },
    });

    if (!user || user.status !== "ACTIVE" || (user.company && user.company.status !== "ACTIVE")) {
      throw new UnauthorizedException("Account is no longer active");
    }
    // Treat pre-rollout access JWTs as version 0. They remain valid until a
    // revocation occurs, after which their implicit version no longer matches.
    if ((payload.sv ?? 0) !== user.sessionVersion) {
      throw new UnauthorizedException("Session has been revoked");
    }

    const permissions = await this.rolesService.getPermissionCodes(user.roleId);

    return {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      roleCode: user.role.code as RoleCode,
      permissions,
      featureAccess: user.company?.featureAccess ?? null,
      mustChangePassword: user.mustChangePassword,
      orgUnitId: user.orgUnitId,
      trialStartsAt: user.trialStartsAt,
      trialEndsAt: user.trialEndsAt,
    };
  }
}
