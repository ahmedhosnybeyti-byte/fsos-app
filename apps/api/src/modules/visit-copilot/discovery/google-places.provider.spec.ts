import { strict as assert } from "node:assert";
import test from "node:test";
import { GooglePlacesProvider } from "./google-places.provider";
import { visitCopilotGoogleSearchRequestSchema } from "@field-sales-os/schemas";

test("Water Cash Van discovery requires at least one target type while legacy requests remain valid", () => {
  assert.equal(visitCopilotGoogleSearchRequestSchema.safeParse({ lat: 24.7, lon: 46.6, radiusMeters: 2000 }).success, true);
  assert.equal(visitCopilotGoogleSearchRequestSchema.safeParse({ lat: 24.7, lon: 46.6, radiusMeters: 2000, discoveryProfile: "WATER_CASH_VAN", waterTargetTypes: [] }).success, false);
  const parsed = visitCopilotGoogleSearchRequestSchema.parse({ lat: 24.7, lon: 46.6, radiusMeters: 2000, discoveryProfile: "WATER_CASH_VAN", waterTargetTypes: ["RESTAURANTS"] });
  assert.deepEqual(parsed.waterTargetTypes, ["RESTAURANTS"]);
});

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

test("Water Cash Van uses one Nearby Search with selected primary types and no Text Search path", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url, body });
    const places = Array.from({ length: 20 }, (_, index) => ({
      id: index < 2 ? "shared" : `nearby-${index}`,
      displayName: { text: `Place ${index}` },
      primaryType: index === 0 ? "catering_service" : "manufacturer",
      location: { latitude: 24.7 + index * 0.00001, longitude: 46.6 },
    }));
    return new Response(JSON.stringify({ places }), { status: 200 });
  };

  try {
    const result = await new GooglePlacesProvider("test-key").search({
      lat: 24.7,
      lon: 46.6,
      radiusMeters: 2000,
      channel: "Cash Van",
      discoveryProfile: "WATER_CASH_VAN",
      waterTargetTypes: ["CATERING", "FACTORIES"],
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://places.googleapis.com/v1/places:searchNearby");
    assert.deepEqual((requests[0]?.body.includedPrimaryTypes as string[]).sort(), ["catering_service", "manufacturer"]);
    assert.equal(requests[0]?.body.maxResultCount, 20);
    assert.equal(requests[0]?.body.rankPreference, "DISTANCE");
    assert.equal(new Set(result.places.map((place) => place.externalKey)).size, result.places.length);
    assert.equal(result.places.length, 19);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
