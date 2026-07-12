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

// Access tokens are stateless short-lived JWTs. Refresh tokens are opaque
// random strings, stored only as a sha256 hash, DB-tracked so they can be
// revoked instantly (required to lock out an expired/suspended company
// mid-session — a stateless JWT alone can't do that). Rotation-on-use with
// reuse detection: presenting an already-used refresh token revokes the
// entire session family, treating it as a signal of token theft.
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId },
      {
        secret: this.config.values.jwt.accessSecret,
        expiresIn: `${TOKEN_TTL.accessTokenMinutes}m`,
      },
    );
  }

  async issueRefreshToken(userId: string, meta: RefreshTokenMeta = {}): Promise<string> {
    const raw = randomBytes(48).toString("base64url");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TOKEN_TTL.refreshTokenDays);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt,
      },
    });

    return raw;
  }

  // Validates + rotates in one step: returns the userId and a fresh raw
  // refresh token, or throws.
  async rotateRefreshToken(rawToken: string, meta: RefreshTokenMeta = {}): Promise<{ userId: string; refreshToken: string }> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record) throw new UnauthorizedException("Invalid refresh token");

    if (record.revokedAt) {
      // Reuse of an already-rotated token — treat as compromised and log the
      // user out everywhere.
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException("Refresh token reuse detected; all sessions revoked");
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    const refreshToken = await this.issueRefreshToken(record.userId, meta);

    return { userId: record.userId, refreshToken };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Used by the scheduled expiry job to lock out an entire company the
  // instant its subscription lapses.
  async revokeAllForCompany(companyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { user: { companyId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
