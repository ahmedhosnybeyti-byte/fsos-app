import { strict as assert } from "node:assert";
import test from "node:test";
import { GooglePlacesProvider } from "./google-places.provider";

test("Google Nearby Search sends the selected circle and channel types as a hard restriction", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  let requestUrl = "";
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
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
  assert.equal(requestUrl, "https://places.googleapis.com/v1/places:searchNearby");
  assert.deepEqual(requestBody?.includedPrimaryTypes, ["restaurant", "cafe", "coffee_shop", "hotel"]);
  assert.equal("includedTypes" in (requestBody ?? {}), false);
  assert.equal(requestBody?.rankPreference, "DISTANCE");
  assert.equal("locationBias" in (requestBody ?? {}), false);
});

test("Google Nearby Search maps every rep channel to only its supported primary types", async () => {
  const originalFetch = globalThis.fetch;
  const requestTypes: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { includedPrimaryTypes?: unknown };
    requestTypes[currentChannel] = body.includedPrimaryTypes;
    return new Response(JSON.stringify({ places: [] }), { status: 200 });
  };
  let currentChannel = "";
  try {
    for (const channel of ["traditional", "modern", "horeca", "wholesale"]) {
      currentChannel = channel;
      await new GooglePlacesProvider("test-key").search({ lat: 21.4858, lon: 39.1925, radiusMeters: 5000, channel });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requestTypes.traditional, ["grocery_store", "convenience_store", "supermarket"]);
  assert.deepEqual(requestTypes.modern, ["supermarket", "hypermarket", "discount_supermarket"]);
  assert.deepEqual(requestTypes.horeca, ["restaurant", "cafe", "coffee_shop", "hotel"]);
  assert.deepEqual(requestTypes.wholesale, ["wholesaler", "warehouse_store"]);
});

test("Google drops a place whose primary activity is outside the rep channel", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ places: [
    { id: "grocery", displayName: { text: "Grocery" }, primaryType: "grocery_store", location: { latitude: 21.48, longitude: 39.19 } },
    { id: "electronics", displayName: { text: "Electronics" }, primaryType: "electronics_store", location: { latitude: 21.48, longitude: 39.19 } },
  ] }), { status: 200 });
  try {
    const result = await new GooglePlacesProvider("test-key").search({ lat: 21.4858, lon: 39.1925, radiusMeters: 5000, channel: "traditional" });
    assert.deepEqual(result.places.map((place) => place.externalKey), ["grocery"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
