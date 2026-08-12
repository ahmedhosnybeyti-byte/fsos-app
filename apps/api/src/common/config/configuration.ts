import type { EnvConfig } from "./env.validation";

export function buildConfiguration(env: EnvConfig) {
  return {
    app: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      apiUrl: env.API_URL,
      webUrl: env.WEB_URL,
      corsOrigins: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
      cookieDomain: env.COOKIE_DOMAIN,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
    },
    storage: {
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      bucket: env.STORAGE_BUCKET,
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    },
    googlePlaces: {
      apiKey: env.GOOGLE_PLACES_API_KEY,
    },
    sharedTrial: { egypt: { companySlug: env.TRIAL_EGYPT_COMPANY_SLUG }, saudiArabia: { companySlug: env.TRIAL_SAUDI_ARABIA_COMPANY_SLUG } },
  } as const;
}

export type AppConfig = ReturnType<typeof buildConfiguration>;
