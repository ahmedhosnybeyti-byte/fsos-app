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
      include: { role: true },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Account is no longer active");
    }

    const permissions = await this.rolesService.getPermissionCodes(user.roleId);

    return {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      roleCode: user.role.code as RoleCode,
      permissions,
      orgUnitId: user.orgUnitId,
    };
  }
}
