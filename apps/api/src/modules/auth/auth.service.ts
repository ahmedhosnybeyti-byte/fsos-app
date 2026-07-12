import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import type { LoginInput, RegisterInput } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { CompaniesService } from "../companies/companies.service";
import { UsersService } from "../users/users.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { TokensService, type RefreshTokenMeta } from "./tokens.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly tokensService: TokensService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Self-serve signup always creates a brand-new Company + its first
  // COMPANY_ADMIN user on a trial subscription — the platform never lets a
  // signup join an existing company or pick its own role.
  async register(dto: RegisterInput, meta: RefreshTokenMeta) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException("An account with this email already exists");

    const { user, company } = await this.prisma.$transaction(async (tx) => {
      const company = await this.companiesService.createCompany(dto.companyName, tx);
      const user = await this.usersService.createCompanyAdmin(
        { companyId: company.id, email: dto.email, fullName: dto.fullName, password: dto.password },
        tx,
      );
      await this.subscriptionsService.createInitialSubscription(company.id, tx);
      return { user, company };
    });

    await this.auditLogService.record({
      companyId: company.id,
      userId: user.id,
      action: "auth.register",
      entityType: "Company",
      entityId: company.id,
    });

    return this.issueSession(user.id, meta);
  }

  async login(dto: LoginInput, meta: RefreshTokenMeta) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.auditLogService.record({ companyId: user.companyId, userId: user.id, action: "auth.login" });

    return this.issueSession(user.id, meta);
  }

  async refresh(rawRefreshToken: string, meta: RefreshTokenMeta) {
    const { userId, refreshToken } = await this.tokensService.rotateRefreshToken(rawRefreshToken, meta);
    const accessToken = this.tokensService.signAccessToken(userId);
    return { accessToken, refreshToken };
  }

  async logout(rawRefreshToken: string | undefined, userId?: string) {
    if (rawRefreshToken) {
      await this.tokensService.revokeRefreshToken(rawRefreshToken);
    }
    if (userId) {
      await this.auditLogService.record({ userId, action: "auth.logout" });
    }
  }

  private async issueSession(userId: string, meta: RefreshTokenMeta) {
    const accessToken = this.tokensService.signAccessToken(userId);
    const refreshToken = await this.tokensService.issueRefreshToken(userId, meta);
    const user = await this.usersService.findById(userId);
    return { accessToken, refreshToken, user };
  }
}
