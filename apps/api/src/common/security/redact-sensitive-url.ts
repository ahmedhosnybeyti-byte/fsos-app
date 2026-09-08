const SENSITIVE_QUERY_KEY = /(?:token|secret|password|authorization|api[-_]?key|credential)/i;
const SENSITIVE_QUERY_VALUE = /([?&][^=&#\s]*(?:token|secret|password|authorization|api[-_]?key|credential)[^=&#\s]*=)[^&#\s]*/gi;

/**
 * Produces a safe path for logs, error payloads, and audit metadata. Query
 * keys remain useful for diagnosis, but values for credentials are never
 * retained. Keep this at the transport boundary rather than relying on each
 * log site to remember every sensitive parameter name.
 */
export function redactSensitiveUrl(url: string): string {
  try {
    const parsed = new URL(url, "http://redaction.invalid");
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) parsed.searchParams.set(key, "[REDACTED]");
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    // Express normally provides a valid relative URL. If a malformed value
    // reaches a log path, never risk returning its query string verbatim.
    return url.split("?", 1)[0] ?? "";
  }
}

/** Redacts query values embedded in arbitrary error text or stack traces. */
export function redactSensitiveQueryValues(text: string): string {
  return text.replace(SENSITIVE_QUERY_VALUE, "$1[REDACTED]");
}
