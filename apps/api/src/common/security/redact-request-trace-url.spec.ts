import { strict as assert } from "node:assert";
import test from "node:test";
import { redactRequestTraceUrl } from "./redact-request-trace-url";

test("RequestTrace retains a route and query names but never query values", () => {
  const traceUrl = redactRequestTraceUrl("/api/v1/smart-loading/session?targetDate=2026-09-14&managerId=EMP-005&customer=customer-secret&flag");

  assert.equal(traceUrl, "/api/v1/smart-loading/session?targetDate&managerId&customer&flag");
  assert.doesNotMatch(traceUrl, /2026-09-14|EMP-005|customer-secret/);
});

test("RequestTrace tolerates malformed encoded values without logging them", () => {
  const traceUrl = redactRequestTraceUrl("/api/v1/example?customer=secret%ZZ");
  assert.equal(traceUrl, "/api/v1/example?customer");
  assert.doesNotMatch(traceUrl, /secret/);
});
