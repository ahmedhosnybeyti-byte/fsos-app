const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
}

// Single fetch wrapper for the whole app: sends the httpOnly session cookie
// on every request, normalizes errors into ApiError so callers/react-query
// can handle them uniformly.
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, query } = options;

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
  });

  const contentType = res.headers.get("content-type");
  const data = contentType?.includes("application/json") ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(data?.message ?? res.statusText ?? "Request failed", res.status, data?.errors);
  }

  return data as T;
}
