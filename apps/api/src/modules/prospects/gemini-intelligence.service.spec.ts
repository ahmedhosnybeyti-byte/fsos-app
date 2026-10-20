import assert from "node:assert/strict";
import test from "node:test";
import { GeminiIntelligenceService, type GeminiIntelligenceInput } from "./gemini-intelligence.service";

const input: GeminiIntelligenceInput = {
  prospectId: "prospect-a", inputFingerprint: "facts-v1", normalizedProspectFacts: { name: "Fixture" }, refreshAt: new Date("2026-10-20"),
};
function fixture(apiKey = "fixture-only-key") {
  const writes: unknown[] = [];
  const service = new GeminiIntelligenceService({ values: { gemini: { apiKey, model: "fixture-model" } } } as never, {
    resolve: async (companyId: string, prospectId: string) => {
      assert.equal(companyId, "company-a"); assert.equal(prospectId, "prospect-a"); return { state: "MISSING" };
    },
    storeGeminiInsights: async (entry: unknown) => { writes.push(entry); },
  } as never);
  const enrich = () => service.enrich({ companyId: "company-a" } as never, input);
  return { enrich, writes };
}

test("Gemini outage, throttling and invalid output never persist fabricated insights or retry", async (t) => {
  for (const status of [401, 429, 503]) {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("unavailable", { status }); });
    const { enrich, writes } = fixture();
    assert.equal((await enrich()).state, "FALLBACK");
    assert.equal(calls, 1); assert.deepEqual(writes, []);
    t.mock.restoreAll();
  }
  for (const body of ["broken-json", JSON.stringify({ candidates: [] }), JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"confidence":1}' }] } }] })]) {
    t.mock.method(globalThis, "fetch", async () => new Response(body));
    const { enrich, writes } = fixture();
    assert.equal((await enrich()).state, "FALLBACK"); assert.deepEqual(writes, []);
    t.mock.restoreAll();
  }
});

test("Gemini enforces its existing 12-second abort deadline with one attempt and no write", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls++; signal = init.signal!;
    return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  });
  const { enrich, writes } = fixture();
  const result = enrich();
  await Promise.resolve();
  assert.equal(calls, 1);
  t.mock.timers.tick(11_999); assert.equal(signal!.aborted, false);
  t.mock.timers.tick(1); assert.equal(signal!.aborted, true);
  assert.equal((await result).state, "FALLBACK"); assert.deepEqual(writes, []);
});

test("Gemini missing configuration does not invoke the external service", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not call provider"); });
  assert.equal((await fixture("").enrich()).state, "FALLBACK");
  assert.equal(mock.mock.callCount(), 0);
});
