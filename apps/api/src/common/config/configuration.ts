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
  } as const;
}

export type AppConfig = ReturnType<typeof buildConfiguration>;
