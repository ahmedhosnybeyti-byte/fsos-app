/**
 * Produces the URL shape used by RequestTrace logs. Request telemetry may
 * retain a route and query parameter names for diagnosis, but never values.
 */
export function redactRequestTraceUrl(url: string): string {
  try {
    const parsed = new URL(url, "http://redaction.invalid");
    const queryNames = [...parsed.searchParams.keys()];
    return `${parsed.pathname}${queryNames.length ? `?${queryNames.map((key) => encodeURIComponent(key)).join("&")}` : ""}`;
  } catch {
    // Never fall back to a malformed query string verbatim.
    return url.split("?", 1)[0] ?? "";
  }
}
