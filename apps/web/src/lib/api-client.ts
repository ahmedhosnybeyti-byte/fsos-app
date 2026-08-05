// Browser requests stay same-origin so HttpOnly cookies are issued by and
// returned to the web host. The Next rewrite proxies /api/v1 to the API.
const API_URL = typeof window === "undefined" ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1") : "/api/v1";

function apiUrl(path: string): string {
  return new URL(`${API_URL}${path}`, typeof window === "undefined" ? "http://localhost:3000" : window.location.origin).toString();
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly errors?: unknown, public readonly code?: string, public readonly messageAr?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function isTrialFeatureLocked(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "TRIAL_FEATURE_LOCKED";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(apiUrl("/auth/refresh"), { method: "POST", credentials: "include" })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function request(url: string, options: RequestOptions): Promise<{ response: Response; data: unknown }> {
  const { method = "GET", body, formData, signal } = options;
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: formData ? undefined : body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal,
  });
  const contentType = response.headers.get("content-type");
  return { response, data: contentType?.includes("application/json") ? await response.json() : undefined };
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(apiUrl(path));
  if (options.query) for (const [key, value] of Object.entries(options.query)) if (value !== undefined) url.searchParams.set(key, String(value));

  let result = await request(url.toString(), options);
  const canRefresh = result.response.status === 401 && !["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"].includes(path);
  if (canRefresh && await refreshSession()) result = await request(url.toString(), options);

  if (!result.response.ok) {
    const data = result.data as { message?: string; errors?: unknown; code?: string; messageAr?: string } | undefined;
    throw new ApiError(data?.message ?? result.response.statusText ?? "Request failed", result.response.status, data?.errors, data?.code, data?.messageAr);
  }
  return result.data as T;
}