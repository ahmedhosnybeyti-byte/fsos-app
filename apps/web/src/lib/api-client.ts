const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors?: unknown,
    // Machine-readable error code from the backend body (e.g.
    // "TRIAL_FEATURE_LOCKED", "SUBSCRIPTION_INACTIVE") — lets callers branch
    // on specific failure reasons instead of pattern-matching the message
    // text. Undefined for errors that don't carry one.
    public readonly code?: string,
    // Arabic counterpart of `message`, when the backend provides one.
    public readonly messageAr?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Shared check for the trial-tier feature lock (see
// RequiresPaidPlanGuard on the backend) — used by every AI-feature call
// site's onError so the "upgrade to unlock" message is worded consistently
// instead of falling through to each feature's generic error fallback.
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

// Single fetch wrapper for the whole app: sends the httpOnly session cookie
// on every request, normalizes errors into ApiError so callers/react-query
// can handle them uniformly.
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, query, signal } = options;

  const url = new URL(`${API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    credentials: "include",
    headers: formData ? undefined : body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal,
  });

  const contentType = res.headers.get("content-type");
  const data = contentType?.includes("application/json") ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(data?.message ?? res.statusText ?? "Request failed", res.status, data?.errors, data?.code, data?.messageAr);
  }

  return data as T;
}
