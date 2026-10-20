// The API validates the HttpOnly session against the current account/role.
// No JWT claims supplied by the browser are trusted here.
export async function canViewSfaPreview(apiUrl: string, cookie: string, request: typeof fetch = fetch): Promise<boolean> {
  if (!cookie) return false;
  try {
    const response = await request(`${apiUrl.replace(/\/$/, "")}/auth/me`, {
      headers: { Cookie: cookie }, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    const user = await response.json();
    return user?.role?.code === "SUPER_ADMIN" && user?.status === "ACTIVE" && user?.mustChangePassword === false;
  } catch { return false; }
}
