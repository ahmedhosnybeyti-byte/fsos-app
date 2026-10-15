import { strict as assert } from "node:assert";
import test from "node:test";
import { OverpassProvider } from "./overpass.provider";

test("Water Cash Van Overpass search uses only selected target filters and preserves the 40-result cap", async () => {
  const originalFetch = globalThis.fetch;
  let query = "";
  globalThis.fetch = async (_input, init) => {
    query = decodeURIComponent(String(init?.body).replace(/^data=/, ""));
    return new Response(JSON.stringify({ elements: [] }), { status: 200 });
  };
  try {
    await new OverpassProvider().search({
      lat: 24.7,
      lon: 46.6,
      radiusMeters: 2000,
      channel: "HoReCa",
      discoveryProfile: "WATER_CASH_VAN",
      waterTargetTypes: ["MOSQUES", "SUPERMARKETS_GROCERIES"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(query, /place_of_worship/);
  assert.match(query, /supermarket/);
  assert.doesNotMatch(query, /tourism="hotel"/);
  assert.match(query, /out center 40/);
});
