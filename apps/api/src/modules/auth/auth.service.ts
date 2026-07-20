import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { LoginInput, RegisterInput } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { CompaniesService } from "../companies/companies.service";
import { UsersService } from "../users/users.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { TokensService, type RefreshTokenMeta } from "./tokens.service";

// Admin-issued temporary passwords are random, not memorable — the admin
// relays this string to the user out-of-band exactly once; it is never
// logged or stored in plaintext anywhere. Built to satisfy PASSWORD_POLICY
// (upper/lower/digit/special, min length 10) by construction rather than
// generating-and-retrying against passwordSchema.
function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*";
  const pick = (chars: string) => chars[randomBytes(1).readUInt8(0) % chars.length];

  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  const fillerPool = upper + lower + digits + special;
  for (let i = 0; i < 8; i++) chars.push(pick(fillerPool));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1).readUInt8(0) % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

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
      // Phase 2: signup now runs the full Company Provisioning Engine
      // (Company + CompanyProfile + default Branch) instead of just creating
      // the bare Company row — see CompaniesService.provisionCompany.
      const { company } = await this.companiesService.provisionCompany(dto.companyName, tx);
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

    // Identity Audit: every failed attempt is logged (Phase 4's explicit
    // "Failed Login" event), whether the account doesn't exist, isn't
    // Active, or the password was wrong — the response message stays
    // identical in all three cases so the log (not the API) is where this
    // distinction lives.
    if (!user || user.status !== "ACTIVE") {
      await this.auditLogService.record({
        companyId: user?.companyId ?? null,
        userId: user?.id ?? null,
        action: "identity.login_failed",
        metadata: { email: dto.email, reason: user ? "inactive_account" : "unknown_email" },
      });
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
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.auditLogService.record({ companyId: user.companyId, userId: user.id, action: "auth.login" });

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
    }
  }

  private async issueSession(userId: string, meta: RefreshTokenMeta) {
    const accessToken = this.tokensService.signAccessToken(userId);
    const refreshToken = await this.tokensService.issueRefreshToken(userId, meta);
    const user = await this.usersService.findById(userId);
    return { accessToken, refreshToken, user };
  }
}
