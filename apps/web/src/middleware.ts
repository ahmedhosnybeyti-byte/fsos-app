import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAMES } from "@field-sales-os/schemas";

// Fast UX redirect only — presence of the cookie is NOT proof of a valid
// session (it could be expired). The API's guard chain (JwtAuthGuard ->
// RolesGuard -> SubscriptionActiveGuard) is the actual security boundary;
// every dashboard page still re-checks auth via GET /auth/me client-side.
const PROTECTED_PREFIXES = ["/dashboard", "/admin"];
const GUEST_ONLY_PATHS = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const hasSession = !!request.cookies.get(AUTH_COOKIE_NAMES.accessToken);
  const { pathname } = request.nextUrl;

  // NOTE: this cookie check only works when the web app and the API share a
  // cookie-visible host (same domain, or web on a subdomain of the API's
  // COOKIE_DOMAIN). While the API is deployed separately (e.g. Railway) and
  // the web app runs on localhost, the session cookie belongs to the API's
  // origin and is genuinely never sent on requests to this Next.js server —
  // `hasSession` is always false here regardless of actual login state, so
  // the protected-route redirect below is disabled to avoid a permanent
  // redirect loop. This is safe: per the comment above, the API's guard
  // chain is the real security boundary and every dashboard page re-checks
  // via GET /auth/me client-side. Re-enable once web+API share a cookie
  // domain in a real deployment.
  // Disabled for now — see note above. PROTECTED_PREFIXES itself is kept
  // (unused) so re-enabling later is a one-line change.
  void PROTECTED_PREFIXES;

  const isGuestOnly = GUEST_ONLY_PATHS.some((path) => pathname.startsWith(path));
  if (isGuestOnly && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
