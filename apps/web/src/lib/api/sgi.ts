import { apiFetch } from "../api-client";
import type { SgiLatestResult, SgiRecalculateRequest, SgiRecalculateResult } from "../types";

export const sgiApi = {
  // Explicit date-window path (Migration #8: no file/column config anymore).
  recalculate: (body: SgiRecalculateRequest) => apiFetch<SgiRecalculateResult>("/sgi/recalculate", { method: "POST", body }),
  // Day-to-day refresh — freshly computes "this month vs last month"
  // server-side, no form needed.
  recalculateNow: () => apiFetch<SgiRecalculateResult>("/sgi/recalculate-now", { method: "POST" }),
  // GET /sgi/latest returns `null` (not an error) when no company config has
  // ever been saved yet — a normal, expected first-time state (see
  // sgi.service.ts's getLatest). Coerced here with `?? null` because
  // react-query's useQuery rejects a queryFn resolving to `undefined`
  // (distinct from `null`, which is a valid "no data yet" value) — this is
  // the only nullable-result endpoint in the app so far, and apiFetch's
  // generic JSON handling can, for a `null` body, surface as `undefined`
  // depending on the response's content-type; coercing here is the safe,
  // narrowly-scoped fix rather than changing apiFetch's shared behavior for
  // every other (never-null) endpoint.
  latest: () => apiFetch<SgiLatestResult | null>("/sgi/latest").then((r) => r ?? null),
};
