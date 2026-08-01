import type { RoleCode } from "@field-sales-os/schemas";

export const ACCOUNT_PATH = "/account" as const;

export function getAccountPath(_roleCode: RoleCode): typeof ACCOUNT_PATH {
  return ACCOUNT_PATH;
}

export function getAccountGuardPath(isAuthenticated: boolean): "/login" | null {
  return isAuthenticated ? null : "/login";
}

export function getPostPasswordChangePath(): "/login" {
  return "/login";
}
export async function finalizePasswordChange({
  logout,
  clearLocalSession,
  clearQueryCache,
  redirect,
}: {
  logout: () => Promise<unknown>;
  clearLocalSession: () => void;
  clearQueryCache: () => void;
  redirect: (path: ReturnType<typeof getPostPasswordChangePath>) => void;
}): Promise<void> {
  try {
    await logout();
  } finally {
    clearLocalSession();
    clearQueryCache();
    redirect(getPostPasswordChangePath());
  }
}