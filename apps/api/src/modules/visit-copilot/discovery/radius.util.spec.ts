import { strict as assert } from "node:assert";
import test from "node:test";
import { isWithinDiscoveryRadius } from "./radius.util";

const center = { lat: 24.7136, lon: 46.6753 };
const earthRadiusMeters = 6_371_000;
const pointNorthAt = (meters: number) => ({
  lat: center.lat + (meters / earthRadiusMeters) * (180 / Math.PI),
  lon: center.lon,
});

for (const radiusMeters of [1000, 2000, 5000]) {
  test(`discovery final filter keeps only results inside ${radiusMeters / 1000} km`, () => {
    assert.equal(isWithinDiscoveryRadius(center, pointNorthAt(radiusMeters), radiusMeters), true);
    assert.equal(isWithinDiscoveryRadius(center, pointNorthAt(radiusMeters + 1), radiusMeters), false);
  });
}
