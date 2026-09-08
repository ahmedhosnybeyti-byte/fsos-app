import { Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { TOKEN_TTL } from "@field-sales-os/schemas";
import { AppConfigService } from "../../common/config";
import { PrismaService } from "../../common/prisma";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface RefreshTokenMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(userId: string, sessionVersion: number): string {
    return this.jwt.sign({ sub: userId, sv: sessionVersion }, { secret: this.config.values.jwt.accessSecret, expiresIn: `${TOKEN_TTL.accessTokenMinutes}m` });
  }

  async getSessionVersion(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
    if (!user) throw new UnauthorizedException("Account is not active");
    return user.sessionVersion;
  }

  async issueRefreshToken(userId: string, meta: RefreshTokenMeta = {}, sessionStartedAt = new Date(), sessionVersion?: number): Promise<string> {
    const raw = randomBytes(48).toString("base64url");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_TTL.idleSessionHours);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(raw), userAgent: meta.userAgent, ip: meta.ip, expiresAt, sessionStartedAt, sessionVersion: sessionVersion ?? await this.getSessionVersion(userId) },
    });
    return raw;
  }

  async rotateRefreshToken(rawToken: string, meta: RefreshTokenMeta = {}): Promise<{ userId: string; refreshToken: string; sessionVersion: number }> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record) throw new UnauthorizedException("Invalid refresh token");
    if (record.revokedAt) {
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException("Refresh token reuse detected; all sessions revoked");
    }

    const now = new Date();
    const sessionStartedAt = record.sessionStartedAt ?? record.createdAt;
    const absoluteExpiresAt = new Date(sessionStartedAt);
    absoluteExpiresAt.setDate(absoluteExpiresAt.getDate() + TOKEN_TTL.absoluteSessionDays);
    if (record.expiresAt < now || absoluteExpiresAt < now) {
      await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: now } });
      throw new UnauthorizedException("Session expired");
    }

    const owner = await this.prisma.user.findUnique({ where: { id: record.userId }, select: { status: true, sessionVersion: true, company: { select: { status: true } } } });
    if (!owner || owner.status !== "ACTIVE" || (owner.company && owner.company.status !== "ACTIVE")) {
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException("Account is not active");
    }

    // This is the consume operation. The predicate makes it a compare-and-set:
    // exactly one concurrent request can change an active token to revoked.
    // It also refuses a token from a session generation invalidated meanwhile.
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null, sessionVersion: owner.sessionVersion, user: { sessionVersion: owner.sessionVersion } },
      data: { revokedAt: now },
    });
    if (consumed.count !== 1) {
      const current = await this.prisma.refreshToken.findUnique({ where: { id: record.id }, select: { revokedAt: true } });
      if (current?.revokedAt) await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException("Invalid refresh token");
    }

    const refreshToken = await this.issueRefreshToken(record.userId, meta, sessionStartedAt, owner.sessionVersion);
    return { userId: record.userId, refreshToken, sessionVersion: owner.sessionVersion };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }

  async revokeAllForCompany(companyId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { companyId }, data: { sessionVersion: { increment: 1 } } });
      await tx.refreshToken.updateMany({ where: { user: { companyId }, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }
}
