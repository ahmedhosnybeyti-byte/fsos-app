export type SeedEnvironment = Record<string, string | undefined>;

export type InitialSuperAdminInput = { email: string; password: string };

export function assertDemoSeedAllowed(env: SeedEnvironment): void {
  if (env.NODE_ENV === "production") {
    throw new Error("Demo seed is disabled when NODE_ENV=production");
  }
}

export function getInitialProductionSuperAdmin(env: SeedEnvironment, hasSuperAdmin: boolean): InitialSuperAdminInput | null {
  if (env.NODE_ENV !== "production" || hasSuperAdmin) return null;

  const email = env.INITIAL_SUPER_ADMIN_EMAIL?.trim();
  const password = env.INITIAL_SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Initial production super admin requires INITIAL_SUPER_ADMIN_EMAIL and INITIAL_SUPER_ADMIN_PASSWORD");
  }
  return { email, password };
}
