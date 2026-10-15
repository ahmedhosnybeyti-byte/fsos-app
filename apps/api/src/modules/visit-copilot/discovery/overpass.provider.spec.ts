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

test("Water Cash Van Overpass excludes clinics and residences and classifies events and sports", async () => {
  const originalFetch = globalThis.fetch;
  let query = "";
  globalThis.fetch = async (_input, init) => {
    query = decodeURIComponent(String(init?.body).replace(/^data=/, ""));
    return new Response(JSON.stringify({ elements: [
      { type: "node", id: 1, lat: 24.7, lon: 46.6, tags: { name: "Hospital", amenity: "hospital" } },
      { type: "node", id: 2, lat: 24.7, lon: 46.6, tags: { name: "Dental Clinic", amenity: "clinic", healthcare: "dentist" } },
      { type: "way", id: 3, center: { lat: 24.7, lon: 46.6 }, tags: { name: "Private Apartment", building: "apartments" } },
      { type: "node", id: 4, lat: 24.7, lon: 46.6, tags: { name: "Wedding Venue", amenity: "events_venue" } },
      { type: "node", id: 5, lat: 24.7, lon: 46.6, tags: { name: "Sports Club", leisure: "sports_centre" } },
    ] }), { status: 200 });
  };
  try {
    const result = await new OverpassProvider().search({
      lat: 24.7,
      lon: 46.6,
      radiusMeters: 2000,
      channel: "Cash Van",
      discoveryProfile: "WATER_CASH_VAN",
      waterTargetTypes: ["MEDICAL", "WEDDING_EVENTS", "GYMS_SPORTS_CLUBS"],
    });
    assert.match(query, /amenity="hospital"/);
    assert.doesNotMatch(query, /clinic/);
    assert.doesNotMatch(query, /apartments|residential/);
    assert.deepEqual(result.places.map((place) => [place.externalKey, place.businessType]), [
      ["osm-node-1", "MEDICAL"],
      ["osm-node-4", "WEDDING_EVENTS"],
      ["osm-node-5", "GYMS_SPORTS_CLUBS"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
