import type { Response } from "express";
import { AUTH_COOKIE_NAMES, API_VERSION_PREFIX, TOKEN_TTL } from "@field-sales-os/schemas";
import type { AppConfigService } from "../../common/config";

const REFRESH_COOKIE_PATH = `/api/${API_VERSION_PREFIX}/auth`;

function baseCookieOptions(config: AppConfigService) {
  const isProd = config.values.app.nodeEnv === "production";
  const cookieDomain = config.values.app.cookieDomain;
  // "localhost" is only a valid Set-Cookie Domain when the API itself is
  // also served from localhost (local dev, both sides on the same host).
  // Once the API is deployed elsewhere (e.g. Railway) while the web app
  // still runs on localhost, a response from the Railway host can't set a
  // cookie scoped to "localhost" at all — the browser silently drops it,
  // which is what made login look like it "did nothing" (the request
  // succeeded, but no session cookie was ever actually stored). Omitting
  // `domain` makes it a host-only cookie tied to the API's real origin,
  // which works correctly across origins as long as sameSite is "none".
  const domain = cookieDomain && cookieDomain !== "localhost" ? cookieDomain : undefined;
  return {
    httpOnly: true,
    secure: isProd,
    // Cross-origin (web app and API on different hosts, e.g. localhost:3000
    // talking to a *.railway.app API) requires SameSite=None, which in turn
    // requires Secure — fine in prod (Railway is HTTPS). Local dev, where
    // both sides are on localhost, keeps "lax" since SameSite=None without
    // Secure is rejected by browsers over plain http.
    sameSite: (isProd ? "none" : "lax") as const,
    domain,
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
    maxAge: TOKEN_TTL.refreshTokenDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response, config: AppConfigService) {
  const base = baseCookieOptions(config);
  res.clearCookie(AUTH_COOKIE_NAMES.accessToken, base);
  res.clearCookie(AUTH_COOKIE_NAMES.refreshToken, { ...base, path: REFRESH_COOKIE_PATH });
}
