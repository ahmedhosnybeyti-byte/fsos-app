import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES, loginSchema, registerSchema, type LoginInput, type RegisterInput } from "@field-sales-os/schemas";
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
}
