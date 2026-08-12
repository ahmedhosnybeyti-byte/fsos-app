import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { generateTemporaryPassword } from "./temporary-password";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { LoginInput, RegisterInput } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { UsersService } from "../users/users.service";
import type { TrialCountry } from "@field-sales-os/schemas";
import { AuditLogService } from "../audit-log/audit-log.service";
import { TokensService, type RefreshTokenMeta } from "./tokens.service";
import { UserActivityService } from "../user-activity/user-activity.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly config: import("../../common/config").AppConfigService,
    private readonly tokensService: TokensService,
    private readonly auditLogService: AuditLogService,
    private readonly userActivity?: UserActivityService,
  ) {}

  // Self-serve signup always creates a brand-new Company + its first
  // COMPANY_ADMIN user on a trial subscription — the platform never lets a
  // signup join an existing company or pick its own role.
  async register(dto: RegisterInput, meta: RefreshTokenMeta) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException("An account with this email already exists");

    /*const { user, company } = await this.prisma.$transaction(async (tx) => {
      // Phase 2: signup now runs the full Company Provisioning Engine
      // (Company + CompanyProfile + default Branch) instead of just creating
      // the bare Company row — see CompaniesService.provisionCompany.
      const { company } = await this.companiesService.provisionCompany(dto.companyName, tx, dto.accountType);
      const user = await this.usersService.createCompanyAdmin(
        { companyId: company.id, email: dto.email, fullName: dto.fullName, password: dto.password, whatsapp: dto.whatsapp },
        tx,
      );
      const subscription = await this.subscriptionsService.createInitialSubscription(company.id, tx);
      const readyCompany = await tx.company.update({
        where: { id: company.id },
        data: {
          status: "ACTIVE",
          ...(subscription.status === "TRIAL" && {
            featureAccess: { files: "ENABLED", assistant: "LOCKED", "fsos-360": "LOCKED", settings: "LOCKED", account: "LOCKED", user_activity: "HIDDEN" },
          }),
        },
      });
      return { user, company: readyCompany };
    });*/
    const target = this.sharedTrialTarget(dto.country);
    const company = await this.prisma.company.findUnique({ where: { slug: target.companySlug }, select: { id: true } });
    if (!company) throw new BadRequestException("The configured shared-trial company is unavailable");
    const trialStartsAt = new Date(); const trialEndsAt = new Date(trialStartsAt); trialEndsAt.setDate(trialEndsAt.getDate() + 10);
    const user = await this.usersService.createSharedTrialUser({ companyId: company.id, email: dto.email, fullName: dto.fullName, password: dto.password, whatsapp: dto.whatsapp, roleCode: dto.trialRole, routeId: dto.trialRole === "SALES_REP" ? this.resolveTrialRouteCode(dto.country, dto.trialChannel!, dto.trialArea) : undefined, trialStartsAt, trialEndsAt });

    await this.auditLogService.record({
      companyId: company.id,
      userId: user.id,
      action: "auth.register",
      entityType: "Company",
      entityId: company.id,
    });

    return this.issueSession(user.id, meta);
  }

  private sharedTrialTarget(country: TrialCountry) {
    const target = country === "EGYPT" ? this.config.values.sharedTrial.egypt : this.config.values.sharedTrial.saudiArabia;
    if (!target.companySlug) throw new BadRequestException("Shared trial is not configured for the selected country");
    return target;
  }

  private resolveTrialRouteCode(country: TrialCountry, channel: "CASH_VAN" | "HORECA", area?: "ALEXANDRIA" | "SHARQIA") {
    if (country === "SAUDI_ARABIA") return channel === "CASH_VAN" ? "RT-09" : "RT-12";
    if (area === "ALEXANDRIA") return channel === "CASH_VAN" ? "RT-05" : "RT-06";
    if (area === "SHARQIA") return channel === "CASH_VAN" ? "RT-11" : "RT-12";
    throw new BadRequestException("Area is required for Egypt Sales Rep");
  }

  async login(dto: LoginInput, meta: RefreshTokenMeta) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // Identity Audit: every failed attempt is logged (Phase 4's explicit
    // "Failed Login" event), whether the account doesn't exist, isn't
    // Active, or the password was wrong — the response message stays
    // identical in all three cases so the log (not the API) is where this
    // distinction lives.
    if (!user || user.status !== "ACTIVE" || (user.company && user.company.status !== "ACTIVE")) {
      await this.auditLogService.record({
        companyId: user?.companyId ?? null,
        userId: user?.id ?? null,
        action: "identity.login_failed",
        metadata: { email: dto.email, reason: user ? "inactive_account" : "unknown_email" },
      });
      await this.userActivity?.record({ type: "AUTH_LOGIN_FAILED", category: "ACCESS", actorType: "SYSTEM", subjectUserId: user?.id ?? null, companyId: user?.companyId ?? null, outcome: "FAILURE", source: "auth.login", metadata: { reason: user ? "inactive_account" : "unknown_email" } });
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      await this.auditLogService.record({
        companyId: user.companyId,
        userId: user.id,
        action: "identity.login_failed",
        metadata: { email: dto.email, reason: "invalid_password" },
      });
      await this.userActivity?.record({ type: "AUTH_LOGIN_FAILED", category: "ACCESS", actorUserId: user.id, subjectUserId: user.id, actorRole: user.role.code, companyId: user.companyId, outcome: "FAILURE", source: "auth.login", metadata: { reason: "invalid_password" } });
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.auditLogService.record({ companyId: user.companyId, userId: user.id, action: "auth.login" });
    await this.userActivity?.record({ type: "AUTH_LOGIN_SUCCESS", category: "ACCESS", actorUserId: user.id, subjectUserId: user.id, actorRole: user.role.code, companyId: user.companyId, source: "auth.login" });

    return this.issueSession(user.id, meta);
  }

  // Phase 4: self-service Password Management. Revokes every other session
  // on success — a password change is a strong signal the old credential
  // should stop working everywhere else immediately.
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) throw new NotFoundException("User not found");

    const currentValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!currentValid) throw new UnauthorizedException("Current password is incorrect");

    if (await argon2.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException({
        code: "PASSWORD_REUSE_NOT_ALLOWED",
        message: "New password must be different from your current password",
        messageAr: "يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور الحالية",
      });
    }

    await this.usersService.setPasswordHash(userId, await argon2.hash(newPassword), false);
    await this.tokensService.revokeAllForUser(userId);

    await this.auditLogService.record({
      companyId: user.companyId,
      userId,
      action: "identity.password_change",
      entityType: "User",
      entityId: userId,
    });
  }


  async changeEmail(userId: string, currentPassword: string, newEmail: string) {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) throw new NotFoundException("User not found");
    if (!(await argon2.verify(user.passwordHash, currentPassword))) throw new UnauthorizedException("Current password is incorrect");
    const normalizedEmail = newEmail.trim().toLowerCase();
    if (normalizedEmail === user.email) throw new BadRequestException("New email must be different from your current email");
    await this.usersService.changeEmail(userId, normalizedEmail);
    await this.tokensService.revokeAllForUser(userId);
    await this.auditLogService.record({ companyId: user.companyId, userId, action: "identity.email_change", entityType: "User", entityId: userId });
  }
  // Phase 4: admin-issued Reset Password ("Platform Administrator or
  // Company Administrator" per the constitution). Generates a temporary
  // password, forces the user to set their own on next login
  // (mustChangePassword), and revokes existing sessions as a security
  // side-effect (Identity Audit's Session Revocation event).
  async resetPassword(targetUserId: string, actingUser: AuthenticatedUser) {
    const target = await this.usersService.findById(targetUserId);
    if (!target) throw new NotFoundException("User not found");
    if (actingUser.roleCode !== "SUPER_ADMIN" && target.companyId !== actingUser.companyId) {
      throw new ForbiddenException();
    }

    const temporaryPassword = generateTemporaryPassword();
    await this.usersService.setPasswordHash(targetUserId, await argon2.hash(temporaryPassword), true);
    await this.tokensService.revokeAllForUser(targetUserId);

    await this.auditLogService.record({
      companyId: target.companyId,
      userId: actingUser.userId,
      action: "identity.password_reset",
      entityType: "User",
      entityId: targetUserId,
    });
    await this.auditLogService.record({
      companyId: target.companyId,
      userId: actingUser.userId,
      action: "identity.session_revoked",
      entityType: "User",
      entityId: targetUserId,
      metadata: { reason: "password_reset" },
    });

    return { temporaryPassword };
  }

  // Phase 4: standalone Session Revocation — an admin forcing a user's
  // sessions to end without necessarily changing their password (e.g.
  // suspected device theft).
  async revokeSessions(targetUserId: string, actingUser: AuthenticatedUser) {
    const target = await this.usersService.findById(targetUserId);
    if (!target) throw new NotFoundException("User not found");
    if (actingUser.roleCode !== "SUPER_ADMIN" && target.companyId !== actingUser.companyId) {
      throw new ForbiddenException();
    }

    await this.tokensService.revokeAllForUser(targetUserId);
    await this.auditLogService.record({
      companyId: target.companyId,
      userId: actingUser.userId,
      action: "identity.session_revoked",
      entityType: "User",
      entityId: targetUserId,
      metadata: { reason: "manual" },
    });
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
      const user = await this.usersService.findById(userId);
      await this.userActivity?.record({ type: "AUTH_LOGOUT", category: "ACCESS", actorUserId: userId, subjectUserId: userId, actorRole: user?.role.code, companyId: user?.companyId, source: "auth.logout" });
    }
  }

  private async issueSession(userId: string, meta: RefreshTokenMeta) {
    const accessToken = this.tokensService.signAccessToken(userId);
    const refreshToken = await this.tokensService.issueRefreshToken(userId, meta);
    const user = await this.usersService.findById(userId);
    return { accessToken, refreshToken, user };
  }
}
