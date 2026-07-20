import { Body, Controller, ForbiddenException, Get, Param, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  AUTH_COOKIE_NAMES,
  changePasswordSchema,
  loginSchema,
  registerSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
} from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { SkipSubscriptionCheck } from "../../common/decorators/skip-subscription-check.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AppConfigService } from "../../common/config";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuthService } from "./auth.service";
import { setAuthCookies, clearAuthCookies } from "./auth.cookies";
import { UsersService } from "../users/users.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: AppConfigService,
  ) {}

  @Post("register")
  @Public()
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.register(body, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    setAuthCookies(res, this.config, { accessToken, refreshToken });
    return { user };
  }

  @Post("login")
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(body, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    setAuthCookies(res, this.config, { accessToken, refreshToken });
    return { user };
  }

  @Post("refresh")
  @Public()
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[AUTH_COOKIE_NAMES.refreshToken];
    if (!rawRefreshToken) throw new UnauthorizedException("No refresh token provided");

    const { accessToken, refreshToken } = await this.authService.refresh(rawRefreshToken, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    setAuthCookies(res, this.config, { accessToken, refreshToken });
    return { success: true };
  }

  @Post("logout")
  @Public()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.[AUTH_COOKIE_NAMES.refreshToken];
    const user = (req as unknown as { user?: AuthenticatedUser }).user;
    await this.authService.logout(rawRefreshToken, user?.userId);
    clearAuthCookies(res, this.config);
    return { success: true };
  }

  @Get("me")
  @Auth()
  @SkipSubscriptionCheck()
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.usersService.findById(user.userId);
    return { ...profile, permissions: user.permissions };
  }

  // Phase 4: self-service Password Management.
  @Post("change-password")
  @Auth()
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    await this.authService.changePassword(user.userId, body.currentPassword, body.newPassword);
    return { success: true };
  }

  // Phase 4: admin-issued Reset Password — Platform Administrator or
  // Company Administrator only, per the Identity Platform's Password
  // Management rules. No request body: the server generates the temporary
  // password, never the caller.
  @Post("users/:id/reset-password")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  resetPassword(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (user.roleCode !== "SUPER_ADMIN" && !user.companyId) throw new ForbiddenException();
    return this.authService.resetPassword(id, user);
  }

  // Phase 4: standalone Session Revocation (Identity Audit event).
  @Post("users/:id/revoke-sessions")
  @Auth("COMPANY_ADMIN", "SUPER_ADMIN")
  async revokeSessions(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (user.roleCode !== "SUPER_ADMIN" && !user.companyId) throw new ForbiddenException();
    await this.authService.revokeSessions(id, user);
    return { success: true };
  }
}
