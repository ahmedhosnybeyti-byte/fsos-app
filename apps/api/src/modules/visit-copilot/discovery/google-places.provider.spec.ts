import { strict as assert } from "node:assert";
import test from "node:test";
import { GooglePlacesProvider } from "./google-places.provider";

test("Google Text Search sends the selected circle as a locationRestriction, not a bias", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ places: [] }), { status: 200 });
  };

  try {
    await new GooglePlacesProvider("test-key").search({ lat: 24.7136, lon: 46.6753, radiusMeters: 5000, channel: "horeca" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestBody?.locationRestriction, {
    circle: { center: { latitude: 24.7136, longitude: 46.6753 }, radius: 5000 },
  });
  assert.equal("locationBias" in (requestBody ?? {}), false);
});
