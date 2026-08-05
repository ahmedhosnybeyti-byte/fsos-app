import type { Response } from "express";
import { AUTH_COOKIE_NAMES, API_VERSION_PREFIX, TOKEN_TTL } from "@field-sales-os/schemas";
import type { AppConfigService } from "../../common/config";

const REFRESH_COOKIE_PATH = `/api/${API_VERSION_PREFIX}/auth`;

function baseCookieOptions(config: AppConfigService) {
  const isProd = config.values.app.nodeEnv === "production";
  // Always omit Domain. Railway web and API deployments use separate hosts;
  // setting Domain to either host makes the browser reject the API response's
  // Set-Cookie. Omitting it creates a host-only cookie on the API origin.
  // Cross-origin (web app and API on different hosts, e.g. localhost:3000
  // talking to a *.railway.app API) requires SameSite=None, which in turn
  // requires Secure — fine in prod (Railway is HTTPS). Local dev, where
  // both sides are on localhost, keeps "lax" since SameSite=None without
  // Secure is rejected by browsers over plain http. (`as const` can't be
  // applied directly to a ternary — TS1355 — so the union is annotated on
  // this intermediate variable instead.)
  const sameSite: "none" | "lax" = isProd ? "none" : "lax";
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
