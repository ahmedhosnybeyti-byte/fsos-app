import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_URL: z.string().url(),
  WEB_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  COOKIE_DOMAIN: z.string().min(1),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),

  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_REGION: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Optional — only required for the heat map's free-text filter box
  // (translates a natural-language request into a structured filter via
  // the Claude API). If unset, that one endpoint returns a clear error;
  // everything else in the app works without it.
  ANTHROPIC_API_KEY: z.string().optional(),

  // GOOGLE_PLACES_API_KEY (removed): Customer Discovery's Google key is now
  // a per-company setting stored encrypted on CompanyProfile — see the
  // provider-based discovery refactor in modules/visit-copilot/discovery.
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return result.data;
}
