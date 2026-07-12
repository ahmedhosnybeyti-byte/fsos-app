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

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

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
