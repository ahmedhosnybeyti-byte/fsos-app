import { ApiError } from "@/lib/api-client";
import type { Locale, TranslationKey } from "./dictionaries";

type Translate = (key: TranslationKey) => string;

export function translateApiError(error: unknown, locale: Locale, t: Translate): string {
  if (!(error instanceof ApiError)) return t("shared.error.requestFailed");
  if (locale === "ar" && error.messageAr) return error.messageAr;

  const statusKey: Partial<Record<number, TranslationKey>> = {
    401: "shared.error.unauthorized",
    403: "shared.error.forbidden",
    404: "shared.error.notFound",
    409: "shared.error.conflict",
    422: "shared.validation.invalid",
  };
  const key = statusKey[error.status];
  return key ? t(key) : error.message || t("shared.error.requestFailed");
}

export function translateValidationError(error: unknown, t: Translate): string {
  return error instanceof ApiError && error.status === 422 ? t("shared.validation.invalid") : t("shared.error.requestFailed");
}
