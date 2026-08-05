import type { Response } from "express";
import { AUTH_COOKIE_NAMES, API_VERSION_PREFIX, TOKEN_TTL } from "@field-sales-os/schemas";
import type { AppConfigService } from "../../common/config";

const REFRESH_COOKIE_PATH = `/api/${API_VERSION_PREFIX}/auth`;

function baseCookieOptions(config: AppConfigService) {
  const isProd = config.values.app.nodeEnv === "production";
  // Auth traffic is proxied through the web host at /api/v1. Omitting Domain
  // makes the cookies host-only on that same origin; Lax keeps them secure
  // without cross-site cookie behavior.
  const sameSite: "lax" = "lax";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite,
    path: "/",
  };
}

export function setAuthCookies(
  res: Response,
  config: AppConfigService,
  tokens: { accessToken: string; refreshToken: string },
) {
  const base = baseCookieOptions(config);

  res.cookie(AUTH_COOKIE_NAMES.accessToken, tokens.accessToken, {
    ...base,
    maxAge: TOKEN_TTL.accessTokenMinutes * 60 * 1000,
  });
  // Scoped to the auth routes only, so the long-lived refresh secret isn't
  // sent on every request — just when refreshing/logging out.
  res.cookie(AUTH_COOKIE_NAMES.refreshToken, tokens.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: TOKEN_TTL.idleSessionHours * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response, config: AppConfigService) {
  const base = baseCookieOptions(config);
  res.clearCookie(AUTH_COOKIE_NAMES.accessToken, base);
  res.clearCookie(AUTH_COOKIE_NAMES.refreshToken, { ...base, path: REFRESH_COOKIE_PATH });
}
